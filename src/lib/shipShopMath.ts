import {
  computeBlueprintEffectiveModifiers,
  type BlueprintForEffectiveStats,
} from './blueprintEffectiveStats'

export interface ShipItemStats {
  entityClass: string
  displayName: string
  kind: string
  size: number
  stats: Record<string, number>
  burstDps: number
}

export interface FittedPart {
  entityClass: string
  source: 'stock' | 'crafted'
  qualities?: Record<number, number>
}

/** Burst damage per second: damage × pellets × rounds per minute / 60. */
export function weaponBurstDps(stats: Record<string, number> | null | undefined): number {
  if (!stats) return 0
  const damage = stats.Weapon_Damage || 0
  const rate = stats.Weapon_Firerate || 0
  const pellets = stats.Weapon_Pellets || 1
  if (damage <= 0 || rate <= 0) return 0
  return (damage * pellets * rate) / 60
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
  missileVolley: number
  shieldHp: number
  shieldRegen: number
  armorHp: number
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
    missileVolley: 0,
    shieldHp: 0,
    shieldRegen: 0,
    armorHp: 0,
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
  if (kind === 'weapon') snapshot.burstDps += weaponBurstDps(stats)
  if (kind === 'missile') snapshot.missileVolley += stats.Missile_Damage || stats.Weapon_Damage || 0
  if (kind === 'shield') {
    snapshot.shieldHp += stats.Shield_Maxhealth || 0
    snapshot.shieldRegen += stats.Shield_Regen || 0
  }
  if (kind === 'armor') snapshot.armorHp += stats.Armor_Health || stats.Health_Maxhealth || 0
  if (kind === 'flight') {
    if (stats.Flight_Pitch) snapshot.pitch = stats.Flight_Pitch
    if (stats.Flight_Yaw) snapshot.yaw = stats.Flight_Yaw
    if (stats.Flight_Roll) snapshot.roll = stats.Flight_Roll
  }
}
