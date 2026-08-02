import { supabase } from './supabase'
import type { PendingQuestionnaire } from './questionnaires'
import { cleanTickerHeadline } from './tickerLayout'

export type WhatsNewAction = 'added' | 'removed' | 'changed' | 'corrected' | string

export type WhatsNewItem = {
  key: string
  label: string
  summary?: string | null
}

export type WhatsNewKind = 'game' | 'site'

export type WhatsNewEntry = {
  id: string
  issueKey: string
  version: string
  category: string
  action: WhatsNewAction
  headline: string
  detectedAt: string
  expiresAt: string
  items: WhatsNewItem[]
  /** site = 3-day TTL; game = 7-day TTL (default) */
  kind?: WhatsNewKind
}

export type SiteTickerWhatsNew = {
  type: 'whats_new'
  id: string
  headline: string
  entry: WhatsNewEntry
}

export type SiteTickerQuestionnaire = {
  type: 'questionnaire'
  id: string
  headline: string
  questionnaireId: string
  title: string
  description?: string | null
}

export type SiteTickerItem = SiteTickerWhatsNew | SiteTickerQuestionnaire

export async function fetchActiveWhatsNewEntries(): Promise<WhatsNewEntry[]> {
  try {
    const { data, error } = await supabase.rpc('list_active_whats_new')
    if (error || !data) return []
    return (data as WhatsNewEntry[]) ?? []
  } catch {
    return []
  }
}

export function buildSiteTickerItems(
  whatsNewEntries: WhatsNewEntry[],
  pendingQuestionnaires: PendingQuestionnaire[]
): SiteTickerItem[] {
  const whatsNew: SiteTickerWhatsNew[] = (whatsNewEntries ?? []).map((entry) => ({
    type: 'whats_new',
    id: `wn:${entry.id}`,
    headline: cleanTickerHeadline(entry.headline),
    entry,
  }))

  const questionnaires: SiteTickerQuestionnaire[] = (pendingQuestionnaires ?? []).map((q) => ({
    type: 'questionnaire',
    id: `q:${q.id}`,
    headline: cleanTickerHeadline(q.title),
    questionnaireId: q.id,
    title: q.title,
    description: q.description,
  }))

  // Questionnaires first so members see actionable prompts before patch digests.
  return [...questionnaires, ...whatsNew]
}
