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
import {
  notifyFriendsChanged,
  openFriendsMenu,
  processMyStashedFriendInvites,
  redeemFriendInvite,
} from '../lib/friends'

/**
 * Persist ?friendInvite= (session + server stash when unverified).
 * Pending friend request only after RSI verify (or immediately if already verified).
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

function stripFriendInviteFromUrl() {
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
}

export default function FriendInviteRedeemer() {
  const { user, profile, isApproved, isPending, isGuestPreview, loading } = useAuth()
  const searchStr = useRouterState({ select: (s) => s.location.searchStr })
  const inFlight = useRef<string | null>(null)
  const processInFlight = useRef(false)
  const rsiVerified = Boolean(profile?.rsi_handle_verified)

  const fromUrlNow = tokenFromSearchStr(searchStr)
  if (fromUrlNow) stashFriendInviteToken(fromUrlNow)

  useEffect(() => {
    if (loading) return

    const token = tokenFromSearchStr(searchStr) ?? readStashedFriendInviteToken()
    if (!token) return

    stashFriendInviteToken(token)

    if (isGuestPreview || !user) return
    if (isPending || !isApproved) return
    if (wasFriendInviteRedeemed(token) || inFlight.current === token) return

    inFlight.current = token
    void (async () => {
      const result = await redeemFriendInvite(token)
      inFlight.current = null

      if (result.error) return

      markFriendInviteRedeemed(token)
      clearStashedFriendInviteToken()
      stripFriendInviteFromUrl()

      if (result.status === 'stashed_pending_rsi') {
        // Saved server-side until RSI verify — do not open Friends yet.
        return
      }

      notifyFriendsChanged()
      openFriendsMenu()
    })()
  }, [loading, user, isApproved, isPending, isGuestPreview, searchStr])

  // After RSI verify (or if already verified with leftover stashes), process server stashes.
  useEffect(() => {
    if (loading || !user || !isApproved || isPending || isGuestPreview) return
    if (!rsiVerified || processInFlight.current) return

    processInFlight.current = true
    void (async () => {
      const result = await processMyStashedFriendInvites()
      processInFlight.current = false
      if (result.error) return
      const created = (result.pending ?? 0) + (result.alreadyFriends ?? 0)
      if (created > 0 || (result.processed ?? 0) > 0) {
        notifyFriendsChanged()
      }
      if ((result.pending ?? 0) > 0) {
        openFriendsMenu()
      }
    })()
  }, [loading, user, isApproved, isPending, isGuestPreview, rsiVerified])

  return null
}
