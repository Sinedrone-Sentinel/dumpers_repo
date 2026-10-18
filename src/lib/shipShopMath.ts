import {
  computeBlueprintEffectiveModifiers,
  type BlueprintForEffectiveStats,
} from './blueprintEffectiveStats'

export interface MissileMount {
  name: string
  minSize: number
  maxSize: number
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
  ordnance?: 'missile' | 'torpedo' | null
  stats: Record<string, number>
  burstDps: number
}

/** A catalog row with no usable numbers is a file stub, not an item a ship can mount. */
export function itemIsEquippable(item: ShipItemStats): boolean {
  const stats = item.stats || {}
  if (item.kind === 'weapon') return (stats.Weapon_Damage || 0) > 0 && (stats.Weapon_Firerate || 0) > 0
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

/** Burst damage per second. A charge or a seconds-long delay replaces the fire rate when it is the slower wait. */
export function weaponBurstDps(stats: Record<string, number> | null | undefined): number {
  if (!stats) return 0
  const damage = stats.Weapon_Damage || 0
  const rate = stats.Weapon_Firerate || 0
  const pellets = stats.Weapon_Pellets || 1
  if (damage <= 0) return 0
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

/** Burst, reduced by overheat and, for energy guns, by how fast the capacitor refills at this power. */
export function weaponSustainedDps(stats: Record<string, number> | null | undefined, powerFraction = 1): number {
  const burst = weaponBurstDps(stats)
  if (!burst || !stats) return 0
  const fraction = Math.max(0, Math.min(1, powerFraction))
  if (fraction <= 0) return 0
  let sustained = burst
  const heat = stats.Weapon_HeatPerShot || 0
  const rate = stats.Weapon_Firerate || 0
  const overheat = stats.Weapon_Overheat || 0
  if (heat && rate && overheat) {
    const timeHot = overheat / (heat * (rate / 60))
    const downtime = stats.Weapon_OverheatFix || (stats.Weapon_Cooling ? overheat / stats.Weapon_Cooling : 0)
    if (downtime) sustained = (burst * timeHot) / (timeHot + downtime)
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

export function applyCraftedStats(
  stats: Record<string, number>,
  blueprint: BlueprintForEffectiveStats | null | undefined,
  qualities?: Record<number, number> | null,
): Record<string, number> {
  if (!blueprint) return { ...stats }
  const next = { ...stats }
  for (const mod of computeBlueprintEffectiveModifiers(blueprint, qualities)) {
    const current = next[mod.property]
    if (current == null) continue
    if (mod.isIntegerAdditive && mod.additiveChange) {
      next[mod.property] = current + mod.additiveChange
      continue
    }
    if (mod.baseValue && mod.finalValue) {
      next[mod.property] = current * (mod.finalValue / mod.baseValue)
      continue
    }
    if (mod.percentChange) {
      next[mod.property] = current * (1 + mod.percentChange / 100)
    }
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

/** Armor signature multipliers are stored as the percent change from 1. */
export function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (Math.abs(value) < 0.05) return '0%'
  const digits = Math.abs(value % 1) < 0.05 ? 0 : 1
  const text = Math.abs(value).toFixed(digits).replace(/\.0$/, '')
  return `${value > 0 ? '+' : '−'}${text}%`
}

function compactNumber(value: number | undefined, digits = 0): string | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** Erkul-style weapon columns, in plain labels. Missiles are not part of DPS. */
export function weaponStatBits(stats: Record<string, number>): string[] {
  const bits: string[] = []
  const push = (label: string, value: number | undefined, digits = 0) => {
    const text = compactNumber(value, digits)
    if (text) bits.push(`${label} ${text}`)
  }
  push('DPS', weaponBurstDps(stats))
  push('Sustained', weaponSustainedDps(stats))
  push('Alpha', stats.Weapon_Damage, 1)
  push('Pen', stats.Weapon_Penetration, 2)
  push('Rate', stats.Weapon_Firerate)
  push('Range', stats.Weapon_Range)
  push('Speed', stats.Weapon_Speed)
  push('Spread', stats.Weapon_Spread, 2)
  push('Power', stats.Weapon_Power, 2)
  push('EM', stats.Weapon_Em)
  push('Ammo', stats.Weapon_Ammo)
  push('HP', stats.Health_Maxhealth)
  return bits
}

export function partStatLine(kind: string, stats: Record<string, number>, scale = 1): string {
  const round = (value: number) => Math.round(value).toLocaleString()
  if (kind === 'weapon') {
    const burst = weaponBurstDps(stats)
    if (burst <= 0) return ''
    return `${round(burst)} burst · ${round(weaponSustainedDps(stats))} sustained`
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
      stats.Shield_Maxhealth && stats.Shield_Regen ? `full charge ${charge == null ? '—' : `${charge.toFixed(1)}s`}` : '',
      stats.Shield_DamagedRegenDelay ? `damaged ${stats.Shield_DamagedRegenDelay.toFixed(1)}s` : '',
      stats.Shield_DownedRegenDelay ? `downed ${stats.Shield_DownedRegenDelay.toFixed(1)}s` : '',
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

/** Quantum drive speed is stored in metres per second. Large drives read as megametres per second. */
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

export function formatQuantumSpeed(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value <= 0) return '0'
  if (value >= 1_000_000) {
    const mega = value / 1_000_000
    return `${mega.toFixed(1)} Mm/s`
  }
  return `${Math.round(value).toLocaleString()} m/s`
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
    snapshot.sustainedDps += weaponSustainedDps(stats, scale)
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
    if (stats.Flight_Pitch) snapshot.pitch = stats.Flight_Pitch * scale
    if (stats.Flight_Yaw) snapshot.yaw = stats.Flight_Yaw * scale
    if (stats.Flight_Roll) snapshot.roll = stats.Flight_Roll * scale
    if (stats.Flight_ScmSpeed) snapshot.scmSpeed = stats.Flight_ScmSpeed * (scale > 0 ? 1 : 0)
    if (stats.Flight_BoostSpeed) snapshot.boostSpeed = stats.Flight_BoostSpeed * (scale > 0 ? 1 : 0)
    if (stats.Flight_MaxSpeed) snapshot.navSpeed = stats.Flight_MaxSpeed
  }
  if (kind === 'quantum' && stats.Quantum_Speed && scale > 0) {
    snapshot.quantumSpeed = Math.max(snapshot.quantumSpeed || 0, stats.Quantum_Speed)
  }
}

export interface PowerBlock {
  size: number
  portId: string | null
  /** First block of a component that follows another component in the same group. */
  groupStart?: boolean
}

export interface PowerColumn {
  id: string
  label: string
  blocks: PowerBlock[]
}

export interface PowerPart {
  portId: string
  kind: string
  size: number
  stats: Record<string, number>
}

const POWER_GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: 'shields', label: 'Shields', kinds: ['shield'] },
  { id: 'quantum', label: 'Quantum', kinds: ['quantum'] },
  { id: 'interdiction', label: 'Interdiction', kinds: ['qed'] },
  { id: 'tractor', label: 'Tractor', kinds: ['tractor'] },
  { id: 'radar', label: 'Radar', kinds: ['radar'] },
  { id: 'life', label: 'Life support', kinds: ['life'] },
  { id: 'coolers', label: 'Coolers', kinds: ['cooler'] },
]

/** Pips a component draws: its power-segment consumption, or the registered full-power band. */
export function pipDemand(stats: Record<string, number>): number {
  if (stats.Power_Segments > 0) return stats.Power_Segments
  return stats.Power_HighStart || stats.Power_MedStart || stats.Power_LowStart || 0
}

/** Shield face refill per second. `scale` is already the pip fraction times the band. */
export function shieldRegenRate(stats: Record<string, number> | null | undefined, scale = 1): number {
  if (!stats) return 0
  return (stats.Shield_Regen || 0) * Math.max(0, scale)
}

/** Erkul shield factor: assigned pips divided by the item's segments, times that band. */
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

export function powerColumns(weaponPowerPool: number, parts: PowerPart[]): PowerColumn[] {
  const columns: PowerColumn[] = []
  if (weaponPowerPool > 0) {
    columns.push({
      id: 'weapons',
      label: 'Weapons',
      blocks: Array.from({ length: weaponPowerPool }, () => ({ size: 1, portId: null })),
    })
  }
  for (const group of POWER_GROUPS) {
    const members = parts.filter((part) => group.kinds.includes(part.kind) && pipDemand(part.stats) > 0)
    if (members.length === 0) continue
    const blocks: PowerBlock[] = []
    members.forEach((part, memberIndex) => {
      const max = pipDemand(part.stats)
      const min = Math.min(max, Math.max(1, part.stats.Power_Min || 1))
      const gap = memberIndex > 0
      if (min > 1) {
        blocks.push({ size: min, portId: part.portId, groupStart: gap })
        for (let index = min; index < max; index += 1) blocks.push({ size: 1, portId: part.portId })
      } else {
        for (let index = 0; index < max; index += 1) {
          blocks.push({ size: 1, portId: part.portId, groupStart: gap && index === 0 })
        }
      }
    })
    columns.push({ id: group.id, label: group.label, blocks })
  }
  return columns
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
      const min = group.blocks[0]?.size || 0
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
      const max = groupTotal(group.blocks)
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
      const want = Math.min(groupTotal(group.blocks), Math.max(0, Math.round(source[group.key] ?? 0)))
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
 * life support, radar, and the quantum drive. Plants do not draw coolant.
 * Weapon pips count only up to the guns' own segment total.
 */
export function coolantDemand(
  parts: PowerPart[],
  pips: Map<string, number>,
  weaponSelected = 0,
  weaponRaw = 0,
): number {
  let drawn = 0
  let extra = 0
  for (const part of parts) {
    if (part.kind === 'weapon' || part.kind === 'power' || part.kind === 'flight' || part.kind === 'missile') continue
    const count = assignedPips(pips, part.portId)
    if (count <= 0) continue
    drawn += count
    if (COOLING_BAND_KINDS.has(part.kind)) extra += count * segmentScale(part.stats, count)
  }
  drawn += Math.min(Math.max(0, weaponSelected), Math.max(0, weaponRaw))
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
  weaponEnabled: number,
  armorMultiplier: number,
): number {
  const weaponRaw = parts
    .filter((part) => part.kind === 'weapon')
    .reduce((sum, part) => sum + (part.stats.Power_Segments || 0), 0)
  let drawn = 0
  for (const part of parts) {
    if (part.kind === 'weapon' || part.kind === 'power') continue
    drawn += assignedPips(pips, part.portId)
  }
  drawn += Math.min(Math.max(0, weaponSelected), weaponRaw)
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
  if (weaponEnabled > 0 && weaponSelected > 0) {
    const share = weaponSelected / weaponEnabled
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
  const flags = bottomFlags(blocks, selected)
  let budget = remaining
  for (let index = blockIndex + 1; index < blocks.length; index += 1) {
    if (flags[index]) budget += blocks[index].size
  }
  const next = blocks.map(() => false)
  for (let index = 0; index <= blockIndex && index < blocks.length; index += 1) {
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
  if (blocks.length === 0) return 0
  return clickPowerColumn(blocks, 0, blocks.length - 1, remaining)
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
