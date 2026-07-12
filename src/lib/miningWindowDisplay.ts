import { getOreWindowProfile, type OreWindowProfile } from './mineableElementStats'

/**
 * Relative optimal-window width as a % of the charge bar, for display only.
 * The game derives the real width from `elementOptimalWindowThinness`
 * (higher = thinner; ship ores span −0.9 copper/iron … 2.3 Quantainium).
 * The exact in-game formula isn't in the data files, so this maps thinness
 * onto a consistent relative scale — good for comparing ores and mod effects,
 * labeled "estimated" in the UI.
 */
export function estimatedWindowBarPercent(thinness: number): number {
  if (!Number.isFinite(thinness)) return 35
  if (thinness <= 0) {
    return Math.min(75, 55 + Math.abs(thinness) * 20)
  }
  return Math.max(10, 55 / (1 + thinness))
}

/** Apply laser/module optimal-window modifiers (+% widens) to the estimated width. */
export function modifiedWindowBarPercent(basePercent: number, windowModifierPercent: number): number {
  const modified = basePercent * (1 + windowModifierPercent / 100)
  return Math.max(4, Math.min(90, modified))
}

export interface WindowBarModel {
  /** Band width, % of track. */
  widthPercent: number
  /** Band center position, % of track (game window midpoint). */
  midpointPercent: number
  /** Extra span (each side) the band can drift per rock, % of track. */
  driftPercent: number
  rating: OreWindowProfile['rating']
}

export function buildWindowBarModel(
  oreName: string,
  windowModifierPercent = 0
): WindowBarModel | null {
  const profile = getOreWindowProfile(oreName)
  if (!profile) return null

  const base = estimatedWindowBarPercent(profile.thinness)
  const width = windowModifierPercent === 0 ? base : modifiedWindowBarPercent(base, windowModifierPercent)

  return {
    widthPercent: Math.round(width),
    midpointPercent: Math.round(profile.midpoint * 100),
    driftPercent: Math.round(profile.randomness * 100),
    rating: profile.rating,
  }
}
