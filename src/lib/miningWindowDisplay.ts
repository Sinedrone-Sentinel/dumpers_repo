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
 * Anchor (field-calibrated): raw Quantainium (thinness 2.3 → ~16.7%) draws
 * ~6px ≈ 1/16 inch at the CSS reference 96 dpi. A full negative window stack
 * on top of that bottoms out around 3–4px. Linear from there; CSS px track
 * device pixel ratio, so proportions hold across resolutions.
 */
const PX_PER_WINDOW_PERCENT = 0.38

export function windowBarHeightPx(widthPercent: number): number {
  const px = Math.round(widthPercent * PX_PER_WINDOW_PERCENT)
  return Math.max(3, Math.min(32, px))
}

export interface WindowBarModel {
  /** Estimated window size, % of the charge bar (relative scale). */
  widthPercent: number
  /** Physical bar thickness (CSS px), anchored to the thinnest known in-game window. */
  heightPx: number
  /** Display scale is pegged — real window is at/near the whole charge arc. */
  saturated: boolean
  rating: OreWindowProfile['rating']
}

export function buildWindowBarModel(
  oreName: string,
  windowModifierPercent = 0
): WindowBarModel | null {
  const profile = getOreWindowProfile(oreName)
  if (!profile) return null

  const base = estimatedWindowBarPercent(profile.thinness)
  const rawModified = base * (1 + windowModifierPercent / 100)
  const width = windowModifierPercent === 0 ? base : modifiedWindowBarPercent(base, windowModifierPercent)

  return {
    widthPercent: Math.round(width),
    heightPx: windowBarHeightPx(width),
    saturated: rawModified >= 90,
    rating: profile.rating,
  }
}
