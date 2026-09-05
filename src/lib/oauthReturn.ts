export const OAUTH_RETURN_FAILED_MESSAGE =
  'Sign-in did not finish. Tap Sign in with Discord or Google again in this Safari or Chrome window. Refresh will not log you in — the page icon next to the address is Safari Reader, not Refresh.'

const PENDING_KEY = 'dr_oauth_pending'

export function markOAuthAttempt(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function consumeOAuthAttempt(): boolean {
  try {
    const value = sessionStorage.getItem(PENDING_KEY)
    if (value) sessionStorage.removeItem(PENDING_KEY)
    return Boolean(value)
  } catch {
    return false
  }
}

export function peekOAuthAttempt(): boolean {
  try {
    return Boolean(sessionStorage.getItem(PENDING_KEY))
  } catch {
    return false
  }
}

const OAUTH_QUERY_KEYS = ['code', 'state', 'error', 'error_description'] as const

export function isOAuthReturnUrl(search: string, hash: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(query)
  if (hash.includes('access_token')) return true
  if (params.has('code') || params.has('error')) return true
  return false
}

/** Path + remaining query (keeps friendInvite). Drops hash and OAuth params. */
export function stripOAuthReturnParams(href: string): string {
  const url = new URL(href)
  url.hash = ''
  for (const key of OAUTH_QUERY_KEYS) {
    url.searchParams.delete(key)
  }
  return url.pathname + url.search
}

export function cleanOAuthReturnUrl(): void {
  if (typeof window === 'undefined') return
  const next = stripOAuthReturnParams(window.location.href)
  window.history.replaceState(null, '', next || '/')
}
