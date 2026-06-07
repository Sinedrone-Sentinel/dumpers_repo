import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { getResourceLabel } from '../lib/blueprintResources'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import {
  fetchCustomOrders,
  fetchFulfillments,
  fetchInventory,
  fulfillCustomOrder,
  type CustomOrder,
  type OrderFulfillment,
  type ResourceInventoryRow,
} from '../lib/operations'

export default function FulfillmentRoute() {
  const { labelMap } = useResourceCatalog({ syncOnLoad: true })
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [inventory, setInventory] = useState<ResourceInventoryRow[]>([])
  const [fulfillments, setFulfillments] = useState<OrderFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [ordersResult, inventoryResult, fulfillmentsResult] = await Promise.all([
      fetchCustomOrders(),
      fetchInventory(),
      fetchFulfillments(),
    ])

    if (ordersResult.error) setError(ordersResult.error)
    if (inventoryResult.error && !ordersResult.error) setError(inventoryResult.error)
    if (fulfillmentsResult.error && !ordersResult.error) setError(fulfillmentsResult.error)

    setOrders(ordersResult.data)
    setInventory(inventoryResult.data)
    setFulfillments(fulfillmentsResult.data)
    setLoading(false)
  }, [])

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

  const fulfillableOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending' || o.status === 'in_progress'),
    [orders]
  )

  const selectedOrder = fulfillableOrders.find((o) => o.id === selectedOrderId) ?? null

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
  }, [selectedOrder, quantityByKey])

  const handleFulfill = async () => {
    if (!selectedOrder) return

    setSubmitting(true)
    setError(null)

    const result = await fulfillCustomOrder(selectedOrder.id, notes.trim() || undefined)

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
      subtitle="Complete custom orders and deduct resources from org inventory"
      badge="Super-admin preview"
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

      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-white font-medium mb-3">Ready to fulfill</h2>
            {fulfillableOrders.length === 0 ? (
              <div className="p-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                No open orders. Create one in{' '}
                <Link to="/orders" className="text-red-400 hover:text-red-300">
                  Custom Orders
                </Link>
                .
              </div>
            ) : (
              <div className="space-y-2">
                {fulfillableOrders.map((order) => {
                  const isSelected = selectedOrderId === order.id
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
                          {shortages.length > 0 ? 'Short stock' : 'Ready'}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1">
                        {order.status.replace('_', ' ')} · {(order.items ?? []).length} line items
                      </p>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedOrder && (
              <div className="mt-4 p-4 bg-slate-900/60 border border-slate-700 rounded-xl space-y-3">
                <h3 className="text-white font-medium">{selectedOrder.title}</h3>
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
                          {item.quantity} needed · {available} in stock
                        </span>
                      </div>
                    )
                  })}
                </div>

                {!stockCheck.canFulfill && (
                  <p className="text-red-300 text-xs">
                    Short: {stockCheck.shortages.join(', ')}. Add stock in{' '}
                    <Link to="/resources" className="text-red-200 underline">
                      Resource Tracker
                    </Link>
                    .
                  </p>
                )}

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Fulfillment notes (optional)"
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                />

                <button
                  onClick={() => void handleFulfill()}
                  disabled={!stockCheck.canFulfill || submitting}
                  className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                >
                  {submitting ? 'Fulfilling...' : 'Fulfill order & deduct inventory'}
                </button>
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
