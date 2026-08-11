import { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import {
  clearStashedFriendInviteToken,
  markFriendInviteRedeemed,
  normalizeFriendInviteToken,
  readStashedFriendInviteToken,
  stashFriendInviteToken,
  wasFriendInviteRedeemed,
} from '../lib/friendInvite'
import { notifyFriendsChanged, openFriendsMenu, redeemFriendInvite } from '../lib/friends'

/**
 * After login (or when already approved), redeem ?friendInvite= once.
 * Guests: stash token so OAuth return can restore it.
 */
function tokenFromSearchStr(searchStr: string): string | null {
  try {
    return normalizeFriendInviteToken(
      new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr).get(
        'friendInvite',
      ),
    )
  } catch {
    return null
  }
}

export default function FriendInviteRedeemer() {
  const { user, isApproved, isPending, isGuestPreview, loading } = useAuth()
  const searchStr = useRouterState({ select: (s) => s.location.searchStr })
  const inFlight = useRef<string | null>(null)

  // Stash during render (Layout mounts before page effects) so stripping ?q= cannot drop the token.
  const fromUrlNow = tokenFromSearchStr(searchStr)
  if (fromUrlNow) stashFriendInviteToken(fromUrlNow)

  useEffect(() => {
    if (loading) return

    const token = tokenFromSearchStr(searchStr) ?? readStashedFriendInviteToken()
    if (!token) return

    stashFriendInviteToken(token)

    if (isGuestPreview || !user) {
      return
    }

    if (isPending || !isApproved) {
      return
    }

    if (wasFriendInviteRedeemed(token) || inFlight.current === token) {
      return
    }

    inFlight.current = token
    void (async () => {
      const result = await redeemFriendInvite(token)
      markFriendInviteRedeemed(token)
      clearStashedFriendInviteToken()
      inFlight.current = null

      try {
        const url = new URL(window.location.href)
        if (url.searchParams.has('friendInvite')) {
          url.searchParams.delete('friendInvite')
          const qs = url.searchParams.toString()
          window.history.replaceState({}, '', url.pathname + (qs ? '?' + qs : '') + url.hash)
        }
      } catch {
        /* ignore */
      }

      if (!result.error) {
        notifyFriendsChanged()
        openFriendsMenu()
      }
    })()
  }, [loading, user, isApproved, isPending, isGuestPreview, searchStr])

  return null
}
