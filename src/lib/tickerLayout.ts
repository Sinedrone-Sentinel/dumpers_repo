import type { SiteTickerItem, WhatsNewEntry } from './whatsNew'
import { stylesFromAccentHex, type TickerAccentStyles } from './tickerColors'
import { supabase } from './supabase'

export type TickerCategory = {
  id: string
  slug: string
  label: string
  accentHex: string
  entryKind: 'game' | 'site'
  sortOrder: number
  activeCount?: number
  totalCount?: number
}

export type TickerLayoutStyle = TickerAccentStyles & {
  id: string
  slug: string
  label: string
  accentHex: string
  entryKind: 'game' | 'site'
}

/** Offline / pre-fetch fallbacks matching migration seed. */
export const DEFAULT_TICKER_CATEGORIES: TickerCategory[] = [
  { id: 'fallback-site', slug: 'site', label: 'Site Update', accentHex: '#0EA5E9', entryKind: 'site', sortOrder: 10 },
  { id: 'fallback-game', slug: 'game', label: 'Game Update', accentHex: '#10B981', entryKind: 'game', sortOrder: 20 },
  {
    id: 'fallback-questionnaire',
    slug: 'questionnaire',
    label: 'Questionnaire',
    accentHex: '#8B5CF6',
    entryKind: 'site',
    sortOrder: 30,
  },
  {
    id: 'fallback-dumper_apps',
    slug: 'dumper_apps',
    label: 'Dumper Apps',
    accentHex: '#F59E0B',
    entryKind: 'site',
    sortOrder: 40,
  },
]

let cachedCategories: TickerCategory[] = DEFAULT_TICKER_CATEGORIES

export function getCachedTickerCategories(): TickerCategory[] {
  return cachedCategories
}

export function setCachedTickerCategories(rows: TickerCategory[]): void {
  cachedCategories = rows.length > 0 ? rows : DEFAULT_TICKER_CATEGORIES
}

export async function fetchTickerCategories(): Promise<TickerCategory[]> {
  try {
    const { data, error } = await supabase.rpc('list_ticker_categories')
    if (error || !data) {
      setCachedTickerCategories(DEFAULT_TICKER_CATEGORIES)
      return cachedCategories
    }
    const rows = (data as TickerCategory[]) ?? []
    setCachedTickerCategories(rows)
    return cachedCategories
  } catch {
    setCachedTickerCategories(DEFAULT_TICKER_CATEGORIES)
    return cachedCategories
  }
}

export const WHATS_NEW_CHANGED_EVENT = 'dumpers:whats-new-changed'

export function notifyWhatsNewChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WHATS_NEW_CHANGED_EVENT))
}

function categoryToLayout(cat: TickerCategory): TickerLayoutStyle {
  return {
    id: cat.id,
    slug: cat.slug,
    label: cat.label,
    accentHex: cat.accentHex,
    entryKind: cat.entryKind,
    ...stylesFromAccentHex(cat.accentHex),
  }
}

function findCategoryBySlug(slug: string | null | undefined): TickerCategory | null {
  if (!slug) return null
  const s = slug.toLowerCase()
  return cachedCategories.find((c) => c.slug === s) ?? null
}

function findCategoryById(id: string | null | undefined): TickerCategory | null {
  if (!id) return null
  return cachedCategories.find((c) => c.id === id) ?? null
}

/** Strip legacy prefixes — badges carry the type now. */
export function cleanTickerHeadline(raw: string): string {
  return raw
    .replace(/^(SITE UPDATE|GAME UPDATE|QUESTIONNAIRE|DUMPER APPS|POLL RESULTS)\s*:\s*/i, '')
    .trim()
}

/** Heuristic slug when entry has no tickerCategoryId (legacy / offline). */
export function resolveTickerCategorySlugFromEntry(entry: WhatsNewEntry): string {
  if (entry.tickerCategorySlug) return entry.tickerCategorySlug
  const cat = (entry.category || '').toLowerCase()
  const key = (entry.issueKey || '').toLowerCase()
  const head = (entry.headline || '').toLowerCase()
  const ver = (entry.version || '').toLowerCase()

  if (cat === 'questionnaire' || ver === 'poll' || key.startsWith('questionnaire')) {
    return 'questionnaire'
  }
  if (
    cat === 'dumper apps' ||
    cat === 'dumper' ||
    key.includes('dumper') ||
    head.includes('dumper apps') ||
    head.includes('bp dumper')
  ) {
    return 'dumper_apps'
  }
  if (entry.kind === 'site' || cat === 'site' || ver.startsWith('site')) {
    return 'site'
  }
  return 'game'
}

export function resolveTickerCategory(entry: WhatsNewEntry): TickerCategory {
  const byId = findCategoryById(entry.tickerCategoryId)
  if (byId) return byId
  const bySlug = findCategoryBySlug(entry.tickerCategorySlug || resolveTickerCategorySlugFromEntry(entry))
  if (bySlug) return bySlug
  return findCategoryBySlug('game') ?? DEFAULT_TICKER_CATEGORIES[1]
}

export function resolveTickerLayoutFromEntry(entry: WhatsNewEntry): TickerLayoutStyle {
  return categoryToLayout(resolveTickerCategory(entry))
}

export function resolveTickerLayout(item: SiteTickerItem): TickerLayoutStyle {
  if (item.type === 'questionnaire') {
    const cat = findCategoryBySlug('questionnaire') ?? DEFAULT_TICKER_CATEGORIES[2]
    return categoryToLayout(cat)
  }
  return resolveTickerLayoutFromEntry(item.entry)
}

export function getTickerLayout(item: SiteTickerItem): TickerLayoutStyle {
  return resolveTickerLayout(item)
}

/**
 * Uniform modal meta chips per layout kind.
 * Badge already shows the type — chips add only type-specific context.
 */
export function formatTickerMetaChips(entry: WhatsNewEntry): string[] {
  const layout = resolveTickerLayoutFromEntry(entry)
  const slug = layout.slug
  const n = entry.items?.length ?? 0
  const details = n > 0 ? `${n} detail${n === 1 ? '' : 's'}` : null

  switch (slug) {
    case 'site':
      return details ? [details] : []
    case 'dumper_apps':
      return ['Desktop app', ...(details ? [details] : [])]
    case 'questionnaire': {
      const isPoll =
        (entry.version || '').toLowerCase() === 'poll' ||
        (entry.action || '').toLowerCase() === 'results'
      return [isPoll ? 'Poll results' : 'Open form', ...(details && isPoll ? [details] : [])]
    }
    case 'game': {
      const cat = (entry.category || '').trim()
      const ver = (entry.version || '').trim()
      const chips: string[] = []
      if (cat && !/^general$/i.test(cat) && cat.toLowerCase() !== layout.label.toLowerCase()) {
        chips.push(cat)
      }
      if (ver && !ver.toLowerCase().startsWith('site') && ver.toLowerCase() !== 'poll') {
        chips.push(ver)
      }
      if (details) chips.push(details)
      return chips
    }
    default:
      return details ? [details] : []
  }
}
