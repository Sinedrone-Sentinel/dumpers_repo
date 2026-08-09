import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import {
  FRIENDS_CHANGED_EVENT,
  listMyFriends,
  type FriendGroup,
  type FriendListEntry,
  type FriendsSnapshot,
  type PendingFriendRequest,
} from '../lib/friends'
import { notifyNotificationsChanged } from '../hooks/useNotificationInbox'

type FriendsContextValue = {
  friends: FriendListEntry[]
  pendingInbound: PendingFriendRequest[]
  pendingOutbound: PendingFriendRequest[]
  groups: FriendGroup[]
  loading: boolean
  refresh: () => Promise<void>
}

const FriendsContext = createContext<FriendsContextValue | null>(null)

const EMPTY: FriendsSnapshot = {
  friends: [],
  pendingInbound: [],
  pendingOutbound: [],
  groups: [],
}

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user, isApproved, isGuestPreview } = useAuth()
  const [snapshot, setSnapshot] = useState<FriendsSnapshot>(EMPTY)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user || !isApproved || isGuestPreview) {
      setSnapshot(EMPTY)
      return
    }
    setLoading(true)
    const result = await listMyFriends()
    if (result.data) setSnapshot(result.data)
    else setSnapshot(EMPTY)
    setLoading(false)
    notifyNotificationsChanged()
  }, [user, isApproved, isGuestPreview])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onChanged = () => {
      void refresh()
    }
    window.addEventListener(FRIENDS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(FRIENDS_CHANGED_EVENT, onChanged)
  }, [refresh])

  const value = useMemo(
    () => ({
      friends: snapshot.friends,
      pendingInbound: snapshot.pendingInbound,
      pendingOutbound: snapshot.pendingOutbound,
      groups: snapshot.groups,
      loading,
      refresh,
    }),
    [snapshot, loading, refresh]
  )

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>
}

export function useFriends() {
  const ctx = useContext(FriendsContext)
  if (!ctx) {
    throw new Error('useFriends must be used within FriendsProvider')
  }
  return ctx
}
