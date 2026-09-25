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

/**
 * Catalog JSON attached to one question. The baked file is much larger than a
 * free-tier Gemini request can accept, so only the lists this question needs
 * are copied into the prompt.
 */
export const HELP_PROMPT_CATALOG_BUDGET_BYTES = 110_000

const CATALOG_ROUTES: Array<{ keys: string[]; terms: string[]; paths: string[] }> = [
  {
    keys: ['wikelo'],
    terms: ['wikelo', 'favor', 'turn-in', 'turn in', 'turnin', 'barter', 'emporium', 'hand in', 'hand-in', 'handin'],
    paths: ['/wikelo'],
  },
  {
    keys: ['blueprints'],
    terms: ['blueprint', 'blueprints', 'craft', 'crafting', 'recipe'],
    paths: ['/blueprints'],
  },
  {
    keys: ['missions'],
    terms: ['mission', 'missions', 'contract', 'contracts', 'bounty', 'mercenary'],
    paths: ['/targets'],
  },
  {
    keys: ['components'],
    terms: ['component', 'components', 'cooler', 'coolers', 'power plant', 'quantum drive', 'shield'],
    paths: [],
  },
  {
    keys: ['weapons'],
    terms: ['rifle', 'pistol', 'shotgun', 'fps weapon', 'fps weapons'],
    paths: [],
  },
  {
    keys: ['ordnance'],
    terms: ['missile', 'missiles', 'torpedo', 'torpedoes', 'ordnance'],
    paths: [],
  },
  {
    keys: ['factions'],
    terms: ['faction', 'factions', 'standing', 'reputation'],
    paths: [],
  },
  {
    keys: ['mining', 'miningLasers', 'miningModules', 'miningGadgets'],
    terms: ['mining', 'ore', 'ores', 'mineable', 'quantanium', 'quantainium', 'laser', 'gadget'],
    paths: ['/mining-tracker'],
  },
  {
    keys: ['lore'],
    terms: ['lore', 'flavor'],
    paths: [],
  },
  {
    keys: ['manufacturers'],
    terms: ['manufacturer', 'manufacturers', 'who makes', 'made by'],
    paths: [],
  },
]

const QUESTION_STOP = new Set([
  'what', 'which', 'who', 'how', 'the', 'and', 'for', 'that', 'this', 'with', 'from',
  'have', 'has', 'does', 'your', 'about', 'into', 'they', 'them', 'then', 'than',
  'when', 'where', 'want', 'need', 'asks', 'ask', 'site', 'page', 'help',
])

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function cleanPath(path: string): string {
  const clean = String(path ?? '').split('?')[0].split('#')[0].trim()
  if (!clean || clean === '/') return '/blueprints'
  return clean
}

function questionTokens(question: string): string[] {
  const lower = String(question ?? '').toLowerCase()
  const out = new Set<string>()
  for (const word of lower.split(/[^a-z0-9-]+/)) {
    if (!word || QUESTION_STOP.has(word)) continue
    if (word.length >= 4 || /\d/.test(word)) out.add(word)
  }
  return [...out]
}

function rowText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(rowText).join(' ')
  if (value && typeof value === 'object') return Object.values(value).map(rowText).join(' ')
  return ''
}

