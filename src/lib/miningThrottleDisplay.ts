/** Whole-number throttle % helpers — math uses MW internally; players only see integer % on HUD. */

export function throttlePercentFromMw(targetMw: number, laserPower: number): number {
  if (!Number.isFinite(targetMw) || !Number.isFinite(laserPower) || laserPower <= 0) return 0
  const raw = Math.round((targetMw / laserPower) * 100)
  return Math.max(0, Math.min(100, raw))
}

export function displayMinThrottlePercent(throttleMinimumFraction: number): number {
  const raw = Math.round(throttleMinimumFraction * 100)
  return raw < 1 ? 1 : raw
}
