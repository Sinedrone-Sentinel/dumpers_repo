import {
  computeBlueprintEffectiveModifiers,
  type BlueprintForEffectiveStats,
} from './blueprintEffectiveStats'
import {
  applyArmorMitigationBonus,
  canonicalStatKey,
  isArmorDamageTakenStat,
} from './qualityModifiers'

export interface PortAccept {
  type: string
  subtypes: string[]
}

export interface MissileMount {
  name: string
  minSize: number
  maxSize: number
  locked?: boolean
  kind?: 'missile' | 'torpedo' | 'bomb'
  defaultEntityClass?: string
  child?: { name: string; defaultEntityClass: string }
  portTags?: string
  requiredTags?: string
  accepts?: PortAccept[]
}

export interface ShipItemStats {
  entityClass: string
  displayName: string
  kind: string
  size: number
  manufacturer?: string | null
  weaponClass?: string | null
  damageType?: string | null
  tags?: string
  requiredTags?: string
  mounts?: MissileMount[]
  itemClass?: string | null
  grade?: string | null
  guidance?: string | null
  ordnance?: 'missile' | 'torpedo' | 'bomb' | null
  attachType?: string
  attachSubType?: string
  stats: Record<string, number>
  burstDps: number
}

/** A catalog row with no usable numbers is a file stub, not an item a ship can mount. */
export function itemIsEquippable(item: ShipItemStats): boolean {
  const stats = item.stats || {}
  if (item.kind === 'weapon') {
    if ((stats.Power_Segments || 0) > 0) return true
    const damage = stats.Weapon_Damage || 0
    if (damage <= 0) return false
    return (stats.Weapon_Firerate || 0) > 0 || (stats.Weapon_RegenPerSec || 0) > 0 || (stats.Weapon_CapacitorShots || 0) > 0
  }
  if (item.kind === 'missile') return (stats.Missile_Damage || stats.Weapon_Damage || 0) > 0
  if (item.kind === 'shield') return (stats.Shield_Maxhealth || 0) > 0
  if (item.kind === 'cooler') return (stats.Itemresource_Coolantgeneration || 0) > 0
  if (item.kind === 'power') return (stats.Itemresource_Powergeneration || 0) > 0
  if (item.kind === 'quantum') return (stats.Quantum_Speed || 0) > 0
  if (item.kind === 'flight') return (stats.Flight_Pitch || 0) > 0 || (stats.Flight_ScmSpeed || 0) > 0
  if (item.kind === 'missileRack') return (item.mounts?.length || 0) > 0
  if (item.kind === 'weaponMount') return true
  if (item.kind === 'tractor' || item.kind === 'qed') return (stats.Power_Segments || 0) > 0
  if (item.kind === 'life') return (stats.Power_Segments || 0) > 0
  return Object.keys(stats).length > 0
}

export interface FittedPart {
  entityClass: string
  source: 'stock' | 'crafted'
  qualities?: Record<number, number>
}

function roundsPerSecond(stats: Record<string, number>): number {
  const shots = stats.Weapon_CycleShots || 0
  const seconds = stats.Weapon_CycleSeconds || 0
  if (shots > 0 && seconds > 0) return shots / seconds
  const rate = stats.Weapon_Firerate || 0
  return rate > 0 ? rate / 60 : 0
}

/** Burst damage per second. A sequenced gun uses its own shot waits before the fire rate. */
export function weaponBurstDps(stats: Record<string, number> | null | undefined): number {
  if (!stats) return 0
  const damage = stats.Weapon_Damage || 0
  const rate = stats.Weapon_Firerate || 0
  const pellets = stats.Weapon_Pellets || 1
  if (damage <= 0) return 0
  const cycleShots = stats.Weapon_CycleShots || 0
  const cycleSeconds = stats.Weapon_CycleSeconds || 0
  if (cycleShots > 0 && cycleSeconds > 0) return (damage * pellets * cycleShots) / cycleSeconds
  const rpmInterval = rate > 0 ? 60 / rate : 0
  const charge = (stats.Weapon_ChargeTime || 0) + (stats.Weapon_CooldownTime || 0) + (stats.Weapon_SequenceDelay || 0)
  if (charge <= 0) {
    if (rate <= 0) return 0
    return (damage * pellets * rate) / 60
  }
  const interval = Math.max(rpmInterval, charge)
  if (interval <= 0) return 0
  return (damage * pellets) / interval
}

/** Burst, reduced by the shots that land before the heat cap and the cool-down after. Energy guns also follow capacitor regen. */
export function weaponSustainedDps(stats: Record<string, number> | null | undefined, powerFraction = 1): number {
  const burst = weaponBurstDps(stats)
  if (!burst || !stats) return 0
  const fraction = Math.max(0, Math.min(1, powerFraction))
  if (fraction <= 0) return 0
  let sustained = burst
  const heat = stats.Weapon_HeatPerShot || 0
  const overheat = stats.Weapon_Overheat || 0
  const firing = roundsPerSecond(stats)
  if (heat && firing && overheat) {
    const timeHot = overheat / (heat * firing)
    const downtime = stats.Weapon_OverheatFix || (stats.Weapon_Cooling ? overheat / stats.Weapon_Cooling : 0)
    if (downtime && timeHot > 0) {
      const shots = Math.ceil(overheat / heat - 1e-9)
      sustained = (burst * shots) / (firing * (timeHot + downtime))
    }
  }
  const regenCap = stats.Weapon_RegenPerSec || 0
  const energy = stats.Weapon_Damage_Energy || 0
  if (regenCap > 0 && energy > 0) {
    const regen = regenCap * fraction
    const perShot = stats.Weapon_Damage || 0
    sustained = Math.min(sustained, perShot * regen)
  }
  return sustained
}

