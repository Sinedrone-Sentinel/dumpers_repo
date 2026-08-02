import React, { useEffect, useRef } from 'react'
import MarketplaceAdGhostMark from './MarketplaceAdGhostMark'
import {
  adListingBadge,
  buildAdSummaryLine,
  formatAdPrice,
  type MarketplaceAdCandidate,
} from '../../lib/marketplaceAds'

interface MarketplaceAdSliderProps {
  candidate: MarketplaceAdCandidate
  visible: boolean
  closing: boolean
  onClose: () => void
  onNotInterested: () => void
  onDontShowAgain: () => void
  onOohGimme: () => void
  onOpenSettings: () => void
  onHeightChange: (height: number) => void
}

export default function MarketplaceAdSlider({
  candidate,
  visible,
  closing,
  onClose,
  onNotInterested,
  onDontShowAgain,
  onOohGimme,
  onOpenSettings,
  onHeightChange,
}: MarketplaceAdSliderProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const report = () => onHeightChange(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeightChange, candidate, visible])

  const show = visible || closing
  if (!show) return null

  const summary = buildAdSummaryLine(candidate)
  const seller = candidate.requester_rsi_handle ?? 'A member'

  return (
    <div
      ref={panelRef}
      className={`fixed left-4 z-[55] w-[min(100vw-2rem,22rem)] transition-transform duration-200 ease-out ${
        visible && !closing ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{
        bottom: 'calc(16px + var(--site-ticker-height, 0px))',
        transitionDuration: closing ? '200ms' : '300ms',
      }}
      role="dialog"
      aria-label="Marketplace listing"
    >
      <div className="site-glass relative overflow-hidden rounded-xl p-3 shadow-xl backdrop-blur-md">
        <MarketplaceAdGhostMark />

        <div className="relative z-10">
          <div className="mb-2 flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="site-btn-icon rounded p-1 text-slate-400"
              aria-label="Marketplace settings"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="site-btn-icon rounded p-1 text-slate-400"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">
            {adListingBadge(candidate.listing_type)} · {candidate.title}
          </p>
          <p className="mt-1 text-sm text-slate-200">
            {candidate.listing_type === 'wts' ? 'Seller' : 'Buyer'}: {seller} ·{' '}
            <span className="text-amber-300">{formatAdPrice(candidate.total_dfp_auec)}</span>
          </p>
          {summary ? <p className="mt-1 text-xs text-slate-400">{summary}</p> : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onNotInterested}
              className="site-filter-idle rounded-full px-2.5 py-1 text-xs"
            >
              Not interested
            </button>
            <button
              type="button"
              onClick={onOohGimme}
              className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-200 hover:border-amber-400/60"
            >
              Ooh, Gimme
            </button>
            <button
              type="button"
              onClick={onDontShowAgain}
              className="site-filter-idle rounded-full px-2.5 py-1 text-xs"
            >
              Don&apos;t Show Again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
