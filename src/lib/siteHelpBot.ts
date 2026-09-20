import { edgeInvokeError } from './geminiKeyVault'
import { supabase } from './supabase'
import type { AdvisorChatMessage } from './miningAdvisor'

/**
 * Site Help chat client.
 *
 * Same security model as the Smart Cracker Advisor: the member's own Gemini key
 * travels with the request, the Edge Function checks their JWT and their hourly
 * allowance, and the knowledge base is server-owned so the answer can only come
 * from the Information Archive.
 */
export const SITE_HELP_THREAD_STORAGE = 'dumpers_site_help_thread'

export interface SiteHelpAskInput {
  apiKey: string
  question: string
  messages: AdvisorChatMessage[]
  /** Page the member is on, so directions are relative to where they already are. */
  currentPath: string
}

export type SiteHelpAskResult =
  | { ok: true; answer: string; usage: unknown }
  | { ok: false; error: string; usage: unknown }

export async function askSiteHelp(input: SiteHelpAskInput): Promise<SiteHelpAskResult> {
  const { data, error } = await supabase.functions.invoke('site-help-bot', {
    body: {
      apiKey: input.apiKey.trim(),
      question: input.question,
      messages: input.messages.slice(-8),
      currentPath: input.currentPath,
    },
  })

  if (error) {
    // A 429 still carries a usage snapshot; surface it so the meter shows the cap.
    let usage: unknown = null
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        usage = ((await ctx.clone().json()) as { usage?: unknown })?.usage ?? null
      } catch {
        /* no usage on this error */
      }
    }
    return {
      ok: false,
      error: await edgeInvokeError(error, 'Help is unavailable right now.'),
      usage,
    }
  }

  const payload = data as { advice?: string; usage?: unknown } | null
  const answer = payload?.advice?.trim()
  if (!answer) return { ok: false, error: 'Help returned an empty answer.', usage: payload?.usage ?? null }
  return { ok: true, answer, usage: payload?.usage ?? null }
}
