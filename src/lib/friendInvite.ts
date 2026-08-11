/** Session + OAuth helpers for multi-use friend invite links (`?friendInvite=`). */

export const FRIEND_INVITE_STORAGE_KEY = 'dr_friend_invite_token'
export const FRIEND_INVITE_REDEEMED_KEY = 'dr_friend_invite_redeemed'

const TOKEN_RE = /^[0-9a-f]{32}$/i

export function normalizeFriendInviteToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase()
  return TOKEN_RE.test(t) ? t : null
}

export function stashFriendInviteToken(token: string): void {
  const t = normalizeFriendInviteToken(token)
  if (!t || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(FRIEND_INVITE_STORAGE_KEY, t)
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStashedFriendInviteToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return normalizeFriendInviteToken(sessionStorage.getItem(FRIEND_INVITE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function clearStashedFriendInviteToken(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(FRIEND_INVITE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function markFriendInviteRedeemed(token: string): void {
  const t = normalizeFriendInviteToken(token)
  if (!t || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(FRIEND_INVITE_REDEEMED_KEY, t)
  } catch {
    /* ignore */
  }
}

export function wasFriendInviteRedeemed(token: string): boolean {
  const t = normalizeFriendInviteToken(token)
  if (!t || typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(FRIEND_INVITE_REDEEMED_KEY) === t
  } catch {
    return false
  }
}

/**
 * Same-origin OAuth return URL. Only attaches friendInvite when the token is valid —
 * never forwards arbitrary redirect query params (open-redirect safe).
 */
export function buildOAuthRedirectTo(origin: string = window.location.origin): string {
  let fromUrl: string | null
  try {
    fromUrl = normalizeFriendInviteToken(
      new URLSearchParams(window.location.search).get('friendInvite'),
    )
  } catch {
    fromUrl = null
  }
  const token = fromUrl ?? readStashedFriendInviteToken()
  if (token) {
    stashFriendInviteToken(token)
    return `${origin}/?friendInvite=${encodeURIComponent(token)}`
  }
  return origin
}
