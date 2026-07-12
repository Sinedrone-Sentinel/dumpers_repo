import { supabase } from './supabase'

export const CREW_RSI_VERIFIED_MEMBER_TOOLTIP =
  'Verified RSI Handle — this player is registered on Dumper\'s Repo with a verified handle.'

export const CREW_RSI_VALID_NOT_REGISTERED_TOOLTIP =
  'This is a valid RSI Handle on robertsspaceindustries.com, but this player has not registered on Dumper\'s Repo yet. Encourage them to sign up and verify their handle on the site.'

export const CREW_RSI_INVALID_HANDLE_TOOLTIP =
  'This does not appear to be a valid RSI Handle on robertsspaceindustries.com. The name may be mistyped. RSI Handles never contain spaces.'

/** Strip spaces — RSI handles never use them. */
export function sanitizeRsiHandleInput(raw: string): string {
  return raw.replace(/\s/g, '')
}

export async function checkRsiHandleExistsOnRsi(
  handle: string
): Promise<{ valid: boolean; error?: string }> {
  const trimmed = sanitizeRsiHandleInput(handle.trim())
  if (!trimmed) return { valid: false }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return { valid: false, error: 'Your session has expired — please sign in again.' }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-rsi-handle-exists`,
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
      return { valid: false, error: result.error || 'Validation failed' }
    }
    return { valid: Boolean(result.valid) }
  } catch {
    return { valid: false, error: 'Network error during RSI check' }
  }
}

export type CrewRsiAlertState =
  | 'idle'
  | 'checking'
  | 'verified_member'
  | 'valid_not_registered'
  | 'invalid_rsi'
