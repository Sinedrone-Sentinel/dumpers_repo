import { SITE_DESCRIPTION, SITE_OG_IMAGE, SITE_TITLE, SITE_URL } from './site'
import { SEO_LANDING_FAQS } from './seoFaqs'

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
  '/blueprints',
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
  '/blueprints/',
  '/wikelo/',
  '/targets/',
  '/resources/',
  '/mining-tracker/',
  '/commodity-lookup/',
  '/archive/',
  '/bazaar/',
  '/archive-guide.html',
] as const

const pages: Record<string, SeoPageConfig> = {
  '/': {
    title: "Star Citizen Blueprint Tracker & Crafting Tools | Dumper's Repo",
    description:
      "Free Star Citizen blueprint tracker and crafting tools: blueprint database, mission rewards, Wikelo barter guide, mining tracker, resources, and a community marketplace. Works offline — no account required.",
    canonicalPath: '/',
  },
  '/blueprints': {
    title: "Star Citizen Crafting Blueprint Database & Tracker | Dumper's Repo",
    description:
      'Free Star Citizen crafting blueprint database — browse craftable blueprint names by category from game data. Open Offline Mode for the full blueprint tracker with materials, mission rewards, and Dumper\'s Fair-Value Price (DFP).',
    canonicalPath: '/blueprints/',
  },
  '/wikelo': {
    title: "Wikelo Favors, Rep & Barter Trades Guide — Star Citizen | Dumper's Repo",
    description:
      'Complete Wikelo Emporium barter guide for Star Citizen — favors, reputation (rep), hand-in costs, rewards, customer rank, ships, armor, weapons, and gear. Search every trade in one place.',
    canonicalPath: '/wikelo/',
  },
  '/targets': {
    title: "Star Citizen Blueprint Mission Tracker | Dumper's Repo",
    description:
      'Star Citizen blueprint mission tracker — find which reputation contracts reward crafting blueprints, build a wishlist, track unlock progress, and sync with BP Dumper Live Tracker.',
    canonicalPath: '/targets/',
  },
  '/resources': {
    title: "Star Citizen Resource Tracker — Crafting Materials Stock | Dumper's Repo",
    description:
      'Track Star Citizen crafting resources and materials for fabricator planning — personal stock, notes, and can-craft views paired with blueprints and Dumper\'s Fair-Value Price (DFP).',
    canonicalPath: '/resources/',
  },
  '/mining-tracker': {
    title: "Star Citizen Mining Tracker — Ore Guide, RS & Ledgers | Dumper's Repo",
    description:
      'Star Citizen mining tracker with ore properties, location guide, cluster RS reference, spawn-weighted chances, and crew mining ledgers for share payouts.',
    canonicalPath: '/mining-tracker/',
  },
  '/commodity-lookup': {
    title: "Star Citizen Commodity Lookup — Buy & Sell Locations | Dumper's Repo",
    description:
      'Look up Star Citizen commodities — where to buy and sell, UEX per-SCU prices, SCU box sizes, and Dumper\'s Fair-Value Price (DFP) bases for trade planning.',
    canonicalPath: '/commodity-lookup/',
  },
  '/archive': {
    title: "Star Citizen Guides, Components & Lore Archive | Dumper's Repo",
    description:
      'Star Citizen information archive — member guides, faction standings, component database, ordnance reference, and resource lore for Dumper\'s Repo tools.',
    canonicalPath: '/archive/',
  },
  '/bazaar': {
    title: "Star Citizen Community Marketplace — WTB & WTS | Dumper's Repo",
    description:
      'The Bazaar — Star Citizen member WTB and WTS marketplace for crafted gear and blueprints. Sign in to shop, list, and fulfill with your community.',
    canonicalPath: '/bazaar/',
  },
  '/orders': {
    title: "My Listings — WTB & WTS Orders | Dumper's Repo",
    description:
      'Manage your Star Citizen WTB and WTS listings, fulfillments, and marketplace history on Dumper\'s Repo.',
    canonicalPath: '/orders/',
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
  const withSlash = path.startsWith('/') ? path : `/${path}`
  return `${base}${withSlash}`
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
          'Star Citizen blueprint tracker, Wikelo barter guide, mining tools, and community marketplace.',
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
          'Star Citizen crafting blueprint database and tracker',
          'Blueprint mission tracker and reputation rewards',
          'Wikelo favors, reputation, and barter trade guide',
          'Mining tracker with ore guide and RS reference',
          'Resource tracker for crafting materials',
          "Dumper's Fair-Value Price (DFP)",
          'Community WTB/WTS marketplace',
          'BP Dumper Game.log sync',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: SEO_LANDING_FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
          },
        })),
      },
    ],
  }
}
