import { useEffect, useMemo, useState } from 'react'
import { isWholeUnitResource } from '../../config/resourceTypes'
import { formatDfpAuec } from '../../lib/dfp'
import { useDfpEngineReady } from '../../hooks/useDfpEngineReady'
import type { CraftStockCardLite } from '../../lib/craftFromStock'
import { fromMilliScu, toMilliScu } from '../../lib/resourceQuantity'
import {
  BP_WISHLIST_MAX_LISTS,
  BP_WISHLIST_MAX_RECIPES,
  combinedResourceTotals,
  createBpWishlist,
  deleteBpWishlist,
  demandCovered,
  formatWishlistAmount,
  gotItBpWishlistItem,
  oneCraftDemand,
  ownedIndexFromCards,
  qualityResourceTotals,
  recipeReadyForOneCraft,
  removeBpWishlistItem,
  renameBpWishlist,
  setBpWishlistItemQuantity,
  setBpWishlistUseTracked,
  wishlistItemDfp,
  wishlistQuantityTotal,
  type Wishlist,
  type WishlistItem,
} from '../../lib/bpWishlist'

interface BpWishlistTabProps {
  lists: Wishlist[]
  loading: boolean
  error: string | null
  stockCards: CraftStockCardLite[]
  onReload: () => Promise<void>
  onStockChanged: () => Promise<void>
  onError: (message: string | null) => void
}

export default function BpWishlistTab({
  lists,
  loading,
  error,
  stockCards,
  onReload,
  onStockChanged,
  onError,
}: BpWishlistTabProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const owned = useMemo(() => ownedIndexFromCards(stockCards), [stockCards])
  useDfpEngineReady()
  const atCap = lists.length >= BP_WISHLIST_MAX_LISTS

  async function run(task: () => Promise<void>, refreshStock = false) {
    setBusy(true)
    onError(null)
    try {
      await task()
      await onReload()
      if (refreshStock) await onStockChanged()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update this Crafting Wishlist')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Crafting Wishlist</h2>
          <p className="text-sm text-slate-400">
            {lists.length}/{BP_WISHLIST_MAX_LISTS} Crafting Wishlists. Each list holds {BP_WISHLIST_MAX_RECIPES} unique recipes.
            Stacking the same blueprint at the same qualities uses one slot.
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const name = newName.trim()
            if (!name || atCap) return
            void run(async () => {
              await createBpWishlist(name)
              setNewName('')
            })
          }}
        >
          <input
            type="text"
            value={newName}
            maxLength={40}
            disabled={atCap || busy}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={atCap ? '10/10 Crafting Wishlists' : 'New Crafting Wishlist name'}
            className="site-input px-3 py-2 text-sm w-52"
            aria-label="New Crafting Wishlist name"
          />
          <button
            type="submit"
            className="site-btn-primary px-3 py-2 text-sm"
            disabled={atCap || busy || newName.trim().length === 0}
          >
            Create
          </button>
        </form>
      </div>

      {error && <p className="site-error-text text-sm">{error}</p>}
      {loading && lists.length === 0 && <p className="text-sm text-slate-400">Loading Crafting Wishlists…</p>}
      {!loading && lists.length === 0 && (
        <div className="site-empty">Name a Crafting Wishlist, then add blueprints from their detail view.</div>
      )}

      {lists.map((list) => (
        <WishlistPanel
          key={list.id}
          list={list}
          open={openId === list.id}
          busy={busy}
          owned={owned}
          onToggle={() => setOpenId((current) => (current === list.id ? null : list.id))}
          onRun={run}
        />
      ))}
    </div>
  )
}

