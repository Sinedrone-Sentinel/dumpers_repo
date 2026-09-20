/**
 * Where-to-buy retrieval for mining loadout gear.
 *
 * Pure functions only (no imports) so the same code runs in the Edge Function and in
 * the Node unit suite. The baked index is built by `npm run copy-mining-advisor-catalog`
 * from `src/data/mining-gear-shops.json`, which is refreshed on patch day by
 * `npm run fetch-mining-gear-shops`.
 *
 * Scope: mining heads, modules and gadgets. The index contains nothing else, so the
 * advisor physically cannot answer "where do I buy ammo / armour / a ship".
 */

export interface GearShopTerminal {
  id: number
  name: string
  system: string | null
}

export interface GearShopListing {
  t: number
  buy: number
}

export type GearShopKind = 'head' | 'module' | 'gadget'

export interface GearShopItem {
  displayName: string
  kind: GearShopKind
  /** Every known terminal, cheapest first. Empty means UEX knows of no seller. */
  listings: GearShopListing[]
}

export interface GearShopIndex {
  generatedAt: string | null
  attribution: string
  sourceUrl: string
  gameVersions: string[]
  terminals: GearShopTerminal[]
  items: GearShopItem[]
}

/** Words that mean "tell me where to get this", as opposed to "is it any good". */
const BUY_INTENT =
  /\b(buy|buying|bought|purchase|purchasing|shop|shops|store|stores|kiosk|stock|stocked|sell|sells|sold|vendor|vendors|price|prices|pricing|cost|costs|cheap|cheapest|afford|auec|where)\b/i

const ROMAN_TO_ARABIC: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' }

/** Lowercase alphanumerics only — "Hofstede-S2" and "hofstede s2" collapse to one key. */
export function normalizeGearText(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function hasBuyIntent(question: string): boolean {
  return BUY_INTENT.test(String(question ?? ''))
}

/**
 * Search keys for one item: the full display name, the name without its category suffix,
 * and roman-numeral variants so "Helix 2" finds "Helix II Mining Laser".
 */
function aliasesFor(displayName: string): string[] {
  const tokens = String(displayName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (!tokens.length) return []

  const trimmed = [...tokens]
  while (
    trimmed.length > 1 &&
    ['laser', 'mining', 'module', 'head', 'gadget'].includes(trimmed[trimmed.length - 1])
  ) {
    trimmed.pop()
  }

  const variants = new Set<string>()
  for (const form of [tokens, trimmed]) {
    if (!form.length) continue
    variants.add(form.join(''))
    const arabic = form.map((t) => ROMAN_TO_ARABIC[t] ?? t)
    variants.add(arabic.join(''))
  }
  return [...variants].filter((v) => v.length >= 4)
}

/**
 * Gear named in the question. Longest alias wins, so "Helix II" never resolves to the
 * "Helix I" whose key is a substring of it.
 */
export function findGearInText(index: GearShopIndex, text: string): GearShopItem[] {
  const haystack = normalizeGearText(text)
  if (!haystack) return []

  const hits: Array<{ item: GearShopItem; alias: string }> = []
  for (const item of index.items ?? []) {
    let best = ''
    for (const alias of aliasesFor(item.displayName)) {
      if (haystack.includes(alias) && alias.length > best.length) best = alias
    }
    if (best) hits.push({ item, alias: best })
  }

  return hits
    .filter((hit) => !hits.some((other) => other !== hit && other.alias.includes(hit.alias)))
    .map((hit) => hit.item)
}

function findByName(index: GearShopIndex, name: string): GearShopItem | null {
  const key = normalizeGearText(name)
  if (!key) return null
  return (index.items ?? []).find((item) => normalizeGearText(item.displayName) === key) ?? null
}

/**
 * Which gear the advisor should be handed buy locations for.
 *
 * Gear named in the question comes first; when the member asks "where do I buy these"
 * with nothing named, fall back to what they currently have equipped.
 */
export function resolveGearShopMatches(
  index: GearShopIndex,
  question: string,
  equippedNames: string[] = [],
  limit = 6,
): GearShopItem[] {
  if (!hasBuyIntent(question)) return []

  const matches = findGearInText(index, question)
  if (matches.length) return matches.slice(0, limit)

  const equipped: GearShopItem[] = []
  for (const name of equippedNames) {
    const item = findByName(index, name)
    if (item && !equipped.includes(item)) equipped.push(item)
  }
  return equipped.slice(0, limit)
}

function formatPrice(auec: number): string {
  return `${Math.round(auec).toLocaleString('en-US')} aUEC`
}

const KIND_LABEL: Record<GearShopKind, string> = {
  head: 'mining head',
  module: 'mining module',
  gadget: 'mining gadget',
}

/**
 * Compact, model-readable buy-location block. Display names only — terminal names are
 * already the in-game shop names UEX publishes.
 */
export function renderGearShopBlock(index: GearShopIndex, items: GearShopItem[]): string {
  if (!items.length) return ''

  const terminalById = new Map<number, GearShopTerminal>()
  for (const terminal of index.terminals ?? []) terminalById.set(terminal.id, terminal)

  const lines: string[] = []
  for (const item of items) {
    const label = `${item.displayName} (${KIND_LABEL[item.kind] ?? item.kind})`
    if (!item.listings.length) {
      lines.push(`- ${label}: no buy location on record.`)
      continue
    }

    const bySystem = new Map<string, string[]>()
    for (const listing of item.listings) {
      const terminal = terminalById.get(listing.t)
      if (!terminal) continue
      const system = terminal.system ?? 'Unknown system'
      const entry = `${terminal.name} ${formatPrice(listing.buy)}`
      const bucket = bySystem.get(system)
      if (bucket) bucket.push(entry)
      else bySystem.set(system, [entry])
    }
    if (!bySystem.size) {
      lines.push(`- ${label}: no buy location on record.`)
      continue
    }

    const cheapest = Math.min(...item.listings.map((l) => l.buy))
    lines.push(`- ${label}: cheapest ${formatPrice(cheapest)}, ${item.listings.length} terminals.`)
    for (const [system, entries] of bySystem) {
      lines.push(`  ${system}: ${entries.join('; ')}`)
    }
  }

  const asOf = index.generatedAt ? `, data as of ${index.generatedAt}` : ''
  const versions = index.gameVersions?.length ? `, game ${index.gameVersions.join('/')}` : ''
  return [
    `BUY LOCATIONS (${index.attribution}${asOf}${versions}) — crowdsourced, prices and stock can shift:`,
    ...lines,
  ].join('\n')
}
