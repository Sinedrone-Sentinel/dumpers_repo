import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useUiOverlayRegistration } from '../../contexts/UiOverlayContext'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { formatShopNumber } from '../../lib/shipShopMath'
import {
  SHOP_ATTRIBUTION,
  isForSale,
  locationLine,
  planStops,
  type CartPlanLine,
  type PlannedPurchase,
  type ShopListing,
} from '../../lib/shipShopShops'
import { cartLineKey, craftedDraftFields, craftedMaterials, type ShopCartLine } from '../../lib/shipShopData'

const CHIP = 'shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100'

const FEWEST_STOPS_NOTICE = 'This list uses the fewest stops. These are not the only locations where these items and ships can be bought.'

function purchasesByStore(lines: PlannedPurchase[]): Array<{ store: string; lines: PlannedPurchase[] }> {
  const groups: Array<{ store: string; lines: PlannedPurchase[] }> = []
  for (const line of lines) {
    const found = groups.find((group) => group.store === line.store)
    if (found) found.lines.push(line)
    else groups.push({ store: line.store, lines: [line] })
  }
  return groups
}

/** Backdrop stays fixed. The page behind it does not scroll. */
export function ShopModalFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useBodyScrollLock(true)
  const overlayId = useId()
  useUiOverlayRegistration(overlayId, true)
  useEffect(() => {
    const block = (event: WheelEvent) => {
      const target = event.target
      const scroller = target instanceof Element ? target.closest('[data-shop-modal-scroll]') : null
      if (!(scroller instanceof HTMLElement)) {
        event.preventDefault()
        return
      }
      const atTop = scroller.scrollTop <= 0
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault()
    }
    document.addEventListener('wheel', block, { passive: false, capture: true })
    return () => document.removeEventListener('wheel', block, { capture: true })
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="site-modal-backdrop z-[70] flex items-start justify-center overflow-hidden overscroll-none p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

const LINE_ICON = 'inline-flex h-5 shrink-0 items-center justify-center px-0.5 leading-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 hover:brightness-125'

export function ShopBuyButtons({
  listings,
  showBuild,
  cartCount,
  addEnabled,
  icons,
  onWhere,
  onAdd,
  onAddBuild,
  onViewCart,
}: {
  listings: ShopListing[]
  showBuild?: boolean
  cartCount?: number
  /** Crafted parts can be added even when the shop does not sell them. */
  addEnabled?: boolean
  /** Fitted lines use symbols. The ship header keeps the labeled buttons. */
  icons?: boolean
  onWhere: () => void
  onAdd: () => void
  onAddBuild?: () => void
  onViewCart?: () => void
}) {
  const forSale = isForSale(listings)
  const canAdd = addEnabled ?? forSale
  return (
    <>
      <button type="button" className={icons ? `${LINE_ICON} text-xs font-bold text-red-400` : `${CHIP} site-filter-selected-red`} disabled={!forSale} title={forSale ? 'Where to buy' : 'Not sold in a shop'} aria-label="Where to buy" onClick={onWhere}>
        {icons ? '$$$' : 'Where to Buy'}
      </button>
      <button type="button" className={icons ? `${LINE_ICON} text-green-400` : `${CHIP} site-filter-selected-green`} disabled={!canAdd} title={canAdd ? 'Add to cart' : 'Not sold in a shop'} aria-label="Add to cart" onClick={onAdd}>
        {icons ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.2 11h11.3l2-7H7" />
          </svg>
        ) : 'Add to Cart'}
      </button>
      {showBuild && (
        <button type="button" className={`${CHIP} site-filter-selected-blue`} onClick={onAddBuild}>
          Add Build to Cart
        </button>
      )}
      {onViewCart && (
        <button type="button" className={`${CHIP} site-filter-selected-amber`} onClick={onViewCart}>
          {cartCount ? `View Cart (${cartCount})` : 'View Cart'}
        </button>
      )}
    </>
  )
}

export function ShopWhereModal({
  title,
  listings,
  onClose,
}: {
  title: string
  listings: ShopListing[]
  onClose: () => void
}) {
  const rows = [...listings].filter((row) => row.price > 0).sort((a, b) => locationLine(a).localeCompare(locationLine(b)) || a.price - b.price)
  if (rows.length === 0) return null
  return (
    <ShopModalFrame onClose={onClose}>
      <div className="site-modal-shell mt-16 flex max-h-[min(70dvh,calc(100dvh-6rem))] w-full max-w-xl flex-col overflow-hidden p-4" role="dialog" aria-modal="true" aria-label={`Where to buy ${title}`}>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-white">Where to buy {title}</h3>
          <button type="button" className="site-btn-ghost shrink-0 px-3 py-1 text-sm" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div data-shop-modal-scroll className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
          {rows.map((row) => (
            <div key={`${locationLine(row)}-${row.price}`} className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <span className="text-slate-100">{locationLine(row)}</span>
              <span className="shrink-0 text-slate-300">{formatShopNumber(row.price)} aUEC</span>
            </div>
          ))}
        </div>
        <p className="site-hint mt-3 shrink-0 text-xs">{SHOP_ATTRIBUTION}</p>
      </div>
    </ShopModalFrame>
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
    <ShopModalFrame onClose={onClose}>
      <div className="site-modal-shell mt-16 w-full max-w-sm overflow-hidden p-4" role="dialog" aria-modal="true" aria-label={`Add ${title} to cart`}>
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
    </ShopModalFrame>
  )
}

export function ShopCartModal({
  lines,
  onClose,
  onQty,
  onRemove,
  onAddToOrders,
}: {
  lines: Array<ShopCartLine & CartPlanLine>
  onClose: () => void
  onQty: (line: ShopCartLine, qty: number) => void
  onRemove: (line: ShopCartLine) => void
  onAddToOrders: () => void
}) {
  const buyLines = lines.filter((line) => !line.crafted)
  const crafted = lines.filter((line) => line.crafted)
  const stops = planStops(buyLines)
  const canOrder = crafted.some((line) => craftedDraftFields(line.id, line.qualities, line.qty))
  return (
    <ShopModalFrame onClose={onClose}>
      <div className="site-modal-shell mt-16 flex max-h-[min(80dvh,calc(100dvh-6rem))] w-full max-w-3xl flex-col overflow-hidden p-4" role="dialog" aria-modal="true" aria-label="View cart">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="min-w-0 flex-1 text-base font-semibold text-white">Cart</h3>
          <button type="button" className="site-btn-ghost shrink-0 px-3 py-1 text-sm" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-slate-200">The cart is empty.</p>
        ) : (
          <div data-shop-modal-scroll className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
            {crafted.length > 0 && (
              <section className="site-card p-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-white">Crafted</h4>
                <p className="site-hint mt-1 text-xs">Crafted parts are not sold in a shop. Review them in My Orders, then post a WTB or WTS.</p>
                <ul className="mt-3 space-y-3">
                  {crafted.map((line) => (
                    <li key={`${line.kind}:${line.id}:${JSON.stringify(line.qualities || {})}`}>
                      <p className="text-sm text-slate-100">{line.name} × {line.qty}</p>
                      <ul className="mt-1 space-y-0.5 pl-3">
                        {craftedMaterials(line.id, line.qualities, line.qty).map((row) => (
                          <li key={`${row.label}:${row.quality}`} className="text-sm text-slate-300">
                            {row.label} · Q{row.quality} · {row.text}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="site-btn-primary mt-3 px-3 py-1.5 text-sm"
                  disabled={!canOrder}
                  onClick={onAddToOrders}
                >
                  Add to My Orders
                </button>
              </section>
            )}
            {stops.length > 0 && (
              <>
                <p className="site-banner-info">{FEWEST_STOPS_NOTICE}</p>
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Stops</h4>
                  <ol className="mt-2 space-y-3">
                    {stops.map((stop, index) => (
                      <li key={`${stop.place}-${index}`} className="site-card p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{stop.place}</p>
                          <p className="shrink-0 text-sm text-slate-300">{formatShopNumber(stop.total)} aUEC</p>
                        </div>
                        <div className="mt-3 space-y-3">
                          {purchasesByStore(stop.lines).map((group) => (
                            <div key={group.store}>
                              <p className="text-sm font-medium text-slate-100">{group.store}</p>
                              <ul className="mt-1 space-y-1">
                                {group.lines.map((line) => (
                                  <li key={`${group.store}:${line.name}`} className="flex items-baseline justify-between gap-3 pl-3 text-sm">
                                    <span className="min-w-0 text-slate-200">{line.name} × {line.qty}</span>
                                    <span className="shrink-0 text-slate-400">{formatShopNumber(line.lineTotal)} aUEC</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
            <div className={stops.length > 0 ? 'site-divider space-y-2 pt-4' : 'space-y-2'}>
              {lines.map((line) => (
                <div key={cartLineKey(line)} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-white">{line.crafted ? `${line.name} (crafted)` : line.name}</span>
                  <button type="button" className="site-btn-ghost px-2 py-0.5" aria-label={`Decrease ${line.name}`} onClick={() => onQty(line, line.qty - 1)}>−</button>
                  <span className="w-8 text-center text-slate-100">{line.qty}</span>
                  <button type="button" className="site-btn-ghost px-2 py-0.5" aria-label={`Increase ${line.name}`} onClick={() => onQty(line, line.qty + 1)}>+</button>
                  <button type="button" className="site-btn-ghost px-2 py-0.5" onClick={() => onRemove(line)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="site-hint mt-3 shrink-0 text-xs">{SHOP_ATTRIBUTION}</p>
      </div>
    </ShopModalFrame>
  )
}
