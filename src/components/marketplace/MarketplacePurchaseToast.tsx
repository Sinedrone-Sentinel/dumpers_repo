import React from 'react'
import MarketplaceAdGhostMark from './MarketplaceAdGhostMark'
import { buildPurchaseToastMessage, type MarketplacePurchaseFeedRow } from '../../lib/marketplaceAds'
import { PURCHASE_TOAST_SLIDE_MS } from '../../hooks/useMarketplacePurchaseFeed'

interface MarketplacePurchaseToastProps {
  row: MarketplacePurchaseFeedRow
  visible: boolean
  closing: boolean
  bottomOffset: number
  onDismiss: () => void
}

export default function MarketplacePurchaseToast({
  row,
  visible,
  closing,
  bottomOffset,
  onDismiss,
}: MarketplacePurchaseToastProps) {
  const show = visible || closing
  if (!show) return null

  return (
    <div
      className={`fixed left-4 z-[56] w-[min(100vw-2rem,22rem)] transition-all ease-out ${
        visible && !closing ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
      style={{
        bottom: bottomOffset,
        transitionDuration: `${PURCHASE_TOAST_SLIDE_MS}ms`,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-xl border border-slate-600/50 bg-slate-900/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
        <MarketplaceAdGhostMark />
        <div className="relative z-10 flex items-start justify-between gap-2">
          <p className="text-sm leading-snug text-slate-100">{buildPurchaseToastMessage(row)}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
