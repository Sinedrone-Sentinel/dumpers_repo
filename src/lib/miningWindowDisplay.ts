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

/**
 * Physical bar thickness in CSS px for a window size %.
 *
 * Anchor: the thinnest window realistically seen in game — Quantainium
 * (thinness 2.3 → ~16.7%) with a full negative window stack (-43%) ≈ 9.5% —
 * draws 6px, which is 1/16 inch at the CSS reference 96 dpi. Everything
 * scales linearly from that anchor; CSS px track device pixel ratio, so the
 * proportions hold across resolutions.
 */
const THINNEST_KNOWN_PERCENT = 9.5
const THINNEST_KNOWN_PX = 6

export function windowBarHeightPx(widthPercent: number): number {
  const px = Math.round(widthPercent * (THINNEST_KNOWN_PX / THINNEST_KNOWN_PERCENT))
  return Math.max(4, Math.min(44, px))
}

export interface WindowBarModel {
  /** Estimated window size, % of the charge bar (relative scale). */
  widthPercent: number
  /** Physical bar thickness (CSS px), anchored to the thinnest known in-game window. */
  heightPx: number
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
    heightPx: windowBarHeightPx(width),
    rating: profile.rating,
  }
}
