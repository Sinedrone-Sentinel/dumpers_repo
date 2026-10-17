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
  mounts?: MissileMount[]
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
  return Object.keys(stats).length > 0
}

export interface FittedPart {
  entityClass: string
  source: 'stock' | 'crafted'
  qualities?: Record<number, number>
}

/** Burst damage per second: damage × pellets × rounds per minute / 60. Missiles are not included. */
export function weaponBurstDps(stats: Record<string, number> | null | undefined): number {
  if (!stats) return 0
  const damage = stats.Weapon_Damage || 0
  const rate = stats.Weapon_Firerate || 0
  const pellets = stats.Weapon_Pellets || 1
  if (damage <= 0 || rate <= 0) return 0
  return (damage * pellets * rate) / 60
}

/** Burst, reduced by the time the gun spends cooling after it overheats. */
export function weaponSustainedDps(stats: Record<string, number> | null | undefined): number {
  const burst = weaponBurstDps(stats)
  if (!burst || !stats) return 0
  const heat = stats.Weapon_HeatPerShot || 0
  const rate = stats.Weapon_Firerate || 0
  const overheat = stats.Weapon_Overheat || 0
  if (!heat || !rate || !overheat) return burst
  const timeHot = overheat / (heat * (rate / 60))
  const downtime = stats.Weapon_OverheatFix || (stats.Weapon_Cooling ? overheat / stats.Weapon_Cooling : 0)
  if (!downtime) return burst
  return (burst * timeHot) / (timeHot + downtime)
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

export function partStatLine(kind: string, stats: Record<string, number>): string {
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
    const parts = [
      stats.Shield_Maxhealth ? `${round(stats.Shield_Maxhealth)} HP` : '',
      stats.Shield_Regen ? `${round(stats.Shield_Regen)}/s` : '',
    ].filter(Boolean)
    return parts.join(' · ')
  }
  if (kind === 'armor') {
    const hp = stats.Armor_Health || stats.Health_Maxhealth || 0
    return hp > 0 ? `${round(hp)} HP` : ''
  }
  if (kind === 'power' && stats.Itemresource_Powergeneration) {
    return `${round(stats.Itemresource_Powergeneration)} power pips`
  }
  if (kind === 'cooler' && stats.Itemresource_Coolantgeneration) {
    return `${round(stats.Itemresource_Coolantgeneration)} coolant`
  }
  if (kind === 'quantum' && stats.Quantum_Speed) {
    return formatQuantumSpeed(stats.Quantum_Speed)
  }
  if (kind === 'flight' && stats.Flight_Pitch) {
    return `Pitch ${round(stats.Flight_Pitch)}`
  }
  return ''
}

/** Quantum drive speed is stored in metres per second. Large drives read as megametres per second. */
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
  pitch: number | null
  yaw: number | null
  roll: number | null
}

export function emptySnapshot(ship?: {
  damageReduction?: number | null
  hullHp?: number | null
  noise?: number | null
  decoy?: number | null
  pitch?: number | null
  yaw?: number | null
  roll?: number | null
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
    pitch: ship?.pitch ?? null,
    yaw: ship?.yaw ?? null,
    roll: ship?.roll ?? null,
  }
}

export function addPartToSnapshot(
  snapshot: ShipSnapshotNumbers,
  kind: string,
  stats: Record<string, number>,
  scale = 1,
): void {
  if (kind === 'weapon') {
    snapshot.burstDps += weaponBurstDps(stats) * scale
    snapshot.sustainedDps += weaponSustainedDps(stats) * scale
  }
  if (kind === 'missile') snapshot.missileVolley += stats.Missile_Damage || stats.Weapon_Damage || 0
  if (kind === 'shield') {
    snapshot.shieldHp += (stats.Shield_Maxhealth || 0) * scale
    snapshot.shieldRegen += (stats.Shield_Regen || 0) * scale
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
  }
  if (kind === 'quantum' && stats.Quantum_Speed && scale > 0) {
    snapshot.quantumSpeed = Math.max(snapshot.quantumSpeed || 0, stats.Quantum_Speed)
  }
}

export interface PowerBlock {
  size: number
  portId: string | null
}

export interface PowerColumn {
  id: string
  label: string
  blocks: PowerBlock[]
}

export interface PowerPart {
  portId: string
  kind: string
  stats: Record<string, number>
}

const POWER_GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: 'engines', label: 'Engines', kinds: ['flight'] },
  { id: 'shields', label: 'Shields', kinds: ['shield'] },
  { id: 'quantum', label: 'Quantum', kinds: ['quantum'] },
  { id: 'radar', label: 'Radar', kinds: ['radar'] },
  { id: 'coolers', label: 'Coolers', kinds: ['cooler'] },
]

/** Pips a component draws: its power-segment consumption, or the registered full-power band. */
export function pipDemand(stats: Record<string, number>): number {
  if (stats.Power_Segments > 0) return stats.Power_Segments
  return stats.Power_HighStart || stats.Power_MedStart || stats.Power_LowStart || 0
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
    const blocks: PowerBlock[] = []
    for (const part of parts) {
      if (!group.kinds.includes(part.kind)) continue
      const demand = pipDemand(part.stats)
      for (let index = 0; index < demand; index += 1) blocks.push({ size: 1, portId: part.portId })
    }
    if (blocks.length > 0) columns.push({ id: group.id, label: group.label, blocks })
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

export function powerGenerated(parts: PowerPart[]): number {
  return parts.reduce((sum, part) => sum + (part.kind === 'power' ? part.stats.Itemresource_Powergeneration || 0 : 0), 0)
}

export function powerUsed(columns: PowerColumn[], stored: Record<string, number> | null | undefined): number {
  return columns.reduce((sum, column) => sum + columnSelected(column, stored?.[column.id]), 0)
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
