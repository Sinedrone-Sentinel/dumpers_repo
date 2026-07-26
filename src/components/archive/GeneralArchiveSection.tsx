import React from 'react'

interface LinkItem {
  title: string
  description: string
  url: string
  icon: React.ReactNode
}

const EXTERNAL_LINKS: LinkItem[] = [
  {
    title: 'Star Citizen Wiki',
    description: 'Community wiki with comprehensive game information',
    url: 'https://starcitizen.tools',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    title: 'Erkul Games',
    description: 'DPS calculator and ship loadout planner',
    url: 'https://www.erkul.games',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Universal Item Finder',
    description: 'Search for in-game items and their locations',
    url: 'https://finder.cstone.space',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    title: 'Cornerstone',
    description: 'Trading and economy tracker',
    url: 'https://cstone.space',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    title: 'Star Citizen Trade Tools',
    description: 'Mining and trading calculators',
    url: 'https://sc-trade.tools',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    title: 'RSI Website',
    description: 'Official Star Citizen website',
    url: 'https://robertsspaceindustries.com',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

const TIPS: { title: string; content: string }[] = [
  {
    title: 'Blueprint Rewards',
    content:
      "Blueprints are awarded from contracts at specific reputation levels. Use Mission Tracker to plan targets and browse missions; BP Dumper + Live Tracker on that page sync unlocks and show what is still dropping from active contracts.",
  },
  {
    title: 'Resource Tracking',
    content: 'Use the Resource Tracker to keep inventory of your mined and refined materials. Dumper\'s Fair-Value Price (DFP) calculates fair market values based on quality tiers.',
  },
  {
    title: 'Quality Tiers',
    content: 'Resource quality ranges from 500 (base) to 1000 (perfect). Higher quality resources have exponentially higher DFP values, especially at Q850 and above.',
  },
  {
    title: 'Standing Progression',
    content: 'Each faction has its own reputation tiers — and many have multiple career tracks (Security, Bounty, Hauling, etc.) with different rank names. Mission tags show which career path a requirement belongs to when known.',
  },
]

const DATA_SOURCES: { title: string; content: string }[] = [
  {
    title: 'Game catalog data',
    content:
      'Blueprints, components, ordnance, mining spawns, factions, Archive lore, and RS signature references are kept in sync with Star Citizen game data when the site is updated.',
  },
  {
    title: 'DFP pricing',
    content:
      'Dumper\'s Fair-Value Price (DFP) is a proprietary pricing engine loaded from the official site bundle. The site does not pull live prices from third-party market APIs.',
  },
  {
    title: 'Not included here',
    content:
      'Live in-game shop inventories are not part of Dumper\'s Repo. For item locations and market lookup, use the external tools listed below.',
  },
]

export default function GeneralArchiveSection() {
  return (
    <div className="space-y-8">
      {/* Quick tips */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Quick Tips
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {TIPS.map((tip) => (
            <div
              key={tip.title}
              className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50"
            >
              <h4 className="text-sm font-medium text-orange-300 mb-1">{tip.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{tip.content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Data sources */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Data Sources
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {DATA_SOURCES.map((source) => (
            <div
              key={source.title}
              className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50"
            >
              <h4 className="text-sm font-medium text-orange-300 mb-1">{source.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{source.content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Organizations */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Organizations
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Looking for an org to join? Check out the RSI Organization Hub to find a community that fits your playstyle.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="https://robertsspaceindustries.com/en/community/orgs"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-orange-500/30 hover:bg-slate-800/60 transition-all"
          >
            <div className="shrink-0 p-2 rounded-lg bg-slate-700/50 text-slate-400 group-hover:text-orange-400 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors flex items-center gap-1">
                RSI Organization Hub
                <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">Browse all Star Citizen organizations on the official RSI site</p>
            </div>
          </a>

          <a
            href="https://robertsspaceindustries.com/en/orgs/BSTR"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 p-3 rounded-lg bg-gradient-to-br from-slate-800/60 to-orange-900/20 border border-orange-500/30 hover:border-orange-500/50 hover:from-slate-800/80 hover:to-orange-900/30 transition-all"
          >
            <div className="shrink-0 p-2 rounded-lg bg-orange-500/20 text-orange-400 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors flex items-center gap-1">
                Black Star [BSTR]
                <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </h4>
              <p className="text-[10px] text-orange-400/80 uppercase tracking-wide">Site Sponsor</p>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">Industrial and defense enterprise focused on extraction, production, and trade</p>
            </div>
          </a>
        </div>
      </section>

      {/* External resources */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          External Resources
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXTERNAL_LINKS.map((link) => (
            <a
              key={link.title}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-orange-500/30 hover:bg-slate-800/60 transition-all"
            >
              <div className="shrink-0 p-2 rounded-lg bg-slate-700/50 text-slate-400 group-hover:text-orange-400 transition-colors">
                {link.icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors flex items-center gap-1">
                  {link.title}
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{link.description}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <p className="text-[10px] text-slate-500">
          This site is not affiliated with Cloud Imperium Games or Roberts Space Industries.
          All game content and materials are trademarks and copyrights of their respective owners.
        </p>
      </section>
    </div>
  )
}