function rankRows(rows: unknown[], tokens: string[]): unknown[] {
  const scored: Array<{ row: unknown; score: number }> = []
  for (const row of rows) {
    const blob = rowText(row).toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (blob.includes(token)) score += token.length
    }
    if (score > 0) scored.push({ row, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((entry) => entry.row)
}

function rowName(row: unknown): string {
  if (typeof row === 'string') return row
  if (!row || typeof row !== 'object') return ''
  const record = row as { name?: unknown; title?: unknown }
  if (typeof record.name === 'string') return record.name
  if (typeof record.title === 'string') return record.title
  return ''
}

function takeUntil(rows: unknown[], budget: number): unknown[] {
  const kept: unknown[] = []
  for (const row of rows) {
    const next = kept.concat([row])
    if (jsonBytes(next) > budget) break
    kept.push(row)
  }
  return kept
}

function wantedCatalogKeys(question: string, path: string): { keys: string[]; asked: boolean } {
  const lower = String(question ?? '').toLowerCase()
  const page = cleanPath(path)
  const keys: string[] = []
  const seen = new Set<string>()
  const add = (key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    keys.push(key)
  }
  let asked = false
  for (const route of CATALOG_ROUTES) {
    if (!route.terms.some((term) => lower.includes(term))) continue
    asked = true
    route.keys.forEach(add)
  }
  if (!asked) {
    for (const route of CATALOG_ROUTES) {
      const onPage = route.paths.some((prefix) => page === prefix || page.startsWith(`${prefix}/`))
      if (onPage) route.keys.forEach(add)
    }
  }
  return { keys, asked }
}

function packCatalog(
  key: string,
  value: unknown,
  tokens: string[],
  budget: number,
  allowNames: boolean,
): unknown | null {
  if (jsonBytes(value) <= budget) return value
  if (!Array.isArray(value)) return null
  const hits = key === 'lore' ? rankRows(value, tokens).slice(0, 12) : rankRows(value, tokens)
  if (hits.length > 0) {
    const kept = takeUntil(hits, budget)
    return kept.length > 0 ? kept : null
  }
  if (key === 'lore' || !allowNames) return null
  const names = value.map(rowName).filter((name) => name.length > 0)
  const kept = takeUntil(names, budget)
  return kept.length > 0 ? kept : null
}

/** Catalog slices that fit a single Gemini request for this question and page. */
export function selectHelpCatalogs(
  catalogs: Record<string, unknown> | undefined,
  question: string,
  path: string,
): Record<string, unknown> {
  if (!catalogs) return {}
  const tokens = questionTokens(question)
  const { keys, asked } = wantedCatalogKeys(question, path)
  const selected: Record<string, unknown> = {}
  let used = 0
  const pending: string[] = []
  for (const key of keys) {
    const value = catalogs[key]
    if (value == null) continue
    const size = jsonBytes(value)
    if (size <= HELP_PROMPT_CATALOG_BUDGET_BYTES - used) {
      selected[key] = value
      used += size
    } else {
      pending.push(key)
    }
  }
  for (const key of pending) {
    const packed = packCatalog(key, catalogs[key], tokens, HELP_PROMPT_CATALOG_BUDGET_BYTES - used, asked)
    if (packed == null) continue
    const size = jsonBytes(packed)
    if (size > HELP_PROMPT_CATALOG_BUDGET_BYTES - used) continue
    selected[key] = packed
    used += size
  }
  if (Object.keys(selected).length > 0 && typeof catalogs.gameVersion === 'string') {
    selected.gameVersion = catalogs.gameVersion
  }
  return selected
}

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
  question?: string
}): string {
  const pageLabel = pageLabelForPath(input.currentPath)
  const catalogs = selectHelpCatalogs(input.knowledge.catalogs, input.question ?? '', input.currentPath)
  const catalogNames = Object.keys(catalogs).filter((key) => key !== 'gameVersion')
  const promptKnowledge = {
    source: input.knowledge.source,
    pageCount: input.knowledge.pageCount,
    pages: input.knowledge.pages,
    topics: input.knowledge.topics,
    quickTips: input.knowledge.quickTips,
    externalResources: input.knowledge.externalResources,
    catalogs,
  }

  const lines = [
    "You are the Help assistant for Dumper's Repo, a Star Citizen org site.",
    'You explain how to use this site: what each page does, how a workflow runs, and what a member needs before they can do something.',
    '',
    'Hard rules — never violate:',
    '- Answer only from the SITE GUIDE and SITE CATALOG below. Together they are the documentation for this site.',
    '- Never invent a page, button, tab, setting, or requirement. If the guide does not describe it, say you do not have it documented and suggest opening a Support ticket from the avatar menu.',
    '- SITE CATALOG for this question only includes the lists named below. Answer catalog questions from those lists. If a name is not in the loaded lists, say it is not in the lists loaded for this question and point at the page that covers it. Do not invent it.',
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
    catalogNames.length > 0
      ? `SITE CATALOG loaded for this question: ${catalogNames.join(', ')}.`
      : 'SITE CATALOG loaded for this question: none. Use the how-to guide. Do not invent catalog facts.',
    JSON.stringify(promptKnowledge),
  ]

  return lines.filter((line) => line !== '').join('\n')
}
