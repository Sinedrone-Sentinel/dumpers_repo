import { getMiningLaserByName } from './miningVessels'
import { displayMinThrottlePercent } from './miningThrottleDisplay'

export type MinPowerWarningLevel = 'misconfigured' | 'danger'

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
    level: 'danger',
  }
}

export function minPowerWarningMessage(warning: MinPowerWarning): string {
  const minPercent = warning.throttleMinimumPercent

  if (warning.level === 'misconfigured') {
    return `Min throttle (${minPercent}%) does not land the driving laser in the 1–5% band below the resistance equalizer — swap heads or modules instead of feathering power on/off.`
  }

  return `Minimum throttle (${minPercent}%) is still above the fracture band just under the resistance equalizer — try a different head, support laser, or gadget.`
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
