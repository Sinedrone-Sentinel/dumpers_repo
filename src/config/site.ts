// =============================================================================
// BRAND ASSETS - DO NOT MODIFY (required per LICENSE)
// =============================================================================
/** Franchise-required branding — do not remove or replace in licensed forks. */
export const SITE_BRAND_FONT = "'Orbitron', sans-serif" as const
export const SITE_BRAND_REPO_GRADIENT =
  'linear-gradient(90deg, #ea580c 0%, #f97316 45%, #facc15 100%)' as const
/** Raster favicon for browser tabs; header uses inline SVG in SiteBrandMark. */
export const SITE_BRAND_LOGO = '/favicon.svg' as const
export const SITE_OG_IMAGE_PATH = '/og-image.png' as const

// =============================================================================
// FRANCHISE CUSTOMIZABLE - Update these for your deployment
// =============================================================================
/** Your franchise's canonical URL (used for SEO, og:url) */
export const SITE_URL = 'https://www.dumpers-repo.com' as const
/** Browser tab title and og:title */
export const SITE_TITLE = "Dumper's Repo — Buy. Craft. Sell." as const
/** Meta description and og:description */
export const SITE_DESCRIPTION =
  "Dumper's Repo — Buy. Craft. Sell. Blueprint tracking, custom orders, and fulfillment for Star Citizen." as const
export const SITE_OG_IMAGE = `${SITE_URL}${SITE_OG_IMAGE_PATH}` as const
/** Tagline shown in UI */
export const SITE_SLOGAN = 'Buy. Craft. Sell.' as const
/** Footer copyright - customize with your org name per TRADEMARK.md */
export const SITE_COPYRIGHT =
  '© 2026 Black Star - All Blueprints Subject to Change Every Patch' as const

// =============================================================================
// DFP CONFIGURATION - DO NOT MODIFY (required per LICENSE)
// =============================================================================
/** Official deployment hostnames — load DFP same-origin (avoids apex/www CORS issues). */
export const DFP_OFFICIAL_HOSTS = ['dumpers-repo.com', 'www.dumpers-repo.com'] as const

/**
 * Canonical DFP base for franchise forks (cross-origin).
 * raw.githubusercontent.com serves ACAO:* so forks can fetch the engine.
 * Franchises MUST load DFP from this URL per LICENSE - do not self-host.
 */
export const DFP_CANONICAL_BASE_URL =
  'https://raw.githubusercontent.com/Sinedrone-Sentinel/dumpers_repo/main/public' as const

/** Shown site-wide via AppChrome footer when DFP display is disabled (see DfpOptOutFooter). */
export const DFP_OPT_OUT_NOTICE =
  'This franchise has opted out of using/displaying Dumpers Fair-Value Pricing (DFP).' as const
