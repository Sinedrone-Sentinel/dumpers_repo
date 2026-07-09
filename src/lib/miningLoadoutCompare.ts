import { requiredLaserPower } from './miningBreakability'
import {
  assessMinPowerWarningForSlot,
  type MinPowerWarning,
} from './miningMinPowerWarning'
import {
  computeEffectiveLaserStats,
  laserResistanceMultiplier,
  type MiningLaserSlotConfig,
} from './miningLaserStats'

export interface RockBreakabilityTarget {
  scannerMass: number | null
  resistancePercent: number | null
  /** Scanner instability (HUD value, e.g. 952.25). */
  instability: number | null
}

export interface LaserBreakabilityRow {
  slotIndex: number
  label: string
  laserPower: number
  /** Per-laser share of total required power (equal split across slots) */
  requiredShare: number
  canBreakShare: boolean
  /** Throttle % needed on this laser to meet its share (100% = full power) */
  throttlePercent: number
  shortfallMw: number
  mode: 'stock' | 'custom'
}

export interface LoadoutBreakabilityComparison {
  requiredPower: number
  totalLaserPower: number
  canBreak: boolean
  totalShortfallMw: number
  /** Best (lowest) laser resistance multiplier in the loadout — helps most on tough rocks */
  bestResistanceMultiplier: number
  lasers: LaserBreakabilityRow[]
  /** Required MW is below head minimum output — overcharge risk */
  minPowerWarnings: MinPowerWarning[]
}

export function isRockBreakabilityTargetReady(target: RockBreakabilityTarget | null | undefined): boolean {
  if (!target) return false
  return (
    target.scannerMass != null &&
    target.scannerMass > 0 &&
    target.resistancePercent != null &&
    Number.isFinite(target.resistancePercent)
  )
}

/**
 * Required power uses the most favorable laser resistance modifier in the loadout
 * (lowest multiplier = easiest to break). Per-laser rows still use each laser's own modifier.
 */
export function compareLoadoutToRock(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget
): LoadoutBreakabilityComparison | null {
  if (!isRockBreakabilityTargetReady(target)) return null

  const mass = target.scannerMass!
  const resistance = target.resistancePercent!

  const effectiveStats = lasers
    .map((slot) => computeEffectiveLaserStats(slot))
    .filter((s): s is NonNullable<typeof s> => s != null)

  if (!effectiveStats.length) return null

  const resistanceMultipliers = effectiveStats.map((s) =>
    laserResistanceMultiplier(s.resistanceModifier)
  )
  const bestResistanceMultiplier = Math.min(...resistanceMultipliers)

  const requiredPower = Math.round(
    requiredLaserPower(mass, resistance, bestResistanceMultiplier)
  )

  const totalLaserPower = effectiveStats.reduce((sum, s) => sum + s.laserPower, 0)
  const canBreak = totalLaserPower >= requiredPower
  const totalShortfallMw = canBreak ? 0 : requiredPower - totalLaserPower

  const slotCount = effectiveStats.length
  const requiredShare = Math.round(requiredPower / slotCount)

  const laserRows: LaserBreakabilityRow[] = effectiveStats.map((stats, slotIndex) => {
    const slotResistance = laserResistanceMultiplier(stats.resistanceModifier)
    const slotRequired = Math.round(requiredLaserPower(mass, resistance, slotResistance))
    const shareRequired = Math.round(slotRequired / slotCount)
    const canBreakShare = stats.laserPower >= shareRequired
    const throttlePercent =
      stats.laserPower > 0
        ? Math.min(100, Math.round((shareRequired / stats.laserPower) * 100))
        : 100
    const shortfallMw = canBreakShare ? 0 : shareRequired - stats.laserPower

    const slot = lasers[slotIndex]
    const label =
      slot?.customLabel?.trim() ||
      stats.displayName +
        (stats.mode === 'custom' && stats.powerMultiplier !== 1
          ? ` (${stats.laserPower.toLocaleString()} MW)`
          : '')

    return {
      slotIndex,
      label,
      laserPower: stats.laserPower,
      requiredShare: shareRequired,
      canBreakShare,
      throttlePercent,
      shortfallMw,
      mode: stats.mode,
    }
  })

  const minPowerWarnings: MinPowerWarning[] = []
  for (const row of laserRows) {
    const slot = lasers[row.slotIndex]
    if (!slot) continue
    const requiredMw = slotCount === 1 ? requiredPower : row.requiredShare
    const warning = assessMinPowerWarningForSlot(
      slot.laserName,
      requiredMw,
      row.laserPower,
      row.label,
      row.slotIndex
    )
    if (warning) minPowerWarnings.push(warning)
  }

  return {
    requiredPower,
    totalLaserPower,
    canBreak,
    totalShortfallMw,
    bestResistanceMultiplier,
    lasers: laserRows,
    minPowerWarnings,
  }
}