function matchingStatKey(stats: Record<string, number>, property: string): string | null {
  if (Object.prototype.hasOwnProperty.call(stats, property)) return property
  const lower = property.toLowerCase()
  for (const key of Object.keys(stats)) {
    if (key.toLowerCase() === lower) return key
  }
  return null
}

export function applyCraftedStats(
  stats: Record<string, number>,
  blueprint: BlueprintForEffectiveStats | null | undefined,
  qualities?: Record<number, number> | null,
): Record<string, number> {
  if (!blueprint) return { ...stats }
  const next = { ...stats }
  for (const mod of computeBlueprintEffectiveModifiers(blueprint, qualities)) {
    let key = matchingStatKey(next, mod.property)
    if (!key) {
      if (mod.finalValue == null) continue
      key = canonicalStatKey(mod.property)
      next[key] = mod.finalValue
      continue
    }
    let value = next[key]
    if (isArmorDamageTakenStat(mod.property)) {
      value = applyArmorMitigationBonus(value, mod.percentChange)
    } else if (mod.combinedModifier !== 1) {
      value *= mod.combinedModifier
    }
    if (mod.additiveChange) value += mod.additiveChange
    next[key] = value
  }
  return next
}

export function effectivePartStats(
  item: ShipItemStats,
  source: FittedPart['source'],
  blueprint: BlueprintForEffectiveStats | null | undefined,
  qualities?: Record<number, number> | null,
): Record<string, number> {
  if (source !== 'crafted' || !blueprint) return { ...item.stats }
  return applyCraftedStats(item.stats, blueprint, qualities)
}

export function compareToStock(
  current: number | null | undefined,
  stock: number | null | undefined,
  lowerIsBetter = false,
): 'up' | 'down' | 'same' {
  if (current == null || stock == null || !Number.isFinite(current) || !Number.isFinite(stock)) return 'same'
  const delta = Math.round(current * 100) - Math.round(stock * 100)
  if (delta === 0) return 'same'
  const higher = delta > 0
  if (lowerIsBetter) return higher ? 'down' : 'up'
  return higher ? 'up' : 'down'
}

/** Cut a shop figure off at one decimal. Whole numbers stay whole. Does not round. */
export function formatShopNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const negative = value < 0
  const scaled = Math.trunc(Math.abs(value) * 10 + 1e-8)
  const whole = Math.trunc(scaled / 10)
  const tenth = scaled % 10
  const body = tenth === 0 ? whole.toLocaleString() : `${whole.toLocaleString()}.${tenth}`
  return negative && scaled !== 0 ? `−${body}` : body
}

/** Armor signature multipliers are stored as the percent change from 1. */
export function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const text = formatShopNumber(value)
  if (text === '—' || text === '0') return '0%'
  return `${value > 0 ? '+' : ''}${text}%`
}

function compactNumber(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null
  return formatShopNumber(value)
}

/** Weapon columns, in plain labels. Missiles are not part of DPS. */
export function weaponStatBits(stats: Record<string, number>): string[] {
  const bits: string[] = []
  const push = (label: string, value: number | undefined) => {
    const text = compactNumber(value)
    if (text) bits.push(`${label} ${text}`)
  }
  push('DPS', weaponBurstDps(stats))
  push('Sustained', weaponSustainedDps(stats))
  push('Alpha', stats.Weapon_Damage)
  push('Pen', stats.Weapon_Penetration)
  push('Rate', stats.Weapon_Firerate)
  push('Range', stats.Weapon_Range)
  push('Speed', stats.Weapon_Speed)
  push('Spread', stats.Weapon_Spread)
  push('Power', stats.Weapon_Power)
  push('EM', stats.Weapon_Em)
  push('Ammo', stats.Weapon_Ammo)
  push('HP', stats.Health_Maxhealth)
  return bits
}

