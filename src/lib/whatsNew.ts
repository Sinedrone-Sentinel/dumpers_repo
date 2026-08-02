import { supabase } from './supabase'
import type { PendingQuestionnaire } from './questionnaires'
import { cleanTickerHeadline, notifyWhatsNewChanged } from './tickerLayout'

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
  tickerCategoryId?: string | null
  tickerCategorySlug?: string | null
  tickerCategoryLabel?: string | null
  accentHex?: string | null
  active?: boolean
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

export type AdminUpsertWhatsNewPayload = {
  id?: string | null
  issueKey?: string | null
  version?: string | null
  category?: string | null
  action?: string | null
  headline: string
  items?: WhatsNewItem[]
  kind?: WhatsNewKind | null
  detectedAt?: string | null
  tickerCategoryId: string
}

export type AdminMutationResult = {
  success: boolean
  error?: string
  id?: string
  activeCount?: number
  updatedExisting?: boolean
}

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

/** Lists remaining ticker rows. Server purges expired first (same TTL as cron). */
export async function adminListWhatsNewEntries(): Promise<WhatsNewEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_whats_new_entries')
  if (error) throw new Error(error.message)
  return (data as WhatsNewEntry[]) ?? []
}

export async function adminUpsertWhatsNewEntry(
  payload: AdminUpsertWhatsNewPayload
): Promise<AdminMutationResult> {
  const { data, error } = await supabase.rpc('admin_upsert_whats_new_entry', {
    p_entry: payload,
  })
  if (error) throw new Error(error.message)
  const result = (data as AdminMutationResult) ?? { success: false, error: 'Unknown error' }
  if (result.success) notifyWhatsNewChanged()
  return result
}

export async function adminDeleteWhatsNewEntry(id: string): Promise<AdminMutationResult> {
  const { data, error } = await supabase.rpc('admin_delete_whats_new_entry', { p_id: id })
  if (error) throw new Error(error.message)
  const result = (data as AdminMutationResult) ?? { success: false, error: 'Unknown error' }
  if (result.success) notifyWhatsNewChanged()
  return result
}

export async function adminListTickerCategories() {
  const { data, error } = await supabase.rpc('admin_list_ticker_categories')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function adminUpsertTickerCategory(payload: {
  id?: string | null
  slug: string
  label: string
  accentHex: string
  entryKind: WhatsNewKind
  ttlDays: number
  sortOrder?: number
}): Promise<AdminMutationResult> {
  const { data, error } = await supabase.rpc('admin_upsert_ticker_category', {
    p_category: payload,
  })
  if (error) throw new Error(error.message)
  const result = (data as AdminMutationResult) ?? { success: false, error: 'Unknown error' }
  if (result.success) notifyWhatsNewChanged()
  return result
}

export async function adminDeleteTickerCategory(id: string): Promise<AdminMutationResult> {
  const { data, error } = await supabase.rpc('admin_delete_ticker_category', { p_id: id })
  if (error) throw new Error(error.message)
  const result = (data as AdminMutationResult) ?? { success: false, error: 'Unknown error' }
  if (result.success) notifyWhatsNewChanged()
  return result
}
