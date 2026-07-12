import { getMiningLaserByName } from './miningVessels'
import { displayMinThrottlePercent } from './miningThrottleDisplay'

export interface MinPowerWarning {
  slotIndex: number
  label: string
  requiredMw: number
  minLaserMw: number
  throttleMinimumPercent: number
}

export function minLaserMw(laserPower: number, throttleMinimumFraction: number): number {
  return Math.round(laserPower * throttleMinimumFraction)
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

  return {
    slotIndex,
    label,
    requiredMw,
    minLaserMw: minMw,
    throttleMinimumPercent: displayMinThrottlePercent(throttleMinimumFraction),
  }
}

export function minPowerWarningMessage(warning: MinPowerWarning): string {
  return `Even at minimum throttle (${warning.throttleMinimumPercent}%), this laser puts out more power than the rock needs — the charge can spike and blow the rock. Pulse the laser in short bursts or switch to a weaker head.`
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