export function partStatLine(kind: string, stats: Record<string, number>, scale = 1): string {
  const round = (value: number) => formatShopNumber(value)
  if (kind === 'weapon') {
    const burst = weaponBurstDps(stats)
    const alpha = stats.Weapon_Damage || 0
    if (burst <= 0 && alpha <= 0) return ''
    const parts = []
    if (burst > 0) {
      parts.push(`${round(burst)} burst`)
      parts.push(`${round(weaponSustainedDps(stats))} sustained`)
    }
    if (alpha > 0) parts.push(`${round(alpha)} alpha`)
    return parts.join(' · ')
  }
  if (kind === 'missile') {
    const damage = stats.Missile_Damage || stats.Weapon_Damage || 0
    return damage > 0 ? `${round(damage)} damage` : ''
  }
  if (kind === 'shield') {
    const regen = shieldRegenRate(stats, scale)
    const charge = shieldFullChargeSeconds(stats, scale)
    const parts = [
      stats.Shield_Maxhealth ? `${round(stats.Shield_Maxhealth)} HP` : '',
      stats.Shield_Regen ? `${round(regen)}/s` : '',
      stats.Shield_Maxhealth && stats.Shield_Regen ? `full charge ${charge == null ? '—' : `${formatShopNumber(charge)}s`}` : '',
      stats.Shield_DamagedRegenDelay ? `damaged ${formatShopNumber(stats.Shield_DamagedRegenDelay)}s` : '',
      stats.Shield_DownedRegenDelay ? `downed ${formatShopNumber(stats.Shield_DownedRegenDelay)}s` : '',
    ].filter(Boolean)
    return parts.join(' · ')
  }
  if (kind === 'armor') {
    const hp = stats.Armor_Health || stats.Health_Maxhealth || 0
    return hp > 0 ? `${round(hp)} HP` : ''
  }
  if (kind === 'power' && stats.Itemresource_Powergeneration) {
    return `${round(stats.Itemresource_Powergeneration)} pips`
  }
  if (kind === 'cooler' && stats.Itemresource_Coolantgeneration) {
    const min = stats.Power_Min || 1
    const max = stats.Power_Segments || min
    return `${round(stats.Itemresource_Coolantgeneration)} coolant · ${min}–${max} pips`
  }
  if (kind === 'quantum' && stats.Quantum_Speed) {
    return formatQuantumSpeed(stats.Quantum_Speed)
  }
  if (kind === 'flight' && (stats.Flight_Pitch || stats.Flight_ScmSpeed)) {
    const bits = [
      stats.Flight_ScmSpeed ? `SCM ${round(stats.Flight_ScmSpeed)}` : '',
      stats.Flight_BoostSpeed ? `Boost ${round(stats.Flight_BoostSpeed)}` : '',
      stats.Flight_BoostBackward ? `Reverse ${round(stats.Flight_BoostBackward)}` : '',
      stats.Flight_MaxSpeed ? `NAV ${round(stats.Flight_MaxSpeed)}` : '',
      stats.Flight_Pitch ? `Pitch ${round(stats.Flight_Pitch)}` : '',
      stats.Flight_Yaw ? `Yaw ${round(stats.Flight_Yaw)}` : '',
      stats.Flight_Roll ? `Roll ${round(stats.Flight_Roll)}` : '',
    ].filter(Boolean)
    return bits.join(' · ')
  }
  if (kind === 'radar' && stats.Radar_DistanceMax) {
    const min = stats.Radar_DistanceMin || stats.Radar_DistanceMax
    const minPips = stats.Power_Min || 1
    const maxPips = stats.Power_Segments || stats.Power_HighStart || minPips
    return `${round(min)}–${round(stats.Radar_DistanceMax)} m · ${minPips}–${maxPips} pips`
  }
  if (kind === 'life') return stats.Power_Segments ? `${round(stats.Power_Segments)} pips` : ''
  return ''
}

/** Tube size and count for a rack, such as S1 x 8. */
export function rackLoadLine(mounts: MissileMount[] | undefined): string {
  const groups = new Map<string, number>()
  const order: string[] = []
  for (const mount of mounts || []) {
    const max = mount.maxSize || mount.minSize
    const min = mount.minSize || max
    if (!max) continue
    const label = min && min !== max ? `S${min}–S${max}` : `S${max}`
    if (!groups.has(label)) {
      groups.set(label, 0)
      order.push(label)
    }
    groups.set(label, (groups.get(label) || 0) + 1)
  }
  return order.map((label) => `${label} x ${groups.get(label)}`).join(' · ')
}

/** Guidance (EM, IR, or CS) sits with the missile's damage. */
export function missileTypeLine(stats: Record<string, number>, guidance?: string | null): string {
  const damage = partStatLine('missile', stats)
  const type = guidance?.trim()
  if (!type) return damage
  return damage ? `${damage} · ${type}` : type
}

/** Blades that share a tag are one ship family. Untagged blades stay with their own controller name. */
export function flightBladeFamily(entityClass: string, tags?: string | null, requiredTags?: string | null): string {
  const tag = `${tags || ''} ${requiredTags || ''}`
    .split(/\s+/)
    .map((entry) => entry.replace(/^\$/, ''))
    .find(Boolean)
  if (tag) return tag.toLowerCase()
  return entityClass
    .toLowerCase()
    .replace(/(?:_flight)?_blade_(?:hnd|spd)$/, '')
    .replace(/_mm(?:_[a-z0-9]+)+$/, '')
}

/** Stock blade, or Handling / Speed when the file name or the numbers say so. */
export function flightRole(item: ShipItemStats, stock: ShipItemStats | null | undefined): string {
  if (stock && item.entityClass === stock.entityClass) return 'Stock'
  const key = item.entityClass.toLowerCase()
  if (/_hnd|agility|_phb|handling/.test(key)) return 'Handling'
  if (/_spd|speed|_tsb/.test(key)) return 'Speed'
  if (!stock) return 'Stock'
  const scm = (item.stats.Flight_ScmSpeed || 0) - (stock.stats.Flight_ScmSpeed || 0)
  const nav = (item.stats.Flight_MaxSpeed || 0) - (stock.stats.Flight_MaxSpeed || 0)
  const pitch = (item.stats.Flight_Pitch || 0) - (stock.stats.Flight_Pitch || 0)
  const yaw = (item.stats.Flight_Yaw || 0) - (stock.stats.Flight_Yaw || 0)
  if (scm + nav > pitch + yaw && scm + nav > 0) return 'Speed'
  if (pitch + yaw > scm + nav && pitch + yaw > 0) return 'Handling'
  return 'Alternate'
}

