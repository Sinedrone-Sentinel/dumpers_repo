/**
 * Site Help bot prompt building.
 *
 * Pure functions (no imports) so the Edge Function and the Node unit suite run
 * the same code. The knowledge base is baked from the Information Archive by
 * `npm run build-help-knowledge-base`.
 */

export interface HelpKnowledgePage {
  id: string
  title: string
  summary: string
  howTo: string[]
  relatedPages: string[]
}

export interface HelpKnowledgeBase {
  source: string
  pageCount: number
  pages: HelpKnowledgePage[]
  topics: Record<string, unknown>
  quickTips: unknown[]
  externalResources: unknown[]
  catalogs?: Record<string, unknown>
}

/**
 * Where the member is standing right now, so the bot can say "the button is in
 * the header of the page you're on" instead of describing a route they'd have to
 * go find. Mirrors the member-facing page names, never internal route ids.
 */
const PATH_LABELS: Array<[string, string]> = [
  ['/blueprints', 'Blueprints'],
  ['/wikelo', 'Wikelo'],
  ['/targets/live', 'Mission Tracker (Live Tracker)'],
  ['/targets', 'Mission Tracker'],
  ['/resources', 'Resource Tracker'],
  ['/mining-tracker', 'Mining Tracker'],
  ['/commodity-lookup', 'Commodity Lookup'],
  ['/orders', 'My Listings'],
  ['/bazaar', 'The Bazaar'],
  ['/archive', 'Information Archive'],
  ['/partnership', 'Partnership'],
  ['/contribute', 'Contribute'],
  ['/analytics', 'Analytics'],
  ['/support-dashboard', 'Support Dashboard'],
  ['/discord-subscribe', 'Discord Webhooks'],
]

/** Member-facing name of the page a pathname belongs to, or null if unknown. */
export function pageLabelForPath(path: string): string | null {
  const clean = String(path ?? '').split('?')[0].split('#')[0].trim()
  if (!clean) return null
  if (clean === '/') return 'Blueprints'
  for (const [prefix, label] of PATH_LABELS) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return label
  }
  return null
}

export function buildHelpSystemPrompt(input: {
  knowledge: HelpKnowledgeBase
  currentPath: string
  displayName: string
}): string {
  const pageLabel = pageLabelForPath(input.currentPath)

  const lines = [
    "You are the Help assistant for Dumper's Repo, a Star Citizen org site.",
    'You explain how to use this site: what each page does, how a workflow runs, and what a member needs before they can do something.',
    '',
    'Hard rules — never violate:',
    '- Answer only from the SITE GUIDE and SITE CATALOG below. Together they are the documentation for this site.',
    '- Never invent a page, button, tab, setting, or requirement. If the guide does not describe it, say you do not have it documented and suggest opening a Support ticket from the avatar menu.',
    '- Wikelo trades, missions, blueprints, components, weapons, ordnance, factions, mining, manufacturers, and lore are in SITE CATALOG. Answer those from the catalog. If a name is not listed, say it is not in the current site data.',
    '- A notForRelease flag means the game files mark that row Not For Release. Say that. Do not claim it is offered on the live board.',
    '- Never invent an aUEC price, a Dumper\'s Fair-Value Price, or a drop chance. Commodity Lookup is where buy and sell prices live. Smart Cracker in the Mining Tracker is where mining loadouts are worked out.',
    '- Never discuss officer tools, admin panels, moderation, database internals, migrations, API keys, or anything about how the site is built. You help members use the site, nothing more.',
    '- Never claim you performed an action. You cannot click buttons, change settings, post listings, or open pages. Tell the member what to click.',
    '- Use the member-facing names in the guide exactly. Never output an internal id, route path, or code identifier.',
    '- Keep answers short. Lead with the answer, then the steps. Do not restate the whole guide.',
    '- If a member asks something off-topic for this site, say so briefly and offer what you can help with.',
    '',
    input.displayName ? `You are helping ${input.displayName}.` : '',
    pageLabel
      ? `They are on the ${pageLabel} page right now — prefer directions relative to where they already are.`
      : 'You do not know which page they are on; do not guess.',
    '',
    `SITE GUIDE (${input.knowledge.pageCount} pages, from the Information Archive).`,
    'SITE CATALOG is knowledge.catalogs: Wikelo trades, missions, blueprints, components, weapons, ordnance, factions, mining, lore, and manufacturers. Use those lists for what the site currently shows.',
    JSON.stringify(input.knowledge),
  ]

  return lines.filter((line) => line !== '').join('\n')
}
