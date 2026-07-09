import { getMiningLaserByName } from './miningVessels'

/** Required MW at or above this fraction of min laser MW → feathering may work. */
export const MIN_POWER_FEATHER_RATIO = 0.65

export type MinPowerWarningLevel = 'feather' | 'danger'

export interface MinPowerWarning {
  slotIndex: number
  label: string
  requiredMw: number
  minLaserMw: number
  throttleMinimumPercent: number
  level: MinPowerWarningLevel
}

export function minLaserMw(laserPower: number, throttleMinimumFraction: number): number {
  return Math.round(laserPower * throttleMinimumFraction)
}

export function throttleMinimumPercent(throttleMinimumFraction: number): number {
  return Math.round(throttleMinimumFraction * 1000) / 10
}

export function assessMinPowerWarning(
  requiredMw: number,
  laserPower: number,
  throttleMinimumFraction: number,
  label: string,
  slotIndex: number
): MinPowerWarning | null {
  if (!Number.isFinite(requiredMw) || requiredMw <= 0) return null
  if (!Number.isFinite(laserPower) || laserPower <= 0) return null

  const minMw = minLaserMw(laserPower, throttleMinimumFraction)
  if (requiredMw >= minMw) return null

  const ratio = requiredMw / minMw
  return {
    slotIndex,
    label,
    requiredMw,
    minLaserMw: minMw,
    throttleMinimumPercent: throttleMinimumPercent(throttleMinimumFraction),
    level: ratio >= MIN_POWER_FEATHER_RATIO ? 'feather' : 'danger',
  }
}

export function minPowerWarningMessage(warning: MinPowerWarning): string {
  const minLabel = `${warning.minLaserMw.toLocaleString()} MW @ ${warning.throttleMinimumPercent}%`
  if (warning.level === 'feather') {
    return `Required ${warning.requiredMw.toLocaleString()} MW is below minimum output (${minLabel}) but close — try feathering the laser on/off to crack without overcharging.`
  }
  return `Required ${warning.requiredMw.toLocaleString()} MW is well below minimum output (${minLabel}) — may be impossible to crack without blowing up the rock.`
}

export function assessMinPowerWarningForSlot(
  laserName: string,
  requiredMw: number,
  laserPower: number,
  label: string,
  slotIndex: number
): MinPowerWarning | null {
  const laser = getMiningLaserByName(laserName)
  if (!laser) return null
  return assessMinPowerWarning(
    requiredMw,
    laserPower,
    laser.throttleMinimum,
    label,
    slotIndex
  )
}
