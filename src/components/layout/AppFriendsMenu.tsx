import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useFriends } from '../../contexts/FriendsContext'
import {
  OPEN_FRIENDS_MENU_EVENT,
  createFriendGroup,
  deleteFriendGroup,
  friendLabel,
  removeFriend,
  renameFriendGroup,
  reorderFriendGroups,
  sendFriendRequest,
  setFriendGroup,
} from '../../lib/friends'

type Props = {
  disabled?: boolean
}

export default function AppFriendsMenu({ disabled = false }: Props) {
  const { friends, groups, loading, refresh } = useFriends()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [rsiHandle, setRsiHandle] = useState('')
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useClickOutside(containerRef, open && !disabled, close)

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

  const friendsByGroup = useMemo(() => {
    const ungrouped = friends.filter((f) => !f.groupId)
    const grouped = groups.map((g) => ({
      group: g,
      members: friends.filter((f) => f.groupId === g.id),
    }))
    return { ungrouped, grouped }
  }, [friends, groups])

  const run = async (fn: () => Promise<{ error?: string }>, okMsg?: string) => {
    setBusy(true)
    setMessage(null)
    const result = await fn()
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    if (okMsg) setMessage(okMsg)
    await refresh()
  }

  const moveGroup = (groupId: string, direction: -1 | 1) => {
    const ids = groups.map((g) => g.id)
    const idx = ids.indexOf(groupId)
    const swap = idx + direction
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    void run(() => reorderFriendGroups(ids))
  }

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
        <div className="site-menu-panel absolute right-0 top-full mt-2 w-[20rem] max-w-[calc(100vw-1.5rem)] max-h-[min(50vh,22rem)] overflow-y-auto overscroll-contain z-50 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Friends</h3>
            {loading && <span className="text-[10px] text-slate-500">Refreshing…</span>}
          </div>

          {message && (
            <p className="text-xs text-amber-200/90 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2 py-1.5">
              {message}
            </p>
          )}

          <section className="space-y-1.5">
            <div className="flex gap-2">
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
                  }, 'Request sent — manage it from Notifications')
                }
              >
                Add
              </button>
            </div>
          </section>

          <section className="space-y-1.5">
            <h4 className="text-[11px] uppercase tracking-wide text-slate-400">Groups</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
                placeholder="New group label"
                maxLength={40}
                className="site-input flex-1 px-2 py-1.5 text-xs"
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy || !newGroupLabel.trim()}
                className="site-btn-secondary text-xs px-2 py-1.5 shrink-0"
                onClick={() =>
                  void run(async () => {
                    const result = await createFriendGroup(newGroupLabel.trim())
                    if (!result.error) setNewGroupLabel('')
                    return result
                  })
                }
              >
                Create
              </button>
            </div>
            {groups.map((g, index) => (
              <div key={g.id} className="flex items-center gap-1">
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    className="site-btn-icon text-[10px] leading-none px-1 py-0.5 disabled:opacity-30"
                    aria-label={`Move ${g.label} up`}
                    onClick={() => moveGroup(g.id, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === groups.length - 1}
                    className="site-btn-icon text-[10px] leading-none px-1 py-0.5 disabled:opacity-30"
                    aria-label={`Move ${g.label} down`}
                    onClick={() => moveGroup(g.id, 1)}
                  >
                    ▼
                  </button>
                </div>
                <input
                  type="text"
                  defaultValue={g.label}
                  maxLength={40}
                  className="site-input flex-1 px-2 py-1 text-xs min-w-0"
                  disabled={busy}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== g.label) {
                      void run(() => renameFriendGroup(g.id, next))
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  className="site-btn-ghost text-[10px] px-2 py-1 text-rose-300 shrink-0"
                  onClick={() => void run(() => deleteFriendGroup(g.id))}
                >
                  Delete
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-1.5">
            <h4 className="text-[11px] uppercase tracking-wide text-slate-400">
              Friends ({friends.length})
            </h4>
            {friends.length === 0 && (
              <p className="text-xs text-slate-500">
                No friends yet. Requests appear under Notifications.
              </p>
            )}
            {friendsByGroup.grouped.map(({ group, members }) =>
              members.length === 0 ? null : (
                <div key={group.id} className="space-y-1">
                  <p className="text-[11px] font-medium text-sky-300/90">{group.label}</p>
                  {members.map((f) => (
                    <FriendRow
                      key={f.userId}
                      label={friendLabel(f.profile)}
                      groups={groups}
                      groupId={f.groupId}
                      disabled={busy}
                      onGroupChange={(gid) => void run(() => setFriendGroup(f.userId, gid))}
                      onRemove={() => void run(() => removeFriend(f.userId))}
                    />
                  ))}
                </div>
              )
            )}
            {friendsByGroup.ungrouped.length > 0 && (
              <div className="space-y-1">
                {friendsByGroup.grouped.some((g) => g.members.length > 0) && (
                  <p className="text-[11px] font-medium text-slate-500">Ungrouped</p>
                )}
                {friendsByGroup.ungrouped.map((f) => (
                  <FriendRow
                    key={f.userId}
                    label={friendLabel(f.profile)}
                    groups={groups}
                    groupId={f.groupId}
                    disabled={busy}
                    onGroupChange={(gid) => void run(() => setFriendGroup(f.userId, gid))}
                    onRemove={() => void run(() => removeFriend(f.userId))}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function FriendRow({
  label,
  groups,
  groupId,
  disabled,
  onGroupChange,
  onRemove,
}: {
  label: string
  groups: { id: string; label: string }[]
  groupId: string | null
  disabled: boolean
  onGroupChange: (groupId: string | null) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/40 px-2 py-1.5">
      <span className="text-xs text-slate-200 truncate flex-1 min-w-0">{label}</span>
      {groups.length > 0 && (
        <select
          className="site-input text-[10px] px-1 py-0.5 max-w-[6.5rem]"
          value={groupId ?? ''}
          disabled={disabled}
          onChange={(e) => onGroupChange(e.target.value || null)}
          aria-label={`Group for ${label}`}
        >
          <option value="">Ungrouped</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={disabled}
        className="site-btn-ghost text-[10px] px-1.5 py-0.5 text-rose-300 shrink-0"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  )
}
