import { useState } from 'react'
import { formatShopNumber } from '../../lib/shipShopMath'
import {
  SHOP_ATTRIBUTION,
  isForSale,
  itineraryText,
  locationLine,
  planStops,
  type CartPlanLine,
  type ShopListing,
} from '../../lib/shipShopShops'
import type { ShopCartLine } from '../../lib/shipShopData'

const BUY = 'site-btn-ghost shrink-0 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40'

export function ShopBuyButtons({
  listings,
  showBuild,
  cartCount,
  onWhere,
  onAdd,
  onAddBuild,
  onViewCart,
}: {
  listings: ShopListing[]
  showBuild?: boolean
  cartCount?: number
  onWhere: () => void
  onAdd: () => void
  onAddBuild?: () => void
  onViewCart?: () => void
}) {
  const forSale = isForSale(listings)
  return (
    <>
      <button type="button" className={BUY} onClick={onWhere}>
        Where to Buy
      </button>
      <button type="button" className={BUY} disabled={!forSale} title={forSale ? 'Add to cart' : 'Not sold in a shop'} onClick={onAdd}>
        Add to Cart
      </button>
      {showBuild && (
        <button type="button" className={BUY} onClick={onAddBuild}>
          Add Build to Cart
        </button>
      )}
      {onViewCart && (
        <button type="button" className={BUY} onClick={onViewCart}>
          {cartCount ? `View Cart (${cartCount})` : 'View Cart'}
        </button>
      )}
    </>
  )
}

export function ShopWhereModal({
  title,
  listings,
  craftable,
  ship,
  onClose,
}: {
  title: string
  listings: ShopListing[]
  craftable: boolean
  ship: boolean
  onClose: () => void
}) {
  const rows = [...listings].filter((row) => row.price > 0).sort((a, b) => locationLine(a).localeCompare(locationLine(b)) || a.price - b.price)
  return (
    <div className="site-modal-backdrop z-50 flex items-start justify-center overflow-y-auto p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="site-modal-shell mt-16 flex max-h-[70vh] w-full max-w-xl flex-col p-4" role="dialog" aria-label={`Where to buy ${title}`} onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-white">Where to buy {title}</h3>
          <button type="button" className="site-btn-ghost shrink-0 px-3 py-1 text-sm" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-200">
            {ship
              ? 'This ship is not sold in a shop.'
              : craftable
                ? 'This is not sold in a shop. Craft it.'
                : 'This is not sold in a shop. It has to be found in the game.'}
          </p>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {rows.map((row) => (
              <div key={`${locationLine(row)}-${row.price}`} className="flex items-baseline justify-between gap-3 py-1 text-sm">
                <span className="text-slate-100">{locationLine(row)}</span>
                <span className="shrink-0 text-slate-300">{formatShopNumber(row.price)} aUEC</span>
              </div>
            ))}
          </div>
        )}
        <p className="site-hint mt-3 text-xs">{SHOP_ATTRIBUTION}</p>
      </div>
    </div>
  )
}

export function ShopQtyModal({
  title,
  onClose,
  onAdd,
}: {
  title: string
  onClose: () => void
  onAdd: (qty: number) => void
}) {
  const [qty, setQty] = useState(1)
  return (
    <div className="site-modal-backdrop z-50 flex items-start justify-center overflow-y-auto p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="site-modal-shell mt-16 w-full max-w-sm p-4" role="dialog" aria-label={`Add ${title} to cart`} onClick={(event) => event.stopPropagation()}>
        <h3 className="truncate text-base font-semibold text-white">Add {title}</h3>
        <label className="mt-3 block">
          <span className="site-label">How many</span>
          <input
            className="site-input mt-1 w-full px-3 py-2"
            type="number"
            min={1}
            value={qty}
            onChange={(event) => setQty(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="site-btn-primary px-3 py-1.5 text-sm" onClick={() => onAdd(qty)}>Add</button>
        </div>
      </div>
    </div>
  )
}

export function ShopCartModal({
  lines,
  onClose,
  onQty,
  onRemove,
}: {
  lines: Array<ShopCartLine & CartPlanLine>
  onClose: () => void
  onQty: (line: ShopCartLine, qty: number) => void
  onRemove: (line: ShopCartLine) => void
}) {
  const stops = planStops(lines)
  const text = itineraryText(stops)
  return (
    <div className="site-modal-backdrop z-50 flex items-start justify-center overflow-y-auto p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="site-modal-shell mt-16 flex max-h-[80vh] w-full max-w-2xl flex-col p-4" role="dialog" aria-label="View cart" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="min-w-0 flex-1 text-base font-semibold text-white">Cart</h3>
          <button type="button" className="site-btn-ghost shrink-0 px-3 py-1 text-sm" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-slate-200">The cart is empty.</p>
        ) : (
          <>
            <p className="text-sm text-slate-100">{text}</p>
            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {lines.map((line) => (
                <div key={`${line.kind}:${line.id}`} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-white">{line.name}</span>
                  <button type="button" className="site-btn-ghost px-2 py-0.5" aria-label={`Decrease ${line.name}`} onClick={() => onQty(line, line.qty - 1)}>−</button>
                  <span className="w-8 text-center text-slate-100">{line.qty}</span>
                  <button type="button" className="site-btn-ghost px-2 py-0.5" aria-label={`Increase ${line.name}`} onClick={() => onQty(line, line.qty + 1)}>+</button>
                  <button type="button" className="site-btn-ghost px-2 py-0.5" onClick={() => onRemove(line)}>Remove</button>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="site-hint mt-3 text-xs">{SHOP_ATTRIBUTION}</p>
      </div>
    </div>
  )
}
