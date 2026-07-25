import { SITE_DESCRIPTION, SITE_OG_IMAGE, SITE_TITLE, SITE_URL } from './site'

export type SeoPageConfig = {
  title: string
  description: string
  canonicalPath: string
  /** Optional og:image override (absolute or site path) */
  ogImage?: string
}

/** Paste Google Search Console HTML-tag content value here when verifying the property. */
export const SEO_GOOGLE_SITE_VERIFICATION = '' as const

export const SEO_PRERENDER_PATHS = [
  '/',
  '/wikelo',
  '/targets',
  '/resources',
  '/mining-tracker',
  '/commodity-lookup',
  '/archive',
  '/bazaar',
] as const

export const SEO_SITEMAP_PATHS = [
  '/',
  '/wikelo',
  '/targets',
  '/resources',
  '/mining-tracker',
  '/commodity-lookup',
  '/archive',
  '/bazaar',
  '/archive-guide.html',
] as const

const pages: Record<string, SeoPageConfig> = {
  '/': {
    title: "Dumper's Repo — Star Citizen Tools for Blueprints, Crafting & Trade",
    description:
      "Free Star Citizen tools hub: browse crafting blueprints and mission rewards, track resources and mining, plan with Dumper's Fair-Value Price (DFP), and use a community marketplace. Works offline — no account required to explore.",
    canonicalPath: '/',
  },
  '/wikelo': {
    title: "Wikelo Emporium Trades — Star Citizen Barter Guide | Dumper's Repo",
    description:
      'Browse every Wikelo Emporium barter trade in Star Citizen — hand-ins, rewards, reputation, and blueprint drops. Filter by ships, armor, weapons, and gear.',
    canonicalPath: '/wikelo',
  },
  '/targets': {
    title: "Mission Tracker — Star Citizen Blueprint Missions | Dumper's Repo",
    description:
      'Track Star Citizen crafting blueprint unlocks and browse reputation missions that reward blueprints. Build a personal wishlist and sync with BP Dumper.',
    canonicalPath: '/targets',
  },
  '/resources': {
    title: "Resource Tracker — Star Citizen Crafting Materials | Dumper's Repo",
    description:
      'Track mined and refined Star Citizen crafting resources, notes, and stock for fabricator planning. Pair with blueprints and Dumper\'s Fair-Value Price (DFP).',
    canonicalPath: '/resources',
  },
  '/mining-tracker': {
    title: "Mining Tracker — Star Citizen Ore Guide & Ledgers | Dumper's Repo",
    description:
      'Star Citizen mining tools: ore properties, location guidance, RS tracking, and crew mining ledgers.',
    canonicalPath: '/mining-tracker',
  },
  '/commodity-lookup': {
    title: "Commodity Lookup — Star Citizen Trade Reference | Dumper's Repo",
    description:
      'Look up Star Citizen commodities and Dumper\'s Fair-Value Price (DFP) bases for trading and crafting planning.',
    canonicalPath: '/commodity-lookup',
  },
  '/archive': {
    title: "Information Archive — Star Citizen Guides & Lore | Dumper's Repo",
    description:
      'Member guides, tips, faction reference, component database, and lore for Star Citizen tools on Dumper\'s Repo.',
    canonicalPath: '/archive',
  },
  '/bazaar': {
    title: "The Bazaar — Community Marketplace | Dumper's Repo",
    description:
      'Shop and fulfill Star Citizen member WTB and WTS listings. Sign in to trade crafted gear and blueprints with your community.',
    canonicalPath: '/bazaar',
  },
  '/orders': {
    title: "My Listings — WTB & WTS Orders | Dumper's Repo",
    description:
      'Manage your Star Citizen WTB and WTS listings, fulfillments, and marketplace history on Dumper\'s Repo.',
    canonicalPath: '/orders',
  },
}

export function getSeoForPath(pathname: string): SeoPageConfig {
  const path = normalizePath(pathname)
  return (
    pages[path] ?? {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      canonicalPath: path === '/' ? '/' : path,
    }
  )
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = SITE_URL.replace(/\/$/, '')
  if (!path || path === '/') return `${base}/`
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function resolveOgImage(seo: SeoPageConfig): string {
  if (!seo.ogImage) return SITE_OG_IMAGE
  return absoluteUrl(seo.ogImage)
}

function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  const bare = pathname.split('?')[0]?.split('#')[0] || '/'
  if (bare.length > 1 && bare.endsWith('/')) return bare.slice(0, -1)
  return bare || '/'
}

export function buildJsonLdGraph(): Record<string, unknown> {
  const url = absoluteUrl('/')
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${url}#website`,
        url,
        name: "Dumper's Repo",
        description: pages['/'].description,
        inLanguage: 'en',
        publisher: { '@id': `${url}#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${url}#organization`,
        name: "Dumper's Repo",
        url,
        logo: absoluteUrl('/favicon.png'),
        description:
          'Star Citizen tools for crafting blueprints, mining, resources, and a community marketplace.',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${url}#app`,
        name: "Dumper's Repo",
        applicationCategory: 'GameApplication',
        operatingSystem: 'Web',
        url,
        description: pages['/'].description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        featureList: [
          'Star Citizen crafting blueprint database',
          'Mission reward and blueprint tracker',
          'Resource and mining trackers',
          "Dumper's Fair-Value Price (DFP)",
          'Community WTB/WTS marketplace',
          'BP Dumper Game.log sync',
        ],
      },
    ],
  }
}