/** Quantum drive speed is stored in metres per second. Large drives read as megametres per second. */
export function formatQuantumSpeed(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value <= 0) return '0'
  if (value >= 1_000_000) {
    const mega = value / 1_000_000
    return `${formatShopNumber(mega)} Mm/s`
  }
  return `${formatShopNumber(value)} m/s`
}

export interface ShipSnapshotNumbers {
  burstDps: number
  sustainedDps: number
  missileVolley: number
  shieldHp: number
  shieldRegen: number
  armorHp: number
  physicalReduction: number | null
  energyReduction: number | null
  deflectionPhysical: number | null
  deflectionEnergy: number | null
  signalEm: number | null
  signalIr: number | null
  signalCs: number | null
  damageReduction: number | null
  hullHp: number | null
  noise: number
  decoy: number
  quantumSpeed: number | null
  scmSpeed: number | null
  boostSpeed: number | null
  reverseSpeed: number | null
  navSpeed: number | null
  radarRange: number | null
  signatureEm: number
  signatureIr: number
  signatureCs: number | null
  coolant: number
  coolantDemand: number
  coolantRatio: number
  pitch: number | null
  yaw: number | null
  roll: number | null
}

export function emptySnapshot(ship?: {
  damageReduction?: number | null
  hullHp?: number | null
  noise?: number | null
  decoy?: number | null
  crossSection?: number | null
  pitch?: number | null
  yaw?: number | null
  roll?: number | null
  scmSpeed?: number | null
  boostSpeed?: number | null
  maxSpeed?: number | null
} | null): ShipSnapshotNumbers {
  return {
    burstDps: 0,
    sustainedDps: 0,
    missileVolley: 0,
    shieldHp: 0,
    shieldRegen: 0,
    armorHp: 0,
    physicalReduction: null,
    energyReduction: null,
    deflectionPhysical: null,
    deflectionEnergy: null,
    signalEm: null,
    signalIr: null,
    signalCs: null,
    damageReduction: ship?.damageReduction ?? null,
    hullHp: ship?.hullHp ?? null,
    noise: ship?.noise ?? 0,
    decoy: ship?.decoy ?? 0,
    quantumSpeed: null,
    scmSpeed: null,
    boostSpeed: null,
    reverseSpeed: null,
    navSpeed: null,
    radarRange: null,
    signatureEm: 0,
    signatureIr: 0,
    signatureCs: ship?.crossSection ?? null,
    coolant: 0,
    coolantDemand: 0,
    coolantRatio: 0,
    pitch: null,
    yaw: null,
    roll: null,
  }
}

export function addPartToSnapshot(
  snapshot: ShipSnapshotNumbers,
  kind: string,
  stats: Record<string, number>,
  scale = 1,
): void {
  if (kind === 'weapon') {
    snapshot.burstDps += weaponBurstDps(stats) * (scale > 0 ? 1 : 0)
    snapshot.sustainedDps += Math.round(weaponSustainedDps(stats, scale))
  }
  if (kind === 'missile') snapshot.missileVolley += stats.Missile_Damage || stats.Weapon_Damage || 0
  if (kind === 'shield') {
    snapshot.shieldHp += stats.Shield_Maxhealth || 0
    snapshot.shieldRegen += shieldRegenRate(stats, scale)
  }
  if (kind === 'armor') {
    snapshot.armorHp += stats.Armor_Health || stats.Health_Maxhealth || 0
    if (typeof stats.Armor_PhysicalReduction === 'number') snapshot.physicalReduction = stats.Armor_PhysicalReduction
    if (typeof stats.Armor_EnergyReduction === 'number') snapshot.energyReduction = stats.Armor_EnergyReduction
    if (typeof stats.Armor_DeflectionPhysical === 'number') snapshot.deflectionPhysical = stats.Armor_DeflectionPhysical
    if (typeof stats.Armor_DeflectionEnergy === 'number') snapshot.deflectionEnergy = stats.Armor_DeflectionEnergy
    if (typeof stats.Armor_SignalEm === 'number') snapshot.signalEm = stats.Armor_SignalEm
    if (typeof stats.Armor_SignalIr === 'number') snapshot.signalIr = stats.Armor_SignalIr
    if (typeof stats.Armor_SignalCs === 'number') snapshot.signalCs = stats.Armor_SignalCs
  }
  if (kind === 'flight') {
    if (stats.Flight_Pitch) snapshot.pitch = stats.Flight_Pitch
    if (stats.Flight_Yaw) snapshot.yaw = stats.Flight_Yaw
    if (stats.Flight_Roll) snapshot.roll = stats.Flight_Roll
    if (stats.Flight_ScmSpeed) snapshot.scmSpeed = stats.Flight_ScmSpeed
    if (stats.Flight_BoostSpeed) snapshot.boostSpeed = stats.Flight_BoostSpeed
    if (stats.Flight_BoostBackward) snapshot.reverseSpeed = stats.Flight_BoostBackward
    if (stats.Flight_MaxSpeed) snapshot.navSpeed = stats.Flight_MaxSpeed
  }
  if (kind === 'quantum' && stats.Quantum_Speed) {
    snapshot.quantumSpeed = Math.max(snapshot.quantumSpeed || 0, stats.Quantum_Speed)
  }
}

