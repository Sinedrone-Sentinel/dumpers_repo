/**
 * Contract offer frequency / instance limits from game files.
 * Units: respawn / instance lifetime = minutes; personal/abandon cooldown = seconds.
 * canBeShared comes from the contract template (false = not party-shareable).
 */
export interface MissionFrequency {
  maxInstances: number | null
  maxInstancesPerPlayer: number | null
  respawnTimeMinutes: number | null
  respawnTimeVariationMinutes: number | null
  instanceLifeTimeMinutes: number | null
  instanceLifeTimeVariationMinutes: number | null
  hasPersonalCooldown: boolean | null
  personalCooldownSeconds: number | null
  personalCooldownVariationSeconds: number | null
  abandonedCooldownSeconds: number | null
  abandonedCooldownVariationSeconds: number | null
  onceOnly: boolean | null
  canReacceptAfterAbandoning: boolean | null
  canReacceptAfterFailing: boolean | null
  /** false = cannot share with party (solo). null = unknown / not in files. */
  canBeShared: boolean | null
}

/** How many concurrent offers — only when files give a positive instance cap. */
export function formatMissionHowMany(frequency?: MissionFrequency | null): string | null {
  const n = frequency?.maxInstances
  if (n == null || n < 1) return null
  if (n === 1) return '1 at a time'
  return `Up to ${n}`
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (Number.isInteger(hours)) return `${hours}h`
  const whole = Math.floor(hours)
  const rem = minutes % 60
  return rem === 0 ? `${whole}h` : `${whole}h ${rem}m`
}

/** Board refresh cadence from respawnTime — skip when missing. */
export function formatMissionHowOften(frequency?: MissionFrequency | null): string | null {
  const minutes = frequency?.respawnTimeMinutes
  if (minutes == null) return null
  if (minutes === 0) return 'No wait'
  return `Every ${formatMinutes(minutes)}`
}

/** Only when template explicitly sets canBeShared: false. */
export function formatMissionSolo(frequency?: MissionFrequency | null): string | null {
  if (frequency?.canBeShared !== false) return null
  return 'Solo'
}

export function hasMissionFrequencyTags(frequency?: MissionFrequency | null): boolean {
  return Boolean(
    formatMissionHowMany(frequency) ||
      formatMissionHowOften(frequency) ||
      formatMissionSolo(frequency),
  )
}
