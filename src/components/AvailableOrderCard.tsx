import React from 'react'
import ListingTypeBadge from './ListingTypeBadge'
import OrderRequestLines, { orderKindLabel } from './OrderRequestLines'
import ReputationBadge from './ReputationBadge'
import TradeContactChip from './TradeContactChip'
import WtsPartialPurchasePanel, { type WtsLineSelection } from './WtsPartialPurchasePanel'
import { formatDfpAuec } from '../lib/dfp'
import { orderHasHighQualityBlueprint } from '../lib/orderDeadlines'
import { isWtsPartialListing, orderListingType } from '../lib/listingType'
import { orderTotalDfp } from '../lib/orderPricing'
import type { MemberReputation } from '../lib/reputation'
import type { CustomOrder } from '../lib/operations'
import type { BlueprintWithSlots } from '../lib/blueprintResources'

function orderKindBadgeClass(order: CustomOrder): string {
  const kind = orderKindLabel(order).toLowerCase()
  if (kind.includes('mixed')) {
    return 'bg-amber-950/40 text-amber-200 border-amber-500/30'
  }
  if (kind.includes('blueprint')) {
    return 'bg-red-950/40 text-red-200 border-red-500/30'
  }
  return 'bg-cyan-950/40 text-cyan-200 border-cyan-500/30'
}

interface AvailableOrderCardProps {
  order: CustomOrder
  expanded: boolean
  onToggle: () => void
  blueprintById: Map<string, BlueprintWithSlots>
  showDfp: boolean
  buyerRep: MemberReputation
  sellerRep: MemberReputation
  acceptBlockers: string[]
  meetsMinRep: boolean
  canAccept: boolean
  canAcceptLimits: boolean
  accepting: boolean
  onAccept: () => void
  onAcceptPartial: (selections: WtsLineSelection[]) => void
}

export default function AvailableOrderCard({
  order,
  expanded,
  onToggle,
  blueprintById,
  showDfp,
  buyerRep,
  sellerRep,
  acceptBlockers,
  meetsMinRep,
  canAccept,
  canAcceptLimits,
  accepting,
  onAccept,
  onAcceptPartial,
}: AvailableOrderCardProps) {
  const isWts = orderListingType(order) === 'wts'
  const allowsPartial = isWts && isWtsPartialListing(order)
  const totalDfp = orderTotalDfp(order)
  const kindLabel = orderKindLabel(order)

  return (
    <div
      className={`rounded-xl border bg-slate-900/60 transition-colors ${
        expanded ? 'border-slate-600' : 'border-slate-700'
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 min-w-0 text-left group"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <svg
              className={`w-4 h-4 shrink-0 text-slate-500 transition-transform group-hover:text-slate-300 ${
                expanded ? 'rotate-90' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>

            <span className="text-white text-sm font-medium truncate max-w-[12rem] sm:max-w-none">
              {order.title}
            </span>

            <ListingTypeBadge order={order} />

            {isWts ? (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                  allowsPartial
                    ? 'bg-cyan-950/40 text-cyan-200 border-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-600'
                }`}
              >
                {allowsPartial ? 'Partial OK' : 'Full listing only'}
              </span>
            ) : null}

            <span
              className={`px-2 py-0.5 rounded text-[10px] border font-medium uppercase tracking-wide ${orderKindBadgeClass(order)}`}
            >
              {kindLabel}
            </span>

            <TradeContactChip
              role={isWts ? 'seller' : 'buyer'}
              profile={order.requester}
              inline
            />

            {showDfp && totalDfp > 0 ? (
              <span className="text-amber-300/90 text-xs font-mono tabular-nums">
                {formatDfpAuec(totalDfp)}
              </span>
            ) : null}

            {!isWts ? <ReputationBadge label="Buyer rep" reputation={buyerRep} /> : null}
            {isWts ? (
              <ReputationBadge
                label="Seller rep"
                reputation={sellerRep}
                type="fulfiller"
              />
            ) : null}

            {order.min_fulfiller_reputation != null ? (
              <span className="px-2 py-0.5 rounded text-[10px] border bg-slate-800 text-slate-400 border-slate-600">
                Requires {isWts ? 'buyer' : 'fulfiller'} {order.min_fulfiller_reputation}+
              </span>
            ) : null}
          </div>
        </button>

        {!allowsPartial ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={!canAccept || accepting}
            className="px-3 py-1.5 text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 rounded disabled:opacity-40 shrink-0"
          >
            {accepting ? 'Accepting...' : isWts ? 'Buy listing' : 'Accept order'}
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/80 space-y-2">
          {!meetsMinRep ? (
            <p className="text-amber-400/90 text-xs">
              Your {isWts ? 'buyer' : 'fulfiller'} reputation is below this order&apos;s minimum.
            </p>
          ) : null}

          {acceptBlockers.length > 0 ? (
            <ul className="text-amber-400/80 text-xs space-y-0.5 max-w-full break-words">
              {acceptBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}

          {!isWts && orderHasHighQualityBlueprint(order) ? (
            <p className="text-orange-300/90 text-xs">
              This order includes 800+ quality items — confirm you have materials before
              accepting.
            </p>
          ) : null}

          <OrderRequestLines
            order={order}
            blueprintById={blueprintById}
            showDfp={showDfp}
            showEffectiveStats
            showKindBadge={false}
          />

          {allowsPartial ? (
            <WtsPartialPurchasePanel
              order={order}
              showDfp={showDfp}
              disabled={!meetsMinRep || !canAcceptLimits}
              submitting={accepting}
              onPurchase={onAcceptPartial}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