export interface PowerBlock {
  size: number
  portId: string | null
  /** First block of a component that follows another component in the same group. */
  groupStart?: boolean
  /** Above the pips this stack needs for full power. Shown, but not assignable. */
  disabled?: boolean
}

export interface PowerColumn {
  id: string
  label: string
  blocks: PowerBlock[]
  /** Pips required for full output. Weapons can need more than the ship's pool. */
  fullPower?: number
}

export interface PowerPart {
  portId: string
  kind: string
  size: number
  stats: Record<string, number>
}

const POWER_GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: 'engines', label: 'Engines', kinds: ['flight'] },
  { id: 'shields', label: 'Shields', kinds: ['shield'] },
  { id: 'quantum', label: 'Quantum', kinds: ['quantum'] },
  { id: 'interdiction', label: 'Interdiction', kinds: ['qed'] },
  { id: 'tractor', label: 'Tractor', kinds: ['tractor'] },
  { id: 'towing', label: 'Towing', kinds: ['towing'] },
  { id: 'mining', label: 'Mining', kinds: ['mining'] },
  { id: 'radar', label: 'Radar', kinds: ['radar'] },
  { id: 'life', label: 'Life support', kinds: ['life'] },
  { id: 'coolers', label: 'Coolers', kinds: ['cooler'] },
]

/**
 * Pips a component draws. Segment items use that consumption. A standard-unit
 * item, such as a quantum drive, uses its power draw. Otherwise the full-power band.
 */
export function pipDemand(stats: Record<string, number>): number {
  if (stats.Power_Segments > 0) return stats.Power_Segments
  const rated = stats.Weapon_Power || 0
  if (rated > 0) return Math.ceil(Math.round(rated * 1000) / 1000)
  return stats.Power_HighStart || stats.Power_MedStart || stats.Power_LowStart || 0
}

/** Shield face refill per second. `scale` is already the pip fraction times the band. */
export function shieldRegenRate(stats: Record<string, number> | null | undefined, scale = 1): number {
  if (!stats) return 0
  return (stats.Shield_Regen || 0) * Math.max(0, scale)
}

/** Shield factor: assigned pips divided by the item's segments, times that band. */
export function shieldPowerFactor(stats: Record<string, number>, assigned: number): number {
  const units = stats.Power_Segments || 0
  if (assigned <= 0 || units <= 0) return 0
  const pips = Math.min(assigned, units)
  return (pips / units) * segmentScale(stats, pips)
}

/** Seconds to fill the shield pool at the current regen. Null when the generator is off. */
export function shieldFullChargeSeconds(stats: Record<string, number> | null | undefined, scale = 1): number | null {
  const regen = shieldRegenRate(stats, scale)
  const hp = stats?.Shield_Maxhealth || 0
  if (regen <= 0 || hp <= 0) return null
  return hp / regen
}

/** Output multiplier for the pips actually given to one component. */
export function segmentScale(stats: Record<string, number>, assigned: number): number {
  const demand = pipDemand(stats)
  if (demand <= 0) return 1
  if (assigned <= 0) return 0
  const bands = [
    { start: stats.Power_HighStart, mod: stats.Power_HighMod },
    { start: stats.Power_MedStart, mod: stats.Power_MedMod },
    { start: stats.Power_LowStart, mod: stats.Power_LowMod },
  ].filter((band) => typeof band.start === 'number' && typeof band.mod === 'number')
  if (bands.length === 0) return 1
  const hit = bands.filter((band) => assigned >= (band.start as number)).sort((a, b) => (b.start as number) - (a.start as number))[0]
  return hit ? (hit.mod as number) : 0
}

function weaponPowerSum(parts: PowerPart[]): number {
  return parts.reduce((total, part) => {
    if (part.kind !== 'weapon') return total
    return total + Math.max(0, part.stats.Weapon_Power || 0)
  }, 0)
}

/**
 * Pips the fitted guns need for full power. Each gun's draw is summed, then
 * rounded up, so 1.3 pips takes 2. The ship's weapon pool is only the stack size.
 */
export function weaponFullPips(parts: PowerPart[]): number {
  const sum = weaponPowerSum(parts)
  if (sum <= 0) return 0
  return Math.ceil(Math.round(sum * 1000) / 1000)
}

/**
 * Power the guns draw at the assigned pips. A full stack still draws the power
 * sum, so four 0.1 guns on their one pip count as 0.4, not 1.
 */
export function weaponPowerDraw(parts: PowerPart[], selected: number): number {
  const full = weaponFullPips(parts)
  if (full <= 0 || selected <= 0) return 0
  return weaponPowerSum(parts) * (Math.min(selected, full) / full)
}

/** Pips past `full` stay on the stack and cannot be assigned. */
function disableAbove(blocks: PowerBlock[], full: number): PowerBlock[] {
  let cursor = 0
  return blocks.map((block) => {
    const disabled = cursor >= full
    cursor += block.size
    return disabled ? { ...block, disabled: true } : block
  })
}

