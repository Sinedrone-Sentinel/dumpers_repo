import React from 'react'
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

interface AssignedOrderCardProps {
  order: CustomOrder
  blueprintById: Map<string, BlueprintWithSlots>
  dfpDisplayEnabled: boolean
  craftDeductInventory: boolean
  reputations: Record<string, MemberReputationRow>
  labelMap: Record<string, string>
  quantityByKey: Record<string, number>
  orderItems: { resourceKey: string; quantity: number }[]
  stockCheck: { canFulfill: boolean; shortages: string[] }
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
  craftDeductInventory,
  reputations,
  labelMap,
  quantityByKey,
  orderItems,
  stockCheck,
  notes,
  onNotesChange,
  submitting,
  onAbandon,
  onStartWork,
  onCompleteCraft,
}: AssignedOrderCardProps) {
  const totalDfp = orderTotalDfp(order)
  const shortages = craftDeductInventory
    ? orderItems.filter((item) => {
        const available = quantityByKey[item.resourceKey] ?? 0
        return available < item.quantity
      })
    : []

  return (
    <div className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-white font-medium flex items-center gap-2 flex-wrap">
          {order.title}
          <ListingTypeBadge order={order} />
        </span>
        {craftDeductInventory && (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              shortages.length > 0
                ? 'bg-red-950/50 text-red-300 border-red-500/30'
                : 'bg-green-950/50 text-green-300 border-green-500/30'
            }`}
          >
            {shortages.length > 0 ? 'Short stock' : 'Stock OK'}
          </span>
        )}
      </div>

      <p className="text-slate-500 text-xs">
        {order.status.replace(/_/g, ' ')}
        {dfpDisplayEnabled && totalDfp > 0 && (
          <span className="text-amber-300/90"> · {formatDfpAuec(totalDfp)}</span>
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
      />

      <OrderDeadlineNotice order={order} role="fulfiller" />
      <OrderNextStepCallout order={order} context="wtb_fulfiller" />

      {(order.status === 'accepted' || order.status === 'in_progress') && orderItems.length > 0 && (
        <details open className="group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300 select-none">
            Craft checklist
          </summary>
          <div className="mt-2 space-y-2">
            {craftDeductInventory && (
              <p className="text-slate-500 text-xs">
                Inventory deduction is on — stock is checked from My Resources.
              </p>
            )}
            {orderItems.map((item) => {
              const available = quantityByKey[item.resourceKey] ?? 0
              const enough = available >= item.quantity

              return (
                <div
                  key={item.resourceKey}
                  className="flex items-center justify-between text-sm bg-slate-800/50 rounded-lg px-3 py-2"
                >
                  <span className="text-slate-300">
                    {getResourceLabel(item.resourceKey, labelMap)}
                  </span>
                  <span
                    className={`tabular-nums ${
                      craftDeductInventory
                        ? enough
                          ? 'text-green-400'
                          : 'text-red-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {formatQuantityForResource(item.resourceKey, item.quantity)}{' '}
                    {resourceQuantityUnitLabel(item.resourceKey)}
                    {craftDeductInventory && (
                      <>
                        {' '}
                        needed · {formatQuantityForResource(item.resourceKey, available)}{' '}
                        {resourceQuantityUnitLabel(item.resourceKey)} in My Resources
                      </>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {craftDeductInventory && !stockCheck.canFulfill && (
        <p className="text-red-300 text-xs">
          Short: {stockCheck.shortages.join(', ')}. Add stock in{' '}
          <Link to="/resources" className="text-red-200 underline">
            Resource Tracker → My Resources
          </Link>
          .
        </p>
      )}

      <div className="pt-3 border-t border-slate-700 space-y-2">
        <button
          type="button"
          onClick={onAbandon}
          disabled={submitting}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium"
        >
          {submitting ? 'Releasing...' : 'Abandon job — return to pool'}
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
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
            />

            <button
              type="button"
              onClick={onCompleteCraft}
              disabled={(craftDeductInventory && !stockCheck.canFulfill) || submitting}
              className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
            >
              {submitting ? 'Completing...' : 'Complete craft & mark ready for pickup'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
