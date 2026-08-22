import React from 'react'
import ListingTypeBadge from './ListingTypeBadge'
import OrderRequestLines, { orderKindLabel } from './OrderRequestLines'
import ReputationBadge from './ReputationBadge'
import TradeContactChip from './TradeContactChip'
import WtsPartialPurchasePanel, { type WtsLineSelection } from './WtsPartialPurchasePanel'
import { formatDfpAuec } from '../lib/dfp'
import { orderHasHighQualityBlueprint } from '../lib/orderDeadlines'
import { isListingContainer, orderListingType } from '../lib/listingType'
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
  highlighted?: boolean
  onToggle: () => void
  blueprintById: Map<string, BlueprintWithSlots>
  showDfp: boolean
  buyerRep: MemberReputation
  sellerRep: MemberReputation
  acceptBlockers: string[]
  meetsMinRep: boolean
  canAcceptLimits: boolean
  accepting: boolean
  /** Fulfill mode: used to flag WTB blueprint lines missing from the fulfiller's tracker. */
  acquiredBlueprints?: Record<string, boolean>
  onAcceptPartial: (selections: WtsLineSelection[]) => void
}

export default function AvailableOrderCard({
  order,
  expanded,
  highlighted = false,
  onToggle,
  blueprintById,
  showDfp,
  buyerRep,
  sellerRep,
  acceptBlockers,
  meetsMinRep,
  canAcceptLimits,
  accepting,
  acquiredBlueprints,
  onAcceptPartial,
}: AvailableOrderCardProps) {
  const isWts = orderListingType(order) === 'wts'
  const allowsPartial = isListingContainer(order)
  const totalDfp = orderTotalDfp(order)
  const kindLabel = orderKindLabel(order)

  return (
    <div
      id={`fulfillment-order-${order.id}`}
      className={`site-card transition-colors scroll-mt-24 ${
        highlighted
          ? 'border-orange-400/70 ring-2 ring-orange-400/50'
          : ''
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

            {allowsPartial ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-cyan-950/40 text-cyan-200 border-cyan-500/30">
                {isWts ? 'Pick items to buy' : 'Pick items to fulfill'}
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
              <span className="site-badge-slate text-[10px]">
                Requires {isWts ? 'buyer' : 'fulfiller'} {order.min_fulfiller_reputation}+
              </span>
            ) : null}
          </div>
        </button>

      </div>

      {expanded ? (
        <div className="px-3 pb-3 pt-1 site-divider space-y-2">
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

          {allowsPartial ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
              <div className="site-surface p-2.5 min-w-0 flex flex-col gap-2">
                <p className="site-label !mb-0 text-[11px] uppercase tracking-wide">
                  Listed items
                </p>
                <OrderRequestLines
                  order={order}
                  blueprintById={blueprintById}
                  showDfp={showDfp}
                  showEffectiveStats
                  showKindBadge={false}
                />
              </div>
              <WtsPartialPurchasePanel
                order={order}
                mode={isWts ? 'buy' : 'fulfill'}
                acquiredBlueprints={acquiredBlueprints}
                showDfp={showDfp}
                disabled={!meetsMinRep || !canAcceptLimits}
                submitting={accepting}
                onPurchase={onAcceptPartial}
                className="h-full"
              />
            </div>
          ) : (
            <OrderRequestLines
              order={order}
              blueprintById={blueprintById}
              showDfp={showDfp}
              showEffectiveStats
              showKindBadge={false}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}
