import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitNotice from '../components/AuecTransferLimitNotice'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel } from '../lib/blueprintResources'
import { formatDfpAuec, formatDfpRequiredPrice } from '../lib/dfp'
import { orderTotalDfp, resolveOrderBlueprintLines } from '../lib/orderPricing'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { useAuth } from '../contexts/AuthContext'
import {
  completeOrderCraft,
  fetchCustomOrders,
  fetchFulfillments,
  fetchInventory,
  startCustomOrderWork,
  type CustomOrder,
  type OrderFulfillment,
  type ResourceInventoryRow,
} from '../lib/operations'

export default function FulfillmentRoute() {
  const { user, siteOrg } = useAuth()
  const { labelMap } = useResourceCatalog()
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [inventory, setInventory] = useState<ResourceInventoryRow[]>([])
  const [fulfillments, setFulfillments] = useState<OrderFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const userId = user?.id
  const orgId = siteOrg?.id ?? null

  const loadData = useCallback(async () => {
    if (!userId || !orgId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [ordersResult, inventoryResult, fulfillmentsResult] = await Promise.all([
      fetchCustomOrders(),
      fetchInventory({ scope: 'personal', userId, orgId }),
      fetchFulfillments(),
    ])

    if (ordersResult.error) setError(ordersResult.error)
    if (inventoryResult.error && !ordersResult.error) setError(inventoryResult.error)
    if (fulfillmentsResult.error && !ordersResult.error) setError(fulfillmentsResult.error)

    setOrders(ordersResult.data)
    setInventory(inventoryResult.data)
    setFulfillments(fulfillmentsResult.data)
    setLoading(false)
  }, [userId, orgId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const quantityByKey = useMemo(() => {
    const map: Record<string, number> = {}
    inventory.forEach((row) => {
      map[row.resource_key] = Number(row.quantity)
    })
    return map
  }, [inventory])

  const myAssignedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.assignee_id === userId &&
          ['accepted', 'in_progress'].includes(o.status)
      ),
    [orders, userId]
  )

  const selectedOrder = myAssignedOrders.find((o) => o.id === selectedOrderId) ?? null

  const stockCheck = useMemo(() => {
    if (!selectedOrder?.items) return { canFulfill: false, shortages: [] as string[] }

    const shortages: string[] = []
    for (const item of selectedOrder.items) {
      const available = quantityByKey[item.resource_key] ?? 0
      if (available < Number(item.quantity)) {
        shortages.push(
          `${getResourceLabel(item.resource_key, labelMap)} (need ${item.quantity}, have ${available})`
        )
      }
    }

    return { canFulfill: shortages.length === 0, shortages }
  }, [selectedOrder, quantityByKey, labelMap])

  const handleStartWork = async (orderId: string) => {
    setSubmitting(true)
    setError(null)

    const result = await startCustomOrderWork(orderId)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    await loadData()
  }

  const handleCompleteCraft = async () => {
    if (!selectedOrder) return

    setSubmitting(true)
    setError(null)

    const result = await completeOrderCraft(selectedOrder.id, notes.trim() || undefined)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelectedOrderId(null)
    setNotes('')
    await loadData()
  }

  return (
    <FeaturePageLayout
      title="Fulfillment"
      subtitle="Craft assigned orders at the customer's required DFP price — resources deduct from personal stock"
      badge="Preview"
      actions={
        <Link
          to="/orders"
          className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg transition-colors"
        >
          View orders
        </Link>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      <p className="mb-4 text-slate-500 text-sm">
        Accept orders on Custom Orders only if you own the blueprint and have enough resources in{' '}
        <Link to="/resources" className="text-red-400 hover:text-red-300">
          My Resources
        </Link>
        . The DFP total is the required aUEC price you must honor. Completing craft deducts
        personal inventory and notifies the requester.
      </p>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-white font-medium mb-3">My assigned orders</h2>
            {myAssignedOrders.length === 0 ? (
              <div className="p-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                No orders assigned to you. Accept a pending order on{' '}
                <Link to="/orders" className="text-red-400 hover:text-red-300">
                  Custom Orders
                </Link>
                .
              </div>
            ) : (
              <div className="space-y-2">
                {myAssignedOrders.map((order) => {
                  const isSelected = selectedOrderId === order.id
                  const totalDfp = orderTotalDfp(order)
                  const shortages = (order.items ?? []).filter((item) => {
                    const available = quantityByKey[item.resource_key] ?? 0
                    return available < Number(item.quantity)
                  })

                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-purple-950/30 border-purple-500/40'
                          : 'bg-slate-900/60 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white font-medium">{order.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            shortages.length > 0
                              ? 'bg-red-950/50 text-red-300 border-red-500/30'
                              : 'bg-green-950/50 text-green-300 border-green-500/30'
                          }`}
                        >
                          {shortages.length > 0 ? 'Short stock' : 'Stock OK'}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1">
                        {order.status.replace(/_/g, ' ')} · {(order.items ?? []).length} resources
                        {totalDfp > 0 && (
                          <span className="text-amber-300/90">
                            {' '}
                            · {formatDfpAuec(totalDfp)}
                          </span>
                        )}
                      </p>
                      {exceedsSingleTransferLimit(totalDfp) && (
                        <AuecTransferLimitNotice
                          totalAuec={totalDfp}
                          context="fulfiller"
                          compact
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {selectedOrder && (
              <div className="mt-4 p-4 bg-slate-900/60 border border-slate-700 rounded-xl space-y-3">
                <div>
                  <h3 className="text-white font-medium">{selectedOrder.title}</h3>
                  {orderTotalDfp(selectedOrder) > 0 && (
                    <p className="text-amber-200 text-sm font-medium mt-1">
                      Required price: {formatDfpRequiredPrice(orderTotalDfp(selectedOrder))}
                    </p>
                  )}
                </div>

                {exceedsSingleTransferLimit(orderTotalDfp(selectedOrder)) && (
                  <AuecTransferLimitNotice
                    totalAuec={orderTotalDfp(selectedOrder)}
                    context="fulfiller"
                  />
                )}

                {resolveOrderBlueprintLines(selectedOrder).length > 0 && (
                  <ul className="text-xs text-slate-400 space-y-1">
                    {resolveOrderBlueprintLines(selectedOrder).map((line) => (
                      <li key={`${selectedOrder.id}-${line.blueprintId}-${line.quantity}`}>
                        {line.blueprintTitle} × {line.quantity} (Q{line.minQuality})
                        {line.lineDfpAuec > 0 && ` · ${formatDfpAuec(line.lineDfpAuec)}`}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-2">
                  {(selectedOrder.items ?? []).map((item) => {
                    const available = quantityByKey[item.resource_key] ?? 0
                    const enough = available >= Number(item.quantity)

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-sm bg-slate-800/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-slate-300">
                          {getResourceLabel(item.resource_key, labelMap)}
                        </span>
                        <span className={enough ? 'text-green-400' : 'text-red-400'}>
                          {item.quantity} needed · {available} in My Resources
                        </span>
                      </div>
                    )
                  })}
                </div>

                {!stockCheck.canFulfill && (
                  <p className="text-red-300 text-xs">
                    Short: {stockCheck.shortages.join(', ')}. Add stock in{' '}
                    <Link to="/resources" className="text-red-200 underline">
                      Resource Tracker → My Resources
                    </Link>
                    .
                  </p>
                )}

                {selectedOrder.status === 'accepted' && (
                  <button
                    type="button"
                    onClick={() => void handleStartWork(selectedOrder.id)}
                    disabled={submitting}
                    className="w-full py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                  >
                    {submitting ? 'Starting...' : 'Start work'}
                  </button>
                )}

                {(selectedOrder.status === 'accepted' || selectedOrder.status === 'in_progress') && (
                  <>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Craft notes (optional)"
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                    />

                    <button
                      onClick={() => void handleCompleteCraft()}
                      disabled={!stockCheck.canFulfill || submitting}
                      className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                    >
                      {submitting ? 'Completing...' : 'Complete craft & mark ready for pickup'}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-white font-medium mb-3">Fulfillment history</h2>
            {fulfillments.length === 0 ? (
              <div className="p-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                No fulfillments yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {fulfillments.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl"
                  >
                    <p className="text-white text-sm font-medium">
                      {entry.order?.title ?? 'Order'}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {new Date(entry.created_at).toLocaleString()}
                      {entry.order?.status && ` · ${entry.order.status.replace(/_/g, ' ')}`}
                      {entry.order?.total_dfp_auec != null &&
                        Number(entry.order.total_dfp_auec) > 0 &&
                        ` · ${formatDfpAuec(Number(entry.order.total_dfp_auec))}`}
                    </p>
                    {entry.notes && (
                      <p className="text-slate-400 text-sm mt-2">{entry.notes}</p>
                    )}
                    {entry.items && entry.items.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.items.map((item, idx) => (
                          <span
                            key={`${entry.id}-${idx}`}
                            className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded border border-slate-600"
                          >
                            {getResourceLabel(item.resource_key, labelMap)} −{item.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </FeaturePageLayout>
  )
}
