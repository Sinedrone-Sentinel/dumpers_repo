import { supabase } from './supabase'

export type RsiChallenge = {
  code: string
  handle: string
  expiresAt: string
}

export type IssueRsiChallengeResult =
  | { ok: true; alreadyVerified: true; handle: string }
  | { ok: true; alreadyVerified: false; challenge: RsiChallenge }
  | { ok: false; error: string }

export type ValidateRsiHandleResult =
  | { ok: true; handle: string; alreadyVerified?: boolean }
  | { ok: false; error: string; needsChallenge?: boolean; cleared?: boolean }

function parseChallengePayload(data: Record<string, unknown> | null): RsiChallenge | null {
  if (!data?.code || !data?.handle || !data?.expires_at) return null
  return {
    code: String(data.code),
    handle: String(data.handle),
    expiresAt: String(data.expires_at),
  }
}

/** Clears verified/unverified handle so the member can verify a new one (or re-verify). */
export async function clearMyRsiHandle(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('clear_my_rsi_handle')
  if (error) {
    return { ok: false, error: error.message || 'Failed to clear RSI handle' }
  }
  const row = (data ?? null) as Record<string, unknown> | null
  if (!row?.success) {
    return { ok: false, error: String(row?.error || 'Failed to clear RSI handle') }
  }
  return { ok: true }
}

export async function issueRsiVerifyChallenge(handle: string): Promise<IssueRsiChallengeResult> {
  const trimmed = handle.trim()
  if (!trimmed) return { ok: false, error: 'Enter an RSI handle first.' }

  const { data, error } = await supabase.rpc('issue_rsi_verify_challenge', {
    p_handle: trimmed,
  })

  if (error) {
    return { ok: false, error: error.message || 'Failed to issue verification code' }
  }

  const row = (data ?? null) as Record<string, unknown> | null
  if (!row?.success) {
    return { ok: false, error: String(row?.error || 'Failed to issue verification code') }
  }

  if (row.already_verified) {
    return { ok: true, alreadyVerified: true, handle: String(row.handle || trimmed) }
  }

  const challenge = parseChallengePayload(row)
  if (!challenge) {
    return { ok: false, error: 'Verification code response was incomplete' }
  }

  return { ok: true, alreadyVerified: false, challenge }
}

export async function getMyRsiVerifyChallenge(): Promise<RsiChallenge | null> {
  const { data, error } = await supabase.rpc('get_my_rsi_verify_challenge')
  if (error) return null
  const row = (data ?? null) as Record<string, unknown> | null
  if (!row?.success || !row.active) return null
  return parseChallengePayload(row)
}

export async function validateRsiHandle(handle: string): Promise<ValidateRsiHandleResult> {
  const trimmed = handle.trim()
  if (!trimmed) return { ok: false, error: 'Enter an RSI handle first.' }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { ok: false, error: 'Your session has expired — please sign in again.' }
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-rsi-handle`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ handle: trimmed }),
    }
  )

  const result = await response.json()

  if (!response.ok) {
    return { ok: false, error: result.error || 'Validation failed' }
  }

  if (!result.valid) {
    return {
      ok: false,
      error: result.error || 'RSI Handle not found',
      needsChallenge: Boolean(result.needsChallenge),
      cleared: Boolean(result.cleared),
    }
  }

  if (result.verified) {
    return {
      ok: true,
      handle: result.handle || trimmed,
      alreadyVerified: Boolean(result.alreadyVerified),
    }
  }

  return { ok: false, error: result.error || 'Verification failed' }
}

export function rsiCitizenProfileUrl(handle: string): string {
  return `https://robertsspaceindustries.com/en/citizens/${encodeURIComponent(handle.trim())}`
}

export function formatChallengeExpiry(expiresAt: string): string {
  try {
    return new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return 'soon'
  }
}
