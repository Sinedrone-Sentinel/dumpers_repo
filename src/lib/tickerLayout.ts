import type { SiteTickerItem, WhatsNewEntry } from './whatsNew'

/** Visual layout kinds for the Updates ticker (bar + list + detail). */
export type TickerLayoutKind = 'site' | 'game' | 'questionnaire' | 'dumper_apps'

export type TickerLayoutStyle = {
  kind: TickerLayoutKind
  label: string
  /** Badge + accent for bar/list */
  badgeClass: string
  /** Soft left accent / row tint */
  rowClass: string
  /** Scrolling bar text accent */
  textClass: string
  /** Bottom bar accent border when this type is showing */
  barAccentClass: string
}

export const TICKER_LAYOUTS: Record<TickerLayoutKind, TickerLayoutStyle> = {
  site: {
    kind: 'site',
    label: 'Site Update',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    rowClass: 'border-l-2 border-l-sky-500/70 hover:bg-sky-950/40',
    textClass: 'text-sky-100',
    barAccentClass: 'border-t-sky-500/40',
  },
  game: {
    kind: 'game',
    label: 'Game Update',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    rowClass: 'border-l-2 border-l-emerald-500/70 hover:bg-emerald-950/40',
    textClass: 'text-emerald-100',
    barAccentClass: 'border-t-emerald-500/40',
  },
  questionnaire: {
    kind: 'questionnaire',
    label: 'Questionnaire',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    rowClass: 'border-l-2 border-l-violet-500/70 hover:bg-violet-950/40',
    textClass: 'text-violet-100',
    barAccentClass: 'border-t-violet-500/40',
  },
  dumper_apps: {
    kind: 'dumper_apps',
    label: 'Dumper Apps',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    rowClass: 'border-l-2 border-l-amber-500/70 hover:bg-amber-950/40',
    textClass: 'text-amber-100',
    barAccentClass: 'border-t-amber-500/40',
  },
}

/** Strip legacy prefixes — badges carry the type now. */
export function cleanTickerHeadline(raw: string): string {
  return raw
    .replace(/^(SITE UPDATE|GAME UPDATE|QUESTIONNAIRE|DUMPER APPS|POLL RESULTS)\s*:\s*/i, '')
    .trim()
}

export function resolveTickerLayoutFromEntry(entry: WhatsNewEntry): TickerLayoutKind {
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

export function resolveTickerLayout(item: SiteTickerItem): TickerLayoutKind {
  if (item.type === 'questionnaire') return 'questionnaire'
  return resolveTickerLayoutFromEntry(item.entry)
}

export function getTickerLayout(item: SiteTickerItem): TickerLayoutStyle {
  return TICKER_LAYOUTS[resolveTickerLayout(item)]
}
