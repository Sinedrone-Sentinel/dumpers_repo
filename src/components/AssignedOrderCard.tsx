import { Link } from '@tanstack/react-router'
import ListingTypeBadge from './ListingTypeBadge'
import OrderDeadlineNotice from './OrderDeadlineNotice'
import OrderNextStepCallout from './OrderNextStepCallout'
import OrderRequestLines from './OrderRequestLines'
import ReputationBadge from './ReputationBadge'
import TradeContactChip from './TradeContactChip'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import { formatDfpAuec } from '../lib/dfp'
import { resourceQuantityUnitLabel } from '../config/resourceTypes'
import { formatQuantityForResource } from '../lib/resourceQuantity'
import { orderTotalDfp } from '../lib/orderPricing'
import { buyerReputationFromRow, type MemberReputationRow } from '../lib/reputation'
import type { CustomOrder } from '../lib/operations'
import DealMessageButton from './DealMessageButton'
import {
  buildStockByQuality,
  collectOrderDeductPlan,
  formatDeductPlanHint,
  planFitsStock,
  type StockDeductCard,
} from '../lib/bazaarStockDeduct'

interface AssignedOrderCardProps {
  order: CustomOrder
  blueprintById: Map<string, BlueprintWithSlots>
  dfpDisplayEnabled: boolean
  reputations: Record<string, MemberReputationRow>
  labelMap: Record<string, string>
  inventory: StockDeductCard[]
  orderItems: { resourceKey: string; quantity: number }[]
  notes: string
  onNotesChange: (value: string) => void
  submitting: boolean
  onAbandon: () => void
  onStartWork: () => void
  onCompleteCraft: () => void
}

export default function AssignedOrderCard({
  order,
  blueprintById,
  dfpDisplayEnabled,
  reputations,
  labelMap,
  inventory,
  orderItems,
  notes,
  onNotesChange,
  submitting,
  onAbandon,
  onStartWork,
  onCompleteCraft,
}: AssignedOrderCardProps) {
  const totalDfp = orderTotalDfp(order)
  const deductPlan = collectOrderDeductPlan(order, blueprintById)
  const hasDeduct = deductPlan.length > 0
  const canCoverDeduct = !hasDeduct || planFitsStock(deductPlan, buildStockByQuality(inventory))

  return (
    <div className="p-4 site-surface space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-white font-medium flex items-center gap-2 flex-wrap">
          {order.title}
          <ListingTypeBadge order={order} />
        </span>
        {hasDeduct && (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              canCoverDeduct
                ? 'bg-green-950/50 text-green-300 border-green-500/30'
                : 'bg-red-950/50 text-red-300 border-red-500/30'
            }`}
          >
            {canCoverDeduct ? 'Stock OK' : 'Short stock'}
          </span>
        )}
      </div>

      <p className="text-slate-500 text-xs">
        {order.status.replace(/_/g, ' ')}
        {dfpDisplayEnabled && totalDfp > 0 && (
          <span className="text-amber-300/90"> ? {formatDfpAuec(totalDfp)}</span>
        )}
      </p>

      <TradeContactChip role="customer" profile={order.requester} />

      <OrderRequestLines
        order={order}
        showDfp={dfpDisplayEnabled}
        blueprintById={blueprintById}
        showEffectiveStats
      />

      <ReputationBadge
        label="Buyer rep"
        reputation={buyerReputationFromRow(reputations[order.requester_id])}
        userId={order.requester_id}
      />

      <OrderDeadlineNotice order={order} role="fulfiller" />
      <OrderNextStepCallout order={order} context="wtb_fulfiller" />

      {(order.status === 'accepted' || order.status === 'in_progress') && orderItems.length > 0 && (
        <details open className="group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300 select-none">
            Craft checklist
          </summary>
          <div className="mt-2 space-y-2">
            {orderItems.map((item) => (
              <div
                key={item.resourceKey}
                className="flex items-center justify-between text-sm site-surface px-3 py-2"
              >
                <span className="text-slate-300">
                  {getResourceLabel(item.resourceKey, labelMap)}
                </span>
                <span className="tabular-nums text-slate-400">
                  {formatQuantityForResource(item.resourceKey, item.quantity)}{' '}
                  {resourceQuantityUnitLabel(item.resourceKey)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {hasDeduct && (
        <div className="site-surface px-3 py-2 space-y-1">
          <p className="text-slate-300 text-xs font-medium">Will deduct from Tracked Resources</p>
          <p className="site-hint !mt-0">{formatDeductPlanHint(deductPlan, labelMap)}</p>
          {!canCoverDeduct && (
            <p className="text-red-300 text-xs">
              Short at the listed qualities. Add stock in{' '}
              <Link to="/resources" className="text-red-200 underline">
                Resource Tracker
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="pt-3 site-divider space-y-2">
        <DealMessageButton order={order} variant="stack" />
        <button
          type="button"
          onClick={onAbandon}
          disabled={submitting}
          className="site-btn-secondary w-full"
        >
          {submitting ? 'Releasing...' : 'Abandon job ? return to pool'}
        </button>

        {order.status === 'accepted' && (
          <button
            type="button"
            onClick={onStartWork}
            disabled={submitting}
            className="w-full py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {submitting ? 'Starting...' : 'Start work'}
          </button>
        )}

        {(order.status === 'accepted' || order.status === 'in_progress') && (
          <>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Craft notes (optional)"
              rows={2}
              className="site-textarea w-full px-3 py-2 text-sm min-h-0"
            />

            <button
              type="button"
              onClick={onCompleteCraft}
              disabled={(hasDeduct && !canCoverDeduct) || submitting}
              className="site-btn-success w-full"
            >
              {submitting ? 'Completing...' : 'Complete craft & mark ready for pickup'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
