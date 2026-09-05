export const OAUTH_RETURN_FAILED_MESSAGE =
  'Sign-in did not finish. If you opened this site from Facebook, Discord, Instagram, or another app, open dumpers-repo.com in Safari (or Chrome on Android) and sign in there.'

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