export function powerColumns(weaponPowerPool: number, parts: PowerPart[]): PowerColumn[] {
  const columns: PowerColumn[] = []
  if (weaponPowerPool > 0) {
    const full = weaponFullPips(parts)
    columns.push({
      id: 'weapons',
      label: 'Weapons',
      fullPower: full,
      blocks: disableAbove(
        Array.from({ length: weaponPowerPool }, () => ({ size: 1, portId: null })),
        full,
      ),
    })
  }
  for (const group of POWER_GROUPS) {
    const members = parts.filter((part) => group.kinds.includes(part.kind) && pipDemand(part.stats) > 0)
    if (members.length === 0) continue
    const blocks: PowerBlock[] = []
    members.forEach((part, memberIndex) => {
      const max = pipDemand(part.stats)
      const publishedMin = part.stats.Power_Min || 0
      const min = publishedMin > 0
        ? Math.min(max, Math.max(1, publishedMin))
        : (!(part.stats.Power_Segments > 0) && (part.stats.Weapon_Power || 0) > 0 ? max : Math.min(max, 1))
      const gap = memberIndex > 0
      const partBlocks: PowerBlock[] = []
      if (min > 1) {
        partBlocks.push({ size: min, portId: part.portId, groupStart: gap })
        for (let index = min; index < max; index += 1) partBlocks.push({ size: 1, portId: part.portId })
      } else {
        for (let index = 0; index < max; index += 1) {
          partBlocks.push({ size: 1, portId: part.portId, groupStart: gap && index === 0 })
        }
      }
      blocks.push(...disableAbove(partBlocks, max))
    })
    columns.push({ id: group.id, label: group.label, blocks })
  }
  return columns
}

/** Pips that can still be assigned. Blocks above full power are left out. */
export function assignableTotal(blocks: PowerBlock[]): number {
  return blocks.reduce((sum, block) => sum + (block.disabled ? 0 : block.size), 0)
}

export function columnTotal(column: PowerColumn): number {
  return column.blocks.reduce((sum, block) => sum + block.size, 0)
}

export function columnSelected(column: PowerColumn, stored: number | undefined): number {
  const total = columnTotal(column)
  if (stored == null || !Number.isFinite(stored)) return total
  return Math.max(0, Math.min(total, Math.round(stored)))
}

/** Aim assist is the minimum distance plus the span times pip fraction times the band. */
export function radarRangeForPips(stats: Record<string, number>, assigned: number): number | null {
  if (!stats.Radar_DistanceMax || assigned <= 0) return null
  const units = stats.Power_Segments || 1
  const pips = Math.min(assigned, units)
  const minimum = Math.min(units, Math.max(1, stats.Power_Min || 1))
  if (pips < minimum) return null
  const minDistance = stats.Radar_DistanceMin || stats.Radar_DistanceMax
  const span = Math.max(0, stats.Radar_DistanceMax - minDistance)
  return minDistance + span * (pips / units) * segmentScale(stats, pips)
}

/**
 * Installed plants are not added together.
 * For n plants the budget is round(each / n), plus (n - 1) times each plant's size.
 * One plant contributes its own generation.
 */
export function powerGenerated(parts: PowerPart[]): number {
  const plants = parts.filter((part) => part.kind === 'power' && (part.stats.Itemresource_Powergeneration || 0) > 0)
  const count = plants.length
  if (count === 0) return 0
  if (count === 1) return Math.round(plants[0].stats.Itemresource_Powergeneration)
  const rounded = plants.reduce((sum, plant) => sum + Math.round(plant.stats.Itemresource_Powergeneration / count), 0)
  const sizes = plants.reduce((sum, plant) => sum + (plant.size || 0), 0)
  return rounded + (count - 1) * sizes
}

/**
 * Split one component's blocks into columns of at most `limit` pip units.
 * A connected block stays whole. `limit` of 0 keeps a single column.
 */
export function wrapPipBlocks(blocks: PowerBlock[], limit: number): PowerBlock[][] {
  if (blocks.length === 0) return []
  if (limit <= 0) return [blocks]
  const columns: PowerBlock[][] = []
  let current: PowerBlock[] = []
  let height = 0
  for (const block of blocks) {
    const size = Math.max(1, block.size || 1)
    if (current.length > 0 && height + size > limit) {
      columns.push(current)
      current = []
      height = 0
    }
    current.push(block)
    height += size
  }
  if (current.length > 0) columns.push(current)
  return columns
}

/** One stack per fitted component. Weapons share a pool, so they stay on the column id. */
export function componentGroups(column: PowerColumn): { key: string, blocks: PowerBlock[] }[] {
  const groups: { key: string, blocks: PowerBlock[] }[] = []
  for (const block of column.blocks) {
    const key = block.portId || column.id
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.blocks.push(block)
    else groups.push({ key, blocks: [block] })
  }
  return groups
}

function groupTotal(blocks: PowerBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.size, 0)
}

/** Spread a legacy column total across its components, one pip layer at a time. */
function splitLegacyTotal(column: PowerColumn, total: number): Map<string, number> {
  const groups = componentGroups(column)
  const counts = new Map(groups.map((group) => [group.key, 0]))
  let left = Math.max(0, total)
  const depth = groups.reduce((max, group) => Math.max(max, group.blocks.length), 0)
  for (let rank = 0; rank < depth && left > 0; rank += 1) {
    for (const group of groups) {
      const block = group.blocks[rank]
      if (!block || left < block.size) continue
      counts.set(group.key, (counts.get(group.key) || 0) + block.size)
      left -= block.size
    }
  }
  return counts
}

