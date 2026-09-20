import { decryptAdvisorSecret, encryptAdvisorSecret, isAdvisorLockPhrase } from './miningAdvisorCrypto'
import { supabase } from './supabase'

/**
 * One saved Gemini key per profile, shared by every AI chat on the site.
 *
 * The key is wrapped on the member's device with their lock phrase before it
 * ever leaves the browser (see miningAdvisorCrypto) — the server only ever holds
 * ciphertext, and the lock phrase is never stored anywhere.
 *
 * The RPCs keep their original `mining_advisor_*` names from migration 190; they
 * were never mining-specific in behaviour, so both the Smart Cracker Advisor and
 * the site Help bot read the same blob. Saving in one unlocks the other.
 */
export type GeminiKeyResult = { ok: true; advice: string } | { ok: false; error: string }

export const GEMINI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey'

/** Fired when a key is saved or removed so open chats and Settings stay in sync. */
export const GEMINI_SAVED_KEY_EVENT = 'dumpers:mining-advisor-saved-key'

export function notifyGeminiSavedKeyChanged(): void {
  window.dispatchEvent(new Event(GEMINI_SAVED_KEY_EVENT))
}

export async function hasSavedGeminiKey(): Promise<boolean> {
  const { data, error } = await supabase.rpc('mining_advisor_has_saved_key')
  if (error) return false
  return data === true
}

export async function saveGeminiKey(apiKey: string, lockPhrase: string): Promise<GeminiKeyResult> {
  if (!isAdvisorLockPhrase(lockPhrase)) {
    return { ok: false, error: 'Choose a lock phrase of at least 10 characters.' }
  }
  let ciphertext: string
  try {
    ciphertext = await encryptAdvisorSecret(apiKey.trim(), lockPhrase)
  } catch {
    return { ok: false, error: 'Could not encrypt your key on this device.' }
  }
  const { data, error } = await supabase.rpc('mining_advisor_store_own_secret', {
    p_ciphertext: ciphertext,
  })
  if (error || data !== true) {
    return { ok: false, error: error?.message || 'Could not save your key. Try again.' }
  }
  notifyGeminiSavedKeyChanged()
  return { ok: true, advice: '' }
}

export async function unlockGeminiKey(lockPhrase: string): Promise<GeminiKeyResult> {
  if (!isAdvisorLockPhrase(lockPhrase)) {
    return { ok: false, error: 'Enter the lock phrase you chose when you saved.' }
  }
  const { data, error } = await supabase.rpc('mining_advisor_load_own_secret')
  if (error || typeof data !== 'string' || !data) {
    return { ok: false, error: 'No saved key on this profile.' }
  }
  try {
    const plain = (await decryptAdvisorSecret(data, lockPhrase)).trim()
    if (plain.length < 20) return { ok: false, error: 'That lock phrase did not unlock the saved key.' }
    return { ok: true, advice: plain }
  } catch {
    return { ok: false, error: 'That lock phrase did not unlock the saved key.' }
  }
}

export async function deleteSavedGeminiKey(): Promise<GeminiKeyResult> {
  const { error } = await supabase.rpc('mining_advisor_delete_saved_key')
  if (error) return { ok: false, error: error.message || 'Could not remove the saved key.' }
  notifyGeminiSavedKeyChanged()
  return { ok: true, advice: '' }
}

/** Unwrap the JSON error an Edge Function returned, falling back to its message. */
export async function edgeInvokeError(
  error: { message?: string; context?: Response },
  fallback: string,
): Promise<string> {
  const ctx = error.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const payload = (await ctx.json()) as { error?: string }
      if (payload?.error) return payload.error
    } catch {
      /* fall through */
    }
  }
  return error.message || fallback
}
