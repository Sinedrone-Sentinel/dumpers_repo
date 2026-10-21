import { useState } from 'react'
import AppModal from '../layout/AppModal'
import { addShopCartLine } from '../../lib/shopCart'
import type { UexCatalogItem } from '../../lib/uexCatalog'
import { terminalPath, terminalPlace, type TradeLocation } from '../../lib/shopLookup'

const ICON = 'inline-flex h-5 shrink-0 items-center justify-center px-0.5 leading-none hover:brightness-125'

function CartMark() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.2 11h11.3l2-7H7" />
    </svg>
  )
}

export function UexShopIconPair({ onWhere, onAdd, showWhere = true }: { onWhere: () => void; onAdd: () => void; showWhere?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {showWhere && (
        <button
          type="button"
          className={`${ICON} text-xs font-bold text-red-400`}
          title="Where to buy"
          aria-label="Where to buy"
          onClick={(event) => {
            event.stopPropagation()
            onWhere()
          }}
        >
          $$$
        </button>
      )}
      <button
        type="button"
        className={`${ICON} text-green-400`}
        title="Add to cart"
        aria-label="Add to cart"
        onClick={(event) => {
          event.stopPropagation()
          onAdd()
        }}
      >
        <CartMark />
      </button>
    </span>
  )
}

function placeName(loc: TradeLocation): string {
  return loc.label || terminalPlace(loc.terminal)
}

function placePath(loc: TradeLocation): string {
  return loc.pathLabel || terminalPath(loc.terminal)
}

function priceText(loc: TradeLocation): string {
  const price = loc.buyPricePerScu
  if (!(price && price > 0)) return ''
  const amount = Math.round(price).toLocaleString()
  return loc.unit === 'each' ? `${amount} aUEC` : `${amount} aUEC/SCU`
}

function PlacesModal({ item, onClose }: { item: UexCatalogItem; onClose: () => void }) {
  const groups = new Map<string, TradeLocation[]>()
  for (const loc of item.buyAt) {
    const system = loc.terminal.system || 'Other'
    const list = groups.get(system)
    if (list) list.push(loc)
    else groups.set(system, [loc])
  }
  return (
    <AppModal title={item.name} subtitle="Every shop that sells this. Powered by UEX." onClose={onClose} size="md" zIndex={80}>
      <div className="space-y-3">
        {[...groups.entries()].map(([system, rows]) => (
          <section key={system}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{system}</h4>
            <ul className="mt-1 space-y-1.5">
              {rows.map((loc) => (
                <li key={`${placeName(loc)}:${placePath(loc)}:${loc.buyPricePerScu}`} className="site-card p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-white">{placeName(loc)}</p>
                    <p className="shrink-0 text-sm text-sky-300">{priceText(loc)}</p>
                  </div>
                  {placePath(loc) && <p className="mt-1 text-[11px] text-slate-400">{placePath(loc)}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppModal>
  )
}

function QtyModal({
  name,
  unit,
  onClose,
  onAdd,
}: {
  name: string
  unit: 'scu' | 'each'
  onClose: () => void
  onAdd: (qty: number) => void
}) {
  const [qty, setQty] = useState(1)
  return (
    <AppModal title={`Add ${name}`} subtitle={unit === 'scu' ? 'Quantity in SCU' : 'How many'} onClose={onClose} size="sm" zIndex={80}>
      <div className="flex items-center justify-center gap-3">
        <button type="button" className="site-btn-ghost px-3 py-1" aria-label="Decrease quantity" onClick={() => setQty((value) => Math.max(1, value - 1))}>−</button>
        <span className="w-12 text-center text-lg font-semibold text-white">{qty}</span>
        <button type="button" className="site-btn-ghost px-3 py-1" aria-label="Increase quantity" onClick={() => setQty((value) => value + 1)}>+</button>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="site-btn-primary px-3 py-1.5 text-sm" onClick={() => onAdd(qty)}>Add</button>
      </div>
    </AppModal>
  )
}

/** $$$ lists every seller. The cart mark adds this item, optionally locked to one shop. */
export function UexItemActions({
  item,
  place,
  showWhere = true,
}: {
  item: UexCatalogItem
  place?: TradeLocation | null
  /** UEX Lookup already lists every seller, so that page hides $$$. */
  showWhere?: boolean
}) {
  const [where, setWhere] = useState(false)
  const [qtyOpen, setQtyOpen] = useState(false)
  return (
    <>
      <UexShopIconPair showWhere={showWhere} onWhere={() => setWhere(true)} onAdd={() => setQtyOpen(true)} />
      {showWhere && where && <PlacesModal item={item} onClose={() => setWhere(false)} />}
      {qtyOpen && (
        <QtyModal
          name={item.name}
          unit={item.unit}
          onClose={() => setQtyOpen(false)}
          onAdd={(qty) => {
            addShopCartLine({
              id: item.id,
              name: item.name,
              qty,
              unit: item.unit,
              price: place?.buyPricePerScu && place.buyPricePerScu > 0 ? place.buyPricePerScu : null,
              shop: place ? placeName(place) : null,
              system: place?.terminal.system || null,
            })
            setQtyOpen(false)
          }}
        />
      )}
    </>
  )
}
