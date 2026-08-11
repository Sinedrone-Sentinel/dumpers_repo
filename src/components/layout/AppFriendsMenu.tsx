import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useAuth } from '../../contexts/AuthContext'
import { useFriends } from '../../contexts/FriendsContext'
import AppModal from './AppModal'
import SiteTooltip from '../SiteTooltip'
import {
  OPEN_FRIENDS_MENU_EVENT,
  createFriendGroup,
  deleteFriendGroup,
  ensureMyFriendInviteLink,
  friendInviteAbsoluteUrl,
  friendLabel,
  removeFriend,
  renameFriendGroup,
  reorderFriendGroups,
  sendFriendRequest,
  setFriendGroup,
  type FriendGroup,
  type FriendListEntry,
} from '../../lib/friends'

type Props = {
  disabled?: boolean
}

type DragPayload =
  | { kind: 'group'; groupId: string }
  | { kind: 'friend'; userId: string; fromGroupId: string }

export default function AppFriendsMenu({ disabled = false }: Props) {
  const { profile } = useAuth()
  const { friends, groups, loading, refresh } = useFriends()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [rsiHandle, setRsiHandle] = useState('')
  const rsiVerified = Boolean(profile?.rsi_handle_verified)
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<FriendGroup | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const dragRef = useRef<DragPayload | null>(null)
  const seededOpenRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    if (deleteTarget) return
    setOpen(false)
  }, [deleteTarget])
  useClickOutside(containerRef, open && !disabled && !deleteTarget, close)

  useEffect(() => {
    const onOpen = () => {
      if (!disabled) {
        setOpen(true)
        void refresh()
      }
    }
    window.addEventListener(OPEN_FRIENDS_MENU_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_FRIENDS_MENU_EVENT, onOpen)
  }, [disabled, refresh])

  useEffect(() => {
    if (open && !disabled) void refresh()
  }, [open, disabled, refresh])

  const orderedGroups = useMemo(() => {
    const customs = groups
      .filter((g) => !g.isDefault)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    const defaults = groups.filter((g) => g.isDefault)
    return [...customs, ...defaults]
  }, [groups])

  const membersByGroup = useMemo(() => {
    const map = new Map<string, FriendListEntry[]>()
    for (const g of orderedGroups) map.set(g.id, [])
    for (const f of friends) {
      const gid = f.groupId || orderedGroups.find((g) => g.isDefault)?.id
      if (!gid) continue
      const list = map.get(gid) ?? []
      list.push(f)
      map.set(gid, list)
    }
    for (const [gid, list] of map) {
      list.sort((a, b) =>
        friendLabel(a.profile).localeCompare(friendLabel(b.profile), undefined, { sensitivity: 'base' }),
      )
      map.set(gid, list)
    }
    return map
  }, [friends, orderedGroups])

  useEffect(() => {
    if (!open || seededOpenRef.current || orderedGroups.length === 0) return
    const defaultGroup = orderedGroups.find((g) => g.isDefault)
    const withMembers = orderedGroups.find((g) => (membersByGroup.get(g.id)?.length ?? 0) > 0)
    setOpenGroupId(defaultGroup?.id ?? withMembers?.id ?? orderedGroups[0]?.id ?? null)
    seededOpenRef.current = true
  }, [open, orderedGroups, membersByGroup])

  useEffect(() => {
    if (!open) seededOpenRef.current = false
  }, [open])

  const run = async (fn: () => Promise<{ error?: string }>) => {
    setBusy(true)
    const result = await fn()
    setBusy(false)
    if (result.error) return
    await refresh()
  }

  const toggleGroup = (groupId: string) => {
    setOpenGroupId((prev) => (prev === groupId ? null : groupId))
    setEditingGroupId(null)
  }

  const onGroupDragStart = (groupId: string, e: DragEvent) => {
    dragRef.current = { kind: 'group', groupId }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `group:${groupId}`)
  }

  const onFriendDragStart = (userId: string, fromGroupId: string, e: DragEvent) => {
    dragRef.current = { kind: 'friend', userId, fromGroupId }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `friend:${userId}`)
  }

  const onBandDragOver = (groupId: string, e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverGroupId(groupId)
  }

  const onBandDrop = (targetGroupId: string, e: DragEvent) => {
    e.preventDefault()
    setDragOverGroupId(null)
    const payload = dragRef.current
    dragRef.current = null
    if (!payload) return

    if (payload.kind === 'friend') {
      if (payload.fromGroupId === targetGroupId) return
      setOpenGroupId(targetGroupId)
      void run(() => setFriendGroup(payload.userId, targetGroupId))
      return
    }

    const target = orderedGroups.find((g) => g.id === targetGroupId)
    const source = orderedGroups.find((g) => g.id === payload.groupId)
    if (!source || !target || source.isDefault || target.isDefault || source.id === target.id) return

    const customs = orderedGroups.filter((g) => !g.isDefault).map((g) => g.id)
    const from = customs.indexOf(source.id)
    const to = customs.indexOf(target.id)
    if (from < 0 || to < 0) return
    customs.splice(from, 1)
    customs.splice(to, 0, source.id)
    void run(() => reorderFriendGroups(customs))
  }

  const deleteMemberCount = deleteTarget
    ? (membersByGroup.get(deleteTarget.id)?.length ?? 0)
    : 0

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(!open)
        }}
        aria-label={disabled ? 'Friends unavailable until account is approved' : 'Friends'}
        aria-expanded={open}
        className="site-chrome-control relative px-2 py-1"
      >
        <svg
          className={`w-6 h-6 ${disabled ? 'text-slate-500' : 'text-slate-300'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </button>

      {open && !disabled && (
        <div className="site-menu-panel absolute right-0 top-full mt-2 w-[calc(22rem-20px)] max-w-[calc(100vw-1.5rem)] max-h-[min(70vh,calc(32rem+50px))] flex flex-col overflow-hidden z-50 p-3 gap-2.5">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="text-sm font-semibold text-white">Friends</h3>
            <div className="flex items-center gap-1.5">
              {loading && <span className="text-[10px] text-slate-500">Refreshing…</span>}
              <SiteTooltip
                side="bottom"
                content={
                  rsiVerified
                    ? 'Copies a shareable invite link. Anyone who opens it while signed in sends you a friend request you can Accept or Deny. The same link works for many people (for example a YouTube description). It does not change until you rotate it under Settings → Security.'
                    : 'Verify your RSI Handle in Settings before sharing an invite link.'
                }
              >
                <button
                  type="button"
                  disabled={busy || copyBusy || !rsiVerified}
                  className="site-btn-secondary text-[10px] px-2 py-1 shrink-0"
                  onClick={() => {
                    if (!rsiVerified || copyBusy) return
                    setCopyBusy(true)
                    void (async () => {
                      const result = await ensureMyFriendInviteLink()
                      setCopyBusy(false)
                      if (result.error || !result.urlPath) return
                      try {
                        await navigator.clipboard.writeText(friendInviteAbsoluteUrl(result.urlPath))
                        setCopiedInvite(true)
                        window.setTimeout(() => setCopiedInvite(false), 2500)
                      } catch {
                        /* clipboard blocked */
                      }
                    })()
                  }}
                >
                  {copiedInvite ? 'Copied!' : 'Copy invite link'}
                </button>
              </SiteTooltip>
            </div>
          </div>

          <section className="flex gap-2 shrink-0">
            <input
              type="text"
              value={rsiHandle}
              onChange={(e) => setRsiHandle(e.target.value)}
              placeholder="RSI Handle"
              className="site-input flex-1 px-2 py-1.5 text-xs"
              disabled={busy}
              aria-label="Add by RSI Handle"
            />
            <button
              type="button"
              disabled={busy || !rsiHandle.trim()}
              className="site-btn-primary text-xs px-2 py-1.5 shrink-0"
              onClick={() =>
                void run(async () => {
                  const result = await sendFriendRequest(rsiHandle.trim())
                  if (!result.error) setRsiHandle('')
                  return result
                })
              }
            >
              Add
            </button>
          </section>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 pr-0.5">
            {orderedGroups.length === 0 && (
              <p className="text-xs text-slate-500">Loading groups…</p>
            )}
            {orderedGroups.map((group) => {
              const members = membersByGroup.get(group.id) ?? []
              const expanded = openGroupId === group.id
              const isEditing = editingGroupId === group.id
              const dropActive = dragOverGroupId === group.id
              return (
                <div
                  key={group.id}
                  className={`site-surface overflow-hidden ${dropActive ? 'ring-1 ring-orange-400/60' : ''}`}
                  onDragOver={(e) => onBandDragOver(group.id, e)}
                  onDragLeave={() => setDragOverGroupId((id) => (id === group.id ? null : id))}
                  onDrop={(e) => onBandDrop(group.id, e)}
                >
                  <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-900/60 border-b border-slate-700/50">
                    {!group.isDefault ? (
                      <button
                        type="button"
                        draggable={!busy}
                        onDragStart={(e) => onGroupDragStart(group.id, e)}
                        onDragEnd={() => {
                          dragRef.current = null
                          setDragOverGroupId(null)
                        }}
                        className="site-btn-icon cursor-grab active:cursor-grabbing px-1 py-1 text-slate-400"
                        aria-label={`Drag to reorder ${group.label}`}
                        title="Drag to reorder"
                      >
                        <DragHandleIcon />
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" aria-hidden />
                    )}

                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={expanded}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editLabel}
                          maxLength={40}
                          autoFocus
                          disabled={busy}
                          className="site-input w-full px-2 py-1 text-xs"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const next = editLabel.trim()
                              if (next && next !== group.label) {
                                void run(() => renameFriendGroup(group.id, next)).then(() =>
                                  setEditingGroupId(null),
                                )
                              } else {
                                setEditingGroupId(null)
                              }
                            }
                            if (e.key === 'Escape') setEditingGroupId(null)
                          }}
                          onBlur={() => {
                            const next = editLabel.trim()
                            if (next && next !== group.label) {
                              void run(() => renameFriendGroup(group.id, next)).then(() =>
                                setEditingGroupId(null),
                              )
                            } else {
                              setEditingGroupId(null)
                            }
                          }}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-100 truncate block">
                          {group.label}
                          <span className="ml-1.5 font-normal text-slate-500">({members.length})</span>
                        </span>
                      )}
                    </button>

                    {!group.isDefault && !isEditing && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className="site-btn-icon px-1.5 py-1 text-slate-300"
                          aria-label={`Rename ${group.label}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingGroupId(group.id)
                            setEditLabel(group.label)
                            setOpenGroupId(group.id)
                          }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="site-btn-icon px-1.5 py-1 text-rose-300"
                          aria-label={`Delete ${group.label}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(group)
                          }}
                        >
                          <DeleteIcon />
                        </button>
                      </>
                    )}
                  </div>

                  {expanded && (
                    <div className="px-2 py-1.5 space-y-1">
                      {members.length === 0 && (
                        <p className="text-[11px] text-slate-500 px-1 py-1">No friends in this group</p>
                      )}
                      {members.map((f) => (
                        <div
                          key={f.userId}
                          className="flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-950/40 px-1.5 py-1"
                        >
                          <button
                            type="button"
                            draggable={!busy}
                            onDragStart={(e) => onFriendDragStart(f.userId, group.id, e)}
                            onDragEnd={() => {
                              dragRef.current = null
                              setDragOverGroupId(null)
                            }}
                            className="site-btn-icon cursor-grab active:cursor-grabbing px-1 py-0.5 text-slate-500"
                            aria-label={`Drag ${friendLabel(f.profile)} to another group`}
                            title="Drag to another group"
                          >
                            <DragHandleIcon />
                          </button>
                          <span className="text-xs text-slate-200 truncate flex-1 min-w-0">
                            {friendLabel(f.profile)}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            className="site-btn-ghost text-[10px] px-1.5 py-0.5 text-rose-300 shrink-0"
                            onClick={() => void run(() => removeFriend(f.userId))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {friends.length === 0 && orderedGroups.length > 0 && (
              <p className="text-xs text-slate-500 pt-1">
                No friends yet. Requests appear under Notifications. New friends start in Default.
              </p>
            )}
          </div>

          <section className="flex gap-2 shrink-0 pt-1 border-t border-slate-700/50">
            <input
              type="text"
              value={newGroupLabel}
              onChange={(e) => setNewGroupLabel(e.target.value)}
              placeholder="New group name"
              maxLength={40}
              className="site-input flex-1 px-2 py-1.5 text-xs"
              disabled={busy}
              aria-label="New group name"
            />
            <button
              type="button"
              disabled={busy || !newGroupLabel.trim()}
              className="site-btn-secondary text-xs px-2 py-1.5 shrink-0"
              onClick={() =>
                void run(async () => {
                  const result = await createFriendGroup(newGroupLabel.trim())
                  if (!result.error) {
                    setNewGroupLabel('')
                    if (result.id) setOpenGroupId(result.id)
                  }
                  return result
                })
              }
            >
              Add
            </button>
          </section>
        </div>
      )}

      {deleteTarget && (
        <AppModal
          title="Delete group?"
          size="sm"
          zIndex={80}
          onClose={() => setDeleteTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="site-btn-secondary text-sm px-3 py-1.5"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="site-btn-danger text-sm px-3 py-1.5"
                disabled={busy}
                onClick={() => {
                  const id = deleteTarget.id
                  setDeleteTarget(null)
                  void run(() => deleteFriendGroup(id))
                }}
              >
                Delete group
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-300 leading-relaxed">
            Delete <strong className="text-white">{deleteTarget.label}</strong>?{' '}
            {deleteMemberCount > 0
              ? `${deleteMemberCount} friend${deleteMemberCount === 1 ? '' : 's'} will move to Default.`
              : 'This group is empty.'}
          </p>
        </AppModal>
      )}
    </div>
  )
}

function DragHandleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 2l2.5 3h-5L8 2zm0 12l-2.5-3h5L8 14zM3 6.5h10v1H3v-1zm0 2h10v1H3v-1z" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
