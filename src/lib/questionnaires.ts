import { supabase } from './supabase'

export type QuestionnaireStatus = 'draft' | 'active' | 'archived'
export type AvailabilityUnit = 'days' | 'weeks'
export type QuestionType = 'text' | 'radio' | 'checkbox'

export type QuestionConfig = {
  minLength?: number
  maxLength?: number
  options?: string[]
  minSelected?: number
  maxSelected?: number
}

export type QuestionnaireQuestion = {
  id?: string
  sort_order?: number
  prompt: string
  required: boolean
  question_type: QuestionType
  config: QuestionConfig
}

export type QuestionnaireListItem = {
  id: string
  title: string
  description: string
  status: QuestionnaireStatus
  audience_guest: boolean
  audience_registered: boolean
  audience_rsi_verified: boolean
  public_results: boolean
  results_published_at: string | null
  availability_value: number
  availability_unit: AvailabilityUnit
  activated_at: string | null
  available_until: string | null
  created_at: string
  question_count: number
  response_count: number
  declined_count: number
  submitted_count: number
}

export type QuestionnaireDetail = {
  id: string
  title: string
  description: string
  status: QuestionnaireStatus
  audience_guest: boolean
  audience_registered: boolean
  audience_rsi_verified: boolean
  public_results: boolean
  results_published_at: string | null
  availability_value: number
  availability_unit: AvailabilityUnit
  activated_at: string | null
  available_until: string | null
  questions: QuestionnaireQuestion[]
}

export type PendingQuestionnaire = {
  id: string
  title: string
  description: string
  available_until: string | null
}

export type FillQuestionnaire = {
  id: string
  title: string
  description: string
  available_until: string | null
  questions: QuestionnaireQuestion[]
}

export type AnonymousResponseRow = {
  id: string
  submitted_at: string
  answers: Array<{
    question_id: string
    prompt: string
    question_type: QuestionType
    value: Record<string, unknown>
  }>
}

export type AnswerMap = Record<
  string,
  { text?: string; option?: string; options?: string[] }
>

const GUEST_KEY_STORAGE = 'dumpers_questionnaire_guest_key'

export function getOrCreateQuestionnaireGuestKey(): string {
  try {
    const existing = localStorage.getItem(GUEST_KEY_STORAGE)
    if (existing && existing.length >= 8) return existing
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(GUEST_KEY_STORAGE, key)
    return key
  } catch {
    return `guest_session_${Date.now()}`
  }
}

function rpcError(error: { message?: string } | null): string {
  return error?.message || 'Request failed'
}

export async function adminListQuestionnaires(): Promise<{
  data: QuestionnaireListItem[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('admin_list_questionnaires')
  if (error) return { data: [], error: rpcError(error) }
  return { data: (data as QuestionnaireListItem[]) ?? [] }
}

export async function adminGetQuestionnaire(id: string): Promise<{
  data: QuestionnaireDetail | null
  error?: string
}> {
  const { data, error } = await supabase.rpc('admin_get_questionnaire', { p_id: id })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as QuestionnaireDetail }
}

export async function adminSaveQuestionnaire(input: {
  id?: string | null
  title: string
  description: string
  audience_guest: boolean
  audience_registered: boolean
  audience_rsi_verified: boolean
  public_results: boolean
  availability_value: number
  availability_unit: AvailabilityUnit
  questions: QuestionnaireQuestion[]
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_save_questionnaire', {
    p_id: input.id ?? null,
    p_title: input.title,
    p_description: input.description,
    p_audience_guest: input.audience_guest,
    p_audience_registered: input.audience_registered,
    p_audience_rsi_verified: input.audience_rsi_verified,
    p_public_results: input.public_results,
    p_availability_value: input.availability_value,
    p_availability_unit: input.availability_unit,
    p_questions: input.questions.map((q, i) => ({
      prompt: q.prompt,
      required: q.required,
      question_type: q.question_type,
      config: q.config ?? {},
      sort_order: i,
    })),
  })
  if (error) return { error: rpcError(error) }
  return { id: data as string }
}

export async function adminActivateQuestionnaire(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_activate_questionnaire', { p_id: id })
  return error ? { error: rpcError(error) } : {}
}

export async function adminArchiveQuestionnaire(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_archive_questionnaire', { p_id: id })
  return error ? { error: rpcError(error) } : {}
}

export async function adminDeleteQuestionnaire(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_delete_questionnaire', { p_id: id })
  return error ? { error: rpcError(error) } : {}
}

export async function adminListQuestionnaireResponses(id: string): Promise<{
  data: AnonymousResponseRow[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('admin_list_questionnaire_responses', { p_id: id })
  if (error) return { data: [], error: rpcError(error) }
  return { data: (data as AnonymousResponseRow[]) ?? [] }
}

export async function listPendingQuestionnaires(isGuest: boolean): Promise<{
  data: PendingQuestionnaire[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('list_pending_questionnaires', {
    p_guest_key: isGuest ? getOrCreateQuestionnaireGuestKey() : null,
  })
  if (error) return { data: [], error: rpcError(error) }
  return { data: (data as PendingQuestionnaire[]) ?? [] }
}

export async function getQuestionnaireForFill(
  id: string,
  isGuest: boolean
): Promise<{ data: FillQuestionnaire | null; error?: string }> {
  const { data, error } = await supabase.rpc('get_questionnaire_for_fill', {
    p_id: id,
    p_guest_key: isGuest ? getOrCreateQuestionnaireGuestKey() : null,
  })
  if (error) return { data: null, error: rpcError(error) }
  return { data: data as FillQuestionnaire }
}

export async function submitQuestionnaireResponse(
  id: string,
  answers: AnswerMap,
  isGuest: boolean
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('submit_questionnaire_response', {
    p_id: id,
    p_answers: answers,
    p_guest_key: isGuest ? getOrCreateQuestionnaireGuestKey() : null,
  })
  return error ? { error: rpcError(error) } : {}
}

export async function declineQuestionnaire(
  id: string,
  isGuest: boolean
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('decline_questionnaire', {
    p_id: id,
    p_guest_key: isGuest ? getOrCreateQuestionnaireGuestKey() : null,
  })
  return error ? { error: rpcError(error) } : {}
}

/** Remove stale questionnaire bell items; create missing ones for late joiners. */
export async function syncQuestionnaireNotificationsForMe(): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('sync_questionnaire_notifications_for_me')
  return error ? { error: rpcError(error) } : {}
}
