/** Franchise-required branding — do not remove or replace in licensed forks. */
export const SITE_BRAND_FONT = "'Orbitron', sans-serif" as const
export const SITE_BRAND_REPO_GRADIENT =
  'linear-gradient(90deg, #ea580c 0%, #f97316 45%, #facc15 100%)' as const
/** Raster favicon for browser tabs; header uses inline SVG in SiteBrandMark. */
export const SITE_BRAND_LOGO = '/favicon.svg' as const
export const SITE_OG_IMAGE_PATH = '/og-image.png' as const

export const SITE_URL = 'https://www.dumpers-repo.com' as const
export const SITE_TITLE = "Dumper's Repo — Buy. Craft. Sell." as const
export const SITE_DESCRIPTION =
  "Dumper's Repo — Buy. Craft. Sell. Blueprint tracking, custom orders, and fulfillment for Star Citizen." as const
export const SITE_OG_IMAGE = `${SITE_URL}${SITE_OG_IMAGE_PATH}` as const
export const SITE_SLOGAN = 'Buy. Craft. Sell.' as const
/** Fork-customizable footer copyright. */
export const SITE_COPYRIGHT =
  '© 2026 Black Star - All Blueprints Subject to Change Every Patch' as const

/** Canonical host for proprietary DFP engine (franchises must use this in production). */
export const DFP_CANONICAL_BASE_URL = 'https://www.dumpers-repo.com' as const

export const DFP_OPT_OUT_NOTICE =
  'This franchise has opted out of using/displaying Dumpers Fair-Value Pricing (DFP).' as const