/** Minimum draw for a column: the first block of each component, which is its minimum. */
export function columnMinimum(column: PowerColumn): number {
  const seen = new Set<string>()
  let total = 0
  for (const block of column.blocks) {
    const key = block.portId || column.id
    if (seen.has(key)) continue
    seen.add(key)
    if (block.disabled) continue
    total += block.size
  }
  return total
}

/**
 * Stock power leaves every component on its minimum block and leaves the quantum drive off.
 * Later groups are left short when the plant budget cannot cover every minimum.
 */
export function defaultPower(columns: PowerColumn[], generated: number): Record<string, number> {
  const next: Record<string, number> = {}
  let budget = Math.max(0, generated)
  for (const column of columns) {
    for (const group of componentGroups(column)) {
      if (column.id === 'quantum') {
        next[group.key] = 0
        continue
      }
      const first = group.blocks[0]
      const min = first && !first.disabled ? first.size : 0
      const take = Math.min(min, budget)
      next[group.key] = take
      budget -= take
    }
  }
  return next
}

/** Saved assignments stay, but the total in use cannot pass the plants' budget. */
export function resolvedPower(
  columns: PowerColumn[],
  stored: Record<string, number> | null | undefined,
  generated: number,
): Record<string, number> {
  const base = defaultPower(columns, generated)
  const cap = Math.max(0, generated)
  const legacy = new Map<string, Map<string, number>>()
  for (const column of columns) {
    const groups = componentGroups(column)
    const hasOwn = groups.some((group) => stored && stored[group.key] != null && group.key !== column.id)
    if (stored && stored[column.id] != null && !hasOwn && groups.some((group) => group.key !== column.id)) {
      legacy.set(column.id, splitLegacyTotal(column, stored[column.id]))
    }
  }
  const desired: Record<string, number> = {}
  for (const column of columns) {
    for (const group of componentGroups(column)) {
      const max = assignableTotal(group.blocks)
      let want = base[group.key] ?? 0
      if (stored && stored[group.key] != null) want = stored[group.key]
      else if (legacy.get(column.id)) want = legacy.get(column.id)?.get(group.key) || 0
      desired[group.key] = Math.min(max, Math.max(0, Math.round(want)))
    }
  }
  const rawSum = Object.values(desired).reduce((sum, value) => sum + value, 0)
  const source = stored && rawSum > cap ? base : desired
  let budget = cap
  const next: Record<string, number> = {}
  for (const column of columns) {
    for (const group of componentGroups(column)) {
      const want = Math.min(assignableTotal(group.blocks), Math.max(0, Math.round(source[group.key] ?? 0)))
      const take = Math.min(want, budget)
      next[group.key] = take
      budget -= take
    }
  }
  return next
}

/** Extra IR from a hot component. Zero when cooling covers the draw or the item's temperature signature is off. */
export function temperatureInfrared(stats: Record<string, number> | null | undefined, shortfall: number): number {
  if (!stats?.Temp_Enabled || !stats.Temp_IrPerDegree || shortfall <= 0) return 0
  const floor = stats.Temp_MinCooling || 0
  const ceiling = stats.Temp_Overheat || floor
  const temperature = floor + Math.min(1, shortfall) * Math.max(0, ceiling - floor)
  const infraredFloor = stats.Temp_IrMinimum || temperature
  if (temperature <= infraredFloor) return 0
  return (temperature - infraredFloor) * stats.Temp_IrPerDegree
}

const COOLING_BAND_KINDS = new Set(['shield', 'life', 'radar', 'quantum'])

function assignedPips(pips: Map<string, number>, portId: string): number {
  return Math.max(0, pips.get(portId) || 0)
}

/** Cooler output is rated generation times the pip fraction times that pip's band. */
export function coolerOutput(stats: Record<string, number>, assigned: number): number {
  const units = stats.Power_Segments || 0
  const rated = stats.Itemresource_Coolantgeneration || 0
  if (assigned <= 0 || units <= 0 || rated <= 0) return 0
  const pips = Math.min(assigned, units)
  return rated * (pips / units) * segmentScale(stats, pips)
}

/** Coolant the fitted coolers are making at their current pips. */
export function coolantSupply(parts: PowerPart[], pips: Map<string, number>): number {
  return parts.reduce((sum, part) => {
    if (part.kind !== 'cooler') return sum
    return sum + coolerOutput(part.stats, assignedPips(pips, part.portId))
  }, 0)
}

/**
 * Cooling load is the pips in use, plus another `pips * band` for shields,
 * life support, radar, and the quantum drive. Powered coolers also add their
 * own minimum once, on top of the pips assigned to them. Plants do not draw
 * coolant. Engines count the pips assigned to the flight blade. Weapons count
 * their power sum at the assigned share, not the rounded pip.
 */
export function coolantDemand(
  parts: PowerPart[],
  pips: Map<string, number>,
  weaponSelected = 0,
): number {
  let drawn = 0
  let extra = 0
  let coolerSelf = 0
  for (const part of parts) {
    if (part.kind === 'weapon' || part.kind === 'power' || part.kind === 'missile') continue
    const count = assignedPips(pips, part.portId)
    if (count <= 0) continue
    drawn += count
    if (part.kind === 'cooler') {
      const own = Math.min(count, Math.max(1, part.stats.Power_Min || 1))
      coolerSelf = coolerSelf === 0 ? own : Math.min(coolerSelf, own)
    }
    if (COOLING_BAND_KINDS.has(part.kind)) extra += count * segmentScale(part.stats, count)
  }
  drawn += coolerSelf
  drawn += weaponPowerDraw(parts, weaponSelected)
  return drawn + extra
}

