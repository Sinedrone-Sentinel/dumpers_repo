import {
  computeBlueprintEffectiveModifiers,
  type BlueprintForEffectiveStats,
} from './blueprintEffectiveStats'

export interface ShipItemStats {
  entityClass: string
  displayName: string
  kind: string
  size: number
  manufacturer?: string | null
  weaponClass?: string | null
  damageType?: string | null
  stats: Record<string, number>
  burstDps: number
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

export function compareToStock(current: number | null | undefined, stock: number | null | undefined): 'up' | 'down' | 'same' {
  if (current == null || stock == null || !Number.isFinite(current) || !Number.isFinite(stock)) return 'same'
  const delta = Math.round(current * 100) - Math.round(stock * 100)
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'same'
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
    const dps = weaponBurstDps(stats)
    return dps > 0 ? `${round(dps)} burst DPS` : ''
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
    return `${round(stats.Quantum_Speed)} m/s`
  }
  if (kind === 'flight' && stats.Flight_Pitch) {
    return `Pitch ${round(stats.Flight_Pitch)}`
  }
  return ''
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
  damageReduction: number | null
  hullHp: number | null
  pitch: number | null
  yaw: number | null
  roll: number | null
}

export function emptySnapshot(ship?: {
  damageReduction?: number | null
  hullHp?: number | null
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
    damageReduction: ship?.damageReduction ?? null,
    hullHp: ship?.hullHp ?? null,
    pitch: ship?.pitch ?? null,
    yaw: ship?.yaw ?? null,
    roll: ship?.roll ?? null,
  }
}

export function addPartToSnapshot(
  snapshot: ShipSnapshotNumbers,
  kind: string,
  stats: Record<string, number>,
): void {
  if (kind === 'weapon') {
    snapshot.burstDps += weaponBurstDps(stats)
    snapshot.sustainedDps += weaponSustainedDps(stats)
  }
  if (kind === 'missile') snapshot.missileVolley += stats.Missile_Damage || stats.Weapon_Damage || 0
  if (kind === 'shield') {
    snapshot.shieldHp += stats.Shield_Maxhealth || 0
    snapshot.shieldRegen += stats.Shield_Regen || 0
  }
  if (kind === 'armor') {
    snapshot.armorHp += stats.Armor_Health || stats.Health_Maxhealth || 0
    if (typeof stats.Armor_PhysicalReduction === 'number') snapshot.physicalReduction = stats.Armor_PhysicalReduction
    if (typeof stats.Armor_EnergyReduction === 'number') snapshot.energyReduction = stats.Armor_EnergyReduction
  }
  if (kind === 'flight') {
    if (stats.Flight_Pitch) snapshot.pitch = stats.Flight_Pitch
    if (stats.Flight_Yaw) snapshot.yaw = stats.Flight_Yaw
    if (stats.Flight_Roll) snapshot.roll = stats.Flight_Roll
  }
}
