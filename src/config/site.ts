// =============================================================================
// BRAND ASSETS
// =============================================================================
/** Official product branding — keep the Dumper's Repo header treatment. */
export const SITE_BRAND_FONT = "'Orbitron', sans-serif" as const
export const SITE_BRAND_REPO_GRADIENT =
  'linear-gradient(90deg, #ea580c 0%, #f97316 45%, #facc15 100%)' as const
/** Raster favicon for browser tabs; header uses inline SVG in SiteBrandMark. */
export const SITE_BRAND_LOGO = '/favicon.svg' as const
export const SITE_OG_IMAGE_PATH = '/og-image.png' as const

// =============================================================================
// SITE CONFIG — official dumpers-repo.com deployment
// =============================================================================
/** Canonical URL for SEO, og:url — must match the host GitHub Pages serves without redirect (apex, not www). */
export const SITE_URL = 'https://dumpers-repo.com' as const
/** Browser tab title and og:title (hub / fallback; per-route overrides in seo.ts) */
export const SITE_TITLE =
  "Star Citizen Blueprint Tracker & Crafting Tools | Dumper's Repo" as const
/** Meta description and og:description */
export const SITE_DESCRIPTION =
  "Free Star Citizen blueprint tracker and crafting tools: blueprint database, mission rewards, Wikelo barter guide, mining tracker, resources, and a community marketplace. Explore offline — no account required." as const
export const SITE_OG_IMAGE = `${SITE_URL}${SITE_OG_IMAGE_PATH}` as const
/** Tagline shown in UI */
export const SITE_SLOGAN = 'Buy. Craft. Sell.' as const
/** Footer copyright */
export const SITE_COPYRIGHT =
  '© 2026 Sinedrone Sentinel - All data is subject to change every patch' as const
/**
 * Optional support / tip page (e.g. Ko-fi). Shown as a quiet footer link when set.
 * Clear to hide the link.
 */
export const SITE_SUPPORT_URL = 'https://ko-fi.com/dumpers_repo' as const
export const SITE_SUPPORT_LABEL = 'Support this site' as const
/** Public Privacy Policy path (Partner Center / footer / onboarding). */
export const SITE_PRIVACY_PATH = '/privacy' as const
export const SITE_PRIVACY_URL = `${SITE_URL}${SITE_PRIVACY_PATH}` as const
export const SITE_PRIVACY_LABEL = 'Privacy Policy' as const

// =============================================================================
// DFP CONFIGURATION
// =============================================================================
/** Official deployment hostnames — load DFP same-origin (avoids apex/www CORS issues). */
export const DFP_OFFICIAL_HOSTS = ['dumpers-repo.com', 'www.dumpers-repo.com'] as const

/**
 * Canonical DFP base (cross-origin fallback for local/dev when not on an official host).
 * Do not rehost or replace the engine on other public sites — see LICENSE.DFP.
 */
export const DFP_CANONICAL_BASE_URL =
  'https://raw.githubusercontent.com/Sinedrone-Sentinel/dumpers_repo/main/public' as const

/** Shown site-wide via AppChrome footer when DFP display is disabled (see DfpOptOutFooter). */
export const DFP_OPT_OUT_NOTICE =
  'This site has opted out of using/displaying Dumper\'s Fair-Value Price (DFP).' as const
