import React from 'react'
import ListingTypeBadge from './ListingTypeBadge'
import OrderDeadlineNotice from './OrderDeadlineNotice'
import OrderNextStepCallout from './OrderNextStepCallout'
import OrderRequestLines from './OrderRequestLines'
import TradeContactChip from './TradeContactChip'
import { formatDfpAuec } from '../lib/dfp'
import { releaseOrderButtonLabel } from '../lib/orderRelease'
import { orderTotalDfp } from '../lib/orderPricing'
import type { CustomOrder } from '../lib/operations'
import type { BlueprintWithSlots } from '../lib/blueprintResources'

const STATUS_STYLES: Record<string, string> = {
  accepted: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30',
  in_progress: 'bg-blue-950/50 text-blue-300 border-blue-500/30',
  ready_for_pickup: 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30',
}

interface WtsSaleOrderCardProps {
  order: CustomOrder
  userId: string
  blueprintById: Map<string, BlueprintWithSlots>
  dfpDisplayEnabled: boolean
  submitting: boolean
  onAbandon: () => void
  onStartWork: () => void
  onMarkReady: () => void
}

export default function WtsSaleOrderCard({
  order,
  userId,
  blueprintById,
  dfpDisplayEnabled,
  submitting,
  onAbandon,
  onStartWork,
  onMarkReady,
}: WtsSaleOrderCardProps) {
  const totalDfp = orderTotalDfp(order)
  const canAct = order.status === 'accepted' || order.status === 'in_progress'

  return (
    <div className="p-4 site-surface space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-white font-medium">{order.title}</span>
        <ListingTypeBadge order={order} />
        {order.source_listing_id && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-cyan-950/40 text-cyan-200 border-cyan-500/30">
            Partial purchase
          </span>
        )}
        <span
          className={`px-2 py-0.5 rounded text-xs border ${
            STATUS_STYLES[order.status] ?? 'site-badge-slate'
          }`}
        >
          {order.status.replace(/_/g, ' ')}
        </span>
        {dfpDisplayEnabled && totalDfp > 0 && (
          <span className="text-amber-300/90 text-xs">{formatDfpAuec(totalDfp)}</span>
        )}
      </div>

      {order.assignee && <TradeContactChip role="buyer" profile={order.assignee} />}

      <OrderRequestLines
        order={order}
        showDfp={dfpDisplayEnabled}
        blueprintById={blueprintById}
        showEffectiveStats
      />

      <OrderDeadlineNotice order={order} role="seller" />
      <OrderNextStepCallout order={order} context="wts_seller" />

      {canAct && (
        <div className="pt-3 site-divider space-y-2">
          {order.status === 'accepted' && (
            <button
              type="button"
              onClick={onStartWork}
              disabled={submitting}
              className="w-full py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {submitting ? 'Starting...' : 'Start handoff'}
            </button>
          )}
          <button
            type="button"
            onClick={onMarkReady}
            disabled={submitting}
            className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {submitting ? 'Working...' : 'Mark ready for pickup'}
          </button>
          <button
            type="button"
            onClick={onAbandon}
            disabled={submitting}
            className="site-btn-secondary w-full py-2 text-sm"
          >
            {submitting ? 'Working...' : releaseOrderButtonLabel(order, userId)}
          </button>
        </div>
      )}
    </div>
  )
}
