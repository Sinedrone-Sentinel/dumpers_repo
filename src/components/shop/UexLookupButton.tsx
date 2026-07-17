import React from 'react'
import CommodityLookupModal from './CommodityLookupModal'
import { findCommodityByName } from '../../lib/shopLookup'

interface UexLookupButtonProps {
  /** In-app name (ore/resource/commodity); resolved fuzzily against UEX names. */
  commodityName: string
  /** Which side to lead with in the modal. Defaults to 'sell'. */
  emphasis?: 'sell' | 'buy'
  /** Optional visible label; defaults to the branded "UEX" chip. */
  label?: string
  size?: 'xs' | 'sm'
  className?: string
  /** Accessible/tooltip text; defaults based on emphasis. */
  title?: string
}

/**
 * Small branded "UEX" chip that opens a commodity buy/sell lookup modal.
 * Renders nothing when the name doesn't resolve to a tradable commodity, so it
 * self-filters on components, blueprints, gadgets, and unreleased items.
 */
export default function UexLookupButton({
  commodityName,
  emphasis = 'sell',
  label = 'UEX',
  size = 'xs',
  className = '',
  title,
}: UexLookupButtonProps) {
  const [open, setOpen] = React.useState(false)

  // Resolve once so we can hide the chip entirely when there's no market.
  const resolves = React.useMemo(() => !!findCommodityByName(commodityName), [commodityName])
  if (!resolves) return null

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-1' : 'text-[10px] px-1.5 py-0.5'
  const tooltip =
    title ?? (emphasis === 'buy' ? `Where to buy ${commodityName}` : `Where to sell ${commodityName}`)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={tooltip}
        aria-label={tooltip}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide rounded border border-sky-500/40 bg-sky-950/50 text-sky-300 hover:bg-sky-900/60 hover:text-sky-200 transition-colors ${sizeClass} ${className}`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        {label}
      </button>
      {open && (
        <CommodityLookupModal
          commodityName={commodityName}
          emphasis={emphasis}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