function WishlistPanel({
  list,
  open,
  busy,
  owned,
  onToggle,
  onRun,
}: {
  list: Wishlist
  open: boolean
  busy: boolean
  owned: ReturnType<typeof ownedIndexFromCards>
  onToggle: () => void
  onRun: (task: () => Promise<void>, refreshStock?: boolean) => Promise<void>
}) {
  const [draftName, setDraftName] = useState(list.name)
  const [totalsOpen, setTotalsOpen] = useState(false)
  useEffect(() => {
    setDraftName(list.name)
  }, [list.name])
  const dfp = list.items.reduce((sum, item) => sum + wishlistItemDfp(item), 0)
  const qtyTotal = wishlistQuantityTotal(list.items)
  const overview = combinedResourceTotals(list.items)
  const qualityTotals = qualityResourceTotals(list.items)

  return (
    <section className="site-card overflow-hidden">
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="text-white font-semibold">{list.name}</span>
        <span className="text-xs text-slate-400">{list.items.length}/{BP_WISHLIST_MAX_RECIPES}</span>
        <span className="text-xs text-slate-300">{qtyTotal} blueprint{qtyTotal === 1 ? '' : 's'}</span>
        <span className="text-xs text-amber-300">{formatDfpAuec(dfp)}</span>
        <span className="ml-auto text-slate-500 text-xs">{open ? 'Hide' : 'Open'}</span>
      </button>
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {overview.length === 0 ? (
          <span className="text-xs text-slate-500">No blueprints on this list yet.</span>
        ) : (
          overview.map((row) => (
            <span key={row.key} className="site-badge-slate px-2 py-0.5 rounded text-xs font-mono">
              {row.label} {formatWishlistAmount(row.resourceKey, row.amount, row.wholeUnit)}
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4 site-divider pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="site-checkbox"
                checked={list.use_tracked_resources}
                disabled={busy}
                onChange={(event) => {
                  const enabled = event.target.checked
                  void onRun(() => setBpWishlistUseTracked(list.id, enabled))
                }}
              />
              Use My Tracked Resources
            </label>
            <form
              className="flex gap-2 ml-auto"
              onSubmit={(event) => {
                event.preventDefault()
                const name = draftName.trim()
                if (!name || name === list.name) return
                void onRun(() => renameBpWishlist(list.id, name))
              }}
            >
              <input
                type="text"
                value={draftName}
                maxLength={40}
                onChange={(event) => setDraftName(event.target.value)}
                className="site-input px-3 py-1.5 text-sm w-44"
                aria-label={`Rename ${list.name}`}
              />
              <button type="submit" className="site-btn-secondary px-3 py-1.5 text-sm" disabled={busy}>
                Rename
              </button>
              <button
                type="button"
                className="site-btn-danger px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Delete "${list.name}" and every blueprint on it?`)) return
                  void onRun(() => deleteBpWishlist(list.id))
                }}
              >
                Delete
              </button>
            </form>
          </div>

          {list.items.length === 0 && (
            <p className="text-sm text-slate-400">This Crafting Wishlist is empty. Add blueprints from a blueprint’s detail view.</p>
          )}

          <div className="space-y-3">
            {list.items.map((item) => (
              <RecipeRow
                key={item.id}
                item={item}
                useTracked={list.use_tracked_resources}
                owned={owned}
                busy={busy}
                onRun={onRun}
              />
            ))}
          </div>

          <div className="site-surface rounded-xl">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-slate-300 flex items-center justify-between"
              onClick={() => setTotalsOpen((value) => !value)}
              aria-expanded={totalsOpen}
            >
              <span>Quality totals</span>
              <span className="text-xs text-slate-500">{totalsOpen ? 'Hide' : 'Show'}</span>
            </button>
            {totalsOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
                {qualityTotals.length === 0 && (
                  <p className="text-xs text-slate-500">No materials yet.</p>
                )}
                {qualityTotals.map((row) => {
                  const covered = !list.use_tracked_resources || demandCovered(owned, row.resourceKey, row.quality, row.amount)
                  const tone = !list.use_tracked_resources
                    ? 'site-badge-slate'
                    : covered
                      ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-300'
                      : 'bg-red-950/50 border border-red-500/40 text-red-300'
                  return (
                    <span key={row.key} className={`${tone} px-2 py-1 rounded text-xs font-mono`}>
                      {row.label} Q{row.quality} {formatWishlistAmount(row.resourceKey, row.amount, row.wholeUnit)}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function RecipeRow({
  item,
  useTracked,
  owned,
  busy,
  onRun,
}: {
  item: WishlistItem
  useTracked: boolean
  owned: ReturnType<typeof ownedIndexFromCards>
  busy: boolean
  onRun: (task: () => Promise<void>, refreshStock?: boolean) => Promise<void>
}) {
  const [qty, setQty] = useState(String(item.quantity))
  useEffect(() => {
    setQty(String(item.quantity))
  }, [item.quantity])
  const demand = oneCraftDemand(item)
  const ready = !useTracked || recipeReadyForOneCraft(item, owned)
  const lineDfp = wishlistItemDfp(item)

  return (
    <div className="site-surface rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-white">{item.blueprint_name}</span>
        <span className="text-xs text-slate-400">×{item.quantity}</span>
        <span className="text-xs text-amber-300">{formatDfpAuec(lineDfp)}</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          Qty
          <input
            type="number"
            min={1}
            max={9999}
            value={qty}
            disabled={busy}
            onChange={(event) => setQty(event.target.value)}
            onBlur={() => {
              const next = Math.trunc(Number(qty))
              if (!Number.isFinite(next) || next < 1 || next === item.quantity) {
                setQty(String(item.quantity))
                return
              }
              void onRun(() => setBpWishlistItemQuantity(item.id, next))
            }}
            className="site-input px-2 py-1 text-sm w-20"
            aria-label={`Quantity for ${item.blueprint_name}`}
          />
        </label>
        <button
          type="button"
          className="site-btn-secondary px-2 py-1 text-xs"
          disabled={busy}
          onClick={() => void onRun(() => removeBpWishlistItem(item.id))}
        >
          Remove
        </button>
        <button
          type="button"
          className={`px-3 py-1 text-xs rounded-lg ${
            ready && !busy ? 'site-btn-success' : 'site-btn-secondary opacity-50 cursor-not-allowed'
          }`}
          disabled={!ready || busy}
          title={
            ready
              ? useTracked
                ? 'Marks one craft done and removes those materials from My Resources'
                : 'Lowers this blueprint by one'
              : 'Every material needs enough of that exact quality in My Resources for one craft'
          }
          onClick={() => void onRun(() => gotItBpWishlistItem(item.id), useTracked)}
        >
          Got it
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {item.materials.map((material) => {
          const key = `${material.resourceKey}::${material.quality}`
          const need = demand.get(key)?.amount ?? material.scu
          const covered = !useTracked || demandCovered(owned, material.resourceKey, material.quality, need)
          const shown = scaleAmount(material.resourceKey, material.scu, item.quantity)
          const tone = !useTracked
            ? 'site-badge-slate'
            : covered
              ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/50 border border-red-500/40 text-red-300'
          return (
            <span key={`${material.slotIndex}-${key}`} className={`${tone} px-2 py-0.5 rounded text-xs font-mono`}>
              {material.label} {formatWishlistAmount(material.resourceKey, shown, material.wholeUnit)} Q{material.quality}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function scaleAmount(resourceKey: string, scu: number, quantity: number): number {
  if (isWholeUnitResource(resourceKey)) return Math.trunc(scu) * quantity
  return fromMilliScu(toMilliScu(scu) * quantity)
}
