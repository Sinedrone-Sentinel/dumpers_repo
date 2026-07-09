/** What miners actually optimize for, highest first. */
export const MINING_STAT_PRIORITY = [
  'power',
  'resistance',
  'window',
  'instability',
] as const

export type PriorityMiningStat = (typeof MINING_STAT_PRIORITY)[number]

export const MINING_STAT_PRIORITY_RANK: Record<PriorityMiningStat, number> = {
  power: 0,
  resistance: 1,
  window: 2,
  instability: 3,
}

/** Pro-tip thresholds — only flag stats miners care about. */
export const MINING_STAT_EXTREMES = {
  modulePowerDrastic: -25,
  resistanceBad: 12,
  windowBad: -30,
  instabilityBad: 8,
} as const

export const MAX_LOADOUT_PRO_TIPS = 2
