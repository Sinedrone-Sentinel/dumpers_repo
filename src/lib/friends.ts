import { supabase } from './supabase'

export const OPEN_FRIENDS_MENU_EVENT = 'dumpers:open-friends-menu'

export type FriendProfile = {
  id: string
  displayName: string
  rsiHandle: string | null
  rsiHandleVerified: boolean
}

export type FriendListEntry = {
  userId: string
  profile: FriendProfile
  friendshipId: string
  since: string
  groupId: string | null
}

export type PendingFriendRequest = {
  friendshipId: string
  profile: FriendProfile
  createdAt: string
  fromUserId?: string
  toUserId?: string
}

export type FriendGroup = {
  id: string
  label: string
  sortOrder: number
}

export type FriendsSnapshot = {
  friends: FriendListEntry[]
  pendingInbound: PendingFriendRequest[]
  pendingOutbound: PendingFriendRequest[]
  groups: FriendGroup[]
}

function asProfile(raw: unknown): FriendProfile {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    id: String(o.id ?? ''),
    displayName: String(o.displayName ?? 'Member'),
    rsiHandle: typeof o.rsiHandle === 'string' ? o.rsiHandle : null,
    rsiHandleVerified: Boolean(o.rsiHandleVerified),
  }
}

export function openFriendsMenu() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_FRIENDS_MENU_EVENT))
}

export async function listMyFriends(): Promise<{ data?: FriendsSnapshot; error?: string }> {
  const { data, error } = await supabase.rpc('list_my_friends')
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.success === false) {
    return { error: typeof row?.error === 'string' ? row.error : 'Failed to load friends' }
  }
  const friendsRaw = Array.isArray(row.friends) ? row.friends : []
  const inboundRaw = Array.isArray(row.pendingInbound) ? row.pendingInbound : []
  const outboundRaw = Array.isArray(row.pendingOutbound) ? row.pendingOutbound : []
  const groupsRaw = Array.isArray(row.groups) ? row.groups : []

  return {
    data: {
      friends: friendsRaw.map((f) => {
        const o = f as Record<string, unknown>
        return {
          userId: String(o.userId ?? ''),
          profile: asProfile(o.profile),
          friendshipId: String(o.friendshipId ?? ''),
          since: String(o.since ?? ''),
          groupId: typeof o.groupId === 'string' ? o.groupId : null,
        }
      }),
      pendingInbound: inboundRaw.map((f) => {
        const o = f as Record<string, unknown>
        return {
          friendshipId: String(o.friendshipId ?? ''),
          profile: asProfile(o.profile),
          createdAt: String(o.createdAt ?? ''),
          fromUserId: typeof o.fromUserId === 'string' ? o.fromUserId : undefined,
        }
      }),
      pendingOutbound: outboundRaw.map((f) => {
        const o = f as Record<string, unknown>
        return {
          friendshipId: String(o.friendshipId ?? ''),
          profile: asProfile(o.profile),
          createdAt: String(o.createdAt ?? ''),
          toUserId: typeof o.toUserId === 'string' ? o.toUserId : undefined,
        }
      }),
      groups: groupsRaw.map((g) => {
        const o = g as Record<string, unknown>
        return {
          id: String(o.id ?? ''),
          label: String(o.label ?? ''),
          sortOrder: Number(o.sortOrder ?? 0),
        }
      }),
    },
  }
}

export async function sendFriendRequest(rsiHandle: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_rsi_handle: rsiHandle })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to send request' }
  return {}
}

export async function cancelFriendRequest(friendshipId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('cancel_friend_request', { p_friendship_id: friendshipId })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to cancel' }
  return {}
}

export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to respond' }
  return {}
}

export async function removeFriend(friendUserId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('remove_friend', { p_friend_user_id: friendUserId })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to remove friend' }
  return {}
}

export async function createFriendGroup(label: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_friend_group', { p_label: label })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; id?: string; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to create group' }
  return { id: row.id }
}

export async function renameFriendGroup(groupId: string, label: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('rename_friend_group', {
    p_group_id: groupId,
    p_label: label,
  })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to rename group' }
  return {}
}

export async function deleteFriendGroup(groupId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('delete_friend_group', { p_group_id: groupId })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to delete group' }
  return {}
}

export async function setFriendGroup(
  friendUserId: string,
  groupId: string | null
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('set_friend_group', {
    p_friend_user_id: friendUserId,
    p_group_id: groupId,
  })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to update group' }
  return {}
}

export async function getFriendAcquiredBlueprints(
  friendId: string
): Promise<{ acquired?: Record<string, boolean>; error?: string }> {
  const { data, error } = await supabase.rpc('get_friend_acquired_blueprints', {
    p_friend_id: friendId,
  })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; acquired?: Record<string, boolean>; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to load friend blueprints' }
  return { acquired: row.acquired ?? {} }
}

export async function getFriendPersonalInventory(
  friendId: string
): Promise<{ inventory?: unknown[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_friend_personal_inventory', {
    p_friend_id: friendId,
  })
  if (error) return { error: error.message }
  const row = data as { success?: boolean; inventory?: unknown[]; error?: string } | null
  if (!row?.success) return { error: row?.error || 'Failed to load friend inventory' }
  return { inventory: row.inventory ?? [] }
}

export function friendLabel(profile: FriendProfile): string {
  if (profile.rsiHandle) return profile.rsiHandle
  return profile.displayName || 'Member'
}
