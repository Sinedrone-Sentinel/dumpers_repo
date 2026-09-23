import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import SiteTooltip from '../SiteTooltip'
import {
  BP_WISHLIST_LOCK_TOOLTIP,
  BP_WISHLIST_MAX_LISTS,
  addBlueprintToWishlists,
  createBpWishlist,
  fetchBpWishlists,
  type Wishlist,
  type WishlistMaterial,
} from '../../lib/bpWishlist'

function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

interface AddToWishlistButtonProps {
  signedIn: boolean
  blueprintKey: string
  blueprintName: string
  materials: WishlistMaterial[]
  slotQualities: Record<number, number>
}

export default function AddToWishlistButton({
  signedIn,
  blueprintKey,
  blueprintName,
  materials,
  slotQualities,
}: AddToWishlistButtonProps) {
  const [open, setOpen] = useState(false)

  if (!signedIn) {
    return (
      <SiteTooltip content={BP_WISHLIST_LOCK_TOOLTIP} side="top" ignoreOverlayPause>
        <button
          type="button"
          disabled
          className="site-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm opacity-70 cursor-not-allowed"
        >
          <LockIcon className="w-3.5 h-3.5 text-amber-500/80" />
          Add to Wishlist
        </button>
      </SiteTooltip>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="site-btn-accent px-3 py-2 text-sm"
      >
        Add to Wishlist
      </button>
      {open && (
        <AddToWishlistModal
          blueprintKey={blueprintKey}
          blueprintName={blueprintName}
          materials={materials}
          slotQualities={slotQualities}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function AddToWishlistModal({
  blueprintKey,
  blueprintName,
  materials,
  slotQualities,
  onClose,
}: {
  blueprintKey: string
  blueprintName: string
  materials: WishlistMaterial[]
  slotQualities: Record<number, number>
  onClose: () => void
}) {
  const [lists, setLists] = useState<Wishlist[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantity, setQuantity] = useState(1)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchBpWishlists()
      .then((rows) => {
        if (!cancelled) setLists(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load wishlists')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const atCap = lists.length >= BP_WISHLIST_MAX_LISTS

  async function handleCreate() {
    const name = newName.trim()
    if (!name || atCap) return
    setBusy(true)
    setError(null)
    try {
      const id = await createBpWishlist(name)
      const rows = await fetchBpWishlists()
      setLists(rows)
      setSelected((prev) => new Set(prev).add(id))
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that wishlist')
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (selected.size === 0) {
      setError('Pick at least one wishlist')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const results = await addBlueprintToWishlists({
        wishlistIds: [...selected],
        blueprintKey,
        blueprintName,
        slotQualities,
        materials,
        quantity,
      })
      const fullIds = new Set(results.filter((row) => row.status === 'full').map((row) => row.wishlistId))
      if (fullIds.size > 0) {
        setLists(await fetchBpWishlists())
        const names = lists.filter((list) => fullIds.has(list.id)).map((list) => list.name)
        const saved = results.some((row) => row.status === 'added' || row.status === 'stacked')
        setError(
          saved
            ? `${names.join(', ')} already has 20 unique blueprints. The others were saved.`
            : `${names.join(', ')} already has 20 unique blueprints.`
        )
        if (saved) {
          setSelected(fullIds)
        }
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this blueprint')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="site-modal-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="site-modal-shell w-full max-w-md p-4 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-wishlist-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="add-wishlist-title" className="text-base font-semibold text-white mb-1">
          Add to Wishlist
        </h3>
        <p className="text-sm text-slate-400 mb-4">{blueprintName}</p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading wishlists…</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
            {lists.length === 0 && (
              <p className="text-sm text-slate-400">No wishlists yet. Name one below.</p>
            )}
            {lists.map((list) => {
              const count = list.items.length
              return (
                <label key={list.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="site-checkbox"
                    checked={selected.has(list.id)}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(list.id)) next.delete(list.id)
                        else next.add(list.id)
                        return next
                      })
                    }}
                  />
                  <span className="flex-1">{list.name}</span>
                  <span className="text-xs text-slate-500">{count}/20</span>
                </label>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            maxLength={40}
            disabled={atCap || busy}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={atCap ? '10/10 wishlists' : 'New wishlist name'}
            className="site-input px-3 py-2 text-sm flex-1"
            aria-label="New wishlist name"
          />
          <button
            type="button"
            className="site-btn-secondary px-3 py-2 text-sm shrink-0"
            disabled={atCap || busy || newName.trim().length === 0}
            onClick={() => void handleCreate()}
          >
            Create
          </button>
        </div>

        <label className="block mb-4">
          <span className="site-label">Quantity</span>
          <input
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => {
              const next = Math.trunc(Number(event.target.value))
              if (Number.isFinite(next)) setQuantity(Math.min(999, Math.max(1, next)))
            }}
            className="site-input mt-1 px-3 py-2 text-sm w-28"
          />
        </label>

        {error && <p className="site-error-text text-sm mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="site-btn-secondary px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="site-btn-primary px-4 py-2 text-sm"
            disabled={busy || selected.size === 0}
            onClick={() => void handleAdd()}
          >
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