function nominalEm(stats: Record<string, number>): number {
  return stats.Signature_Em || stats.Weapon_Em || stats.Signature_Electromagnetic || 0
}

/**
 * EM is the plant signature times how full the power budget is, plus each
 * powered part's signature times its pip fraction and band, then the armor multiplier.
 */
export function electromagneticSignature(
  parts: PowerPart[],
  pips: Map<string, number>,
  generated: number,
  weaponSelected: number,
  armorMultiplier: number,
): number {
  const weaponFull = weaponFullPips(parts)
  let drawn = 0
  for (const part of parts) {
    if (part.kind === 'weapon' || part.kind === 'power') continue
    drawn += assignedPips(pips, part.portId)
  }
  drawn += weaponPowerDraw(parts, weaponSelected)
  const ratio = generated > 0 ? drawn / generated : 0
  let total = 0
  const plants = parts.filter((part) => part.kind === 'power' && (part.stats.Itemresource_Powergeneration || 0) > 0)
  if (plants.length > 0 && ratio > 0) {
    const perPlant = Math.round(generated * ratio) / plants.length
    let plantEm = 0
    for (const plant of plants) {
      const nominal = nominalEm(plant.stats)
      if (nominal <= 0) continue
      const band = plant.stats.Power_Segments > 0 ? segmentScale(plant.stats, perPlant) : 1
      plantEm += nominal * (band || 1)
    }
    total += plantEm * ratio
  }
  if (weaponFull > 0 && weaponSelected > 0) {
    const share = Math.min(weaponSelected, weaponFull) / weaponFull
    for (const weapon of parts) {
      if (weapon.kind !== 'weapon') continue
      const nominal = nominalEm(weapon.stats)
      if (nominal <= 0) continue
      total += nominal * segmentScale(weapon.stats, weaponSelected) * share
    }
  }
  for (const part of parts) {
    if (part.kind === 'weapon' || part.kind === 'power') continue
    const count = assignedPips(pips, part.portId)
    const units = part.stats.Power_Segments || 0
    if (count <= 0 || units <= 0) continue
    const nominal = nominalEm(part.stats)
    if (nominal <= 0) continue
    total += nominal * segmentScale(part.stats, count) * (Math.min(count, units) / units)
  }
  return total * armorMultiplier
}

/**
 * IR comes from coolers only. Each cooler adds its nominal IR times the pip
 * fraction and band, and the whole sum is multiplied by the cooling ratio and armor.
 */
export function infraredSignature(
  parts: PowerPart[],
  pips: Map<string, number>,
  demand: number,
  supply: number,
  armorMultiplier: number,
): number {
  const ratio = supply > 0 ? Math.min(demand / supply, 1) : 0
  let total = 0
  for (const part of parts) {
    if (part.kind !== 'cooler') continue
    const count = assignedPips(pips, part.portId)
    const units = part.stats.Power_Segments || 0
    const nominal = part.stats.Signature_Ir || 0
    if (count <= 0 || units <= 0 || nominal <= 0) continue
    total += nominal * (Math.min(count, units) / units) * segmentScale(part.stats, count)
  }
  return total * ratio * armorMultiplier
}

export function powerUsed(_columns: PowerColumn[], stored: Record<string, number> | null | undefined): number {
  return Object.values(stored || {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

function bottomFlags(blocks: PowerBlock[], selected: number): boolean[] {
  let left = selected
  return blocks.map((block) => {
    if (left >= block.size) {
      left -= block.size
      return true
    }
    return false
  })
}

/** Click sets how high this column stays filled, using only unassigned pips plus pips this click releases. */
export function clickPowerColumn(blocks: PowerBlock[], selected: number, blockIndex: number, remaining: number): number {
  if (blockIndex < 0) return 0
  if (blocks[blockIndex]?.disabled) return selected
  const flags = bottomFlags(blocks, selected)
  let budget = remaining
  for (let index = blockIndex + 1; index < blocks.length; index += 1) {
    if (flags[index]) budget += blocks[index].size
  }
  const next = blocks.map(() => false)
  for (let index = 0; index <= blockIndex && index < blocks.length; index += 1) {
    if (blocks[index].disabled) break
    if (flags[index]) {
      next[index] = true
      continue
    }
    if (blocks[index].size <= budget) {
      budget -= blocks[index].size
      next[index] = true
    } else break
  }
  return next.reduce((sum, on, index) => sum + (on ? blocks[index].size : 0), 0)
}

export function togglePowerColumn(blocks: PowerBlock[], selected: number, remaining: number): number {
  if (selected > 0) return 0
  let last = -1
  for (let index = 0; index < blocks.length; index += 1) {
    if (!blocks[index].disabled) last = index
  }
  if (last < 0) return 0
  return clickPowerColumn(blocks, 0, last, remaining)
}

export function assignedSegments(column: PowerColumn, selected: number): Map<string, number> {
  const counts = new Map<string, number>()
  let left = selected
  for (const block of column.blocks) {
    if (!block.portId) continue
    if (!counts.has(block.portId)) counts.set(block.portId, 0)
    if (left >= block.size) {
      counts.set(block.portId, (counts.get(block.portId) || 0) + block.size)
      left -= block.size
    }
  }
  return counts
}
