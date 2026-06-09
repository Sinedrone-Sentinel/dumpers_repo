import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitNotice from '../components/AuecTransferLimitNotice'
import OrderRatingModal from '../components/OrderRatingModal'
import OrderRequestLines from '../components/OrderRequestLines'
import ReputationBadge from '../components/ReputationBadge'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { REPUTATION_STAR_OPTIONS } from '../config/reputation'
import { SITE_SLOGAN } from '../config/site'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import { formatDfpAuec, formatDfpRequiredPrice } from '../lib/dfp'
import { buildStockTotalsByResource } from '../lib/inventoryStock'
import {
  fulfillerHasAllOrderBlueprints,
  getOrderAcceptBlockers,
} from '../lib/orderAccept'
import { canFulfillerArchive } from '../lib/orderArchive'
import { fulfillmentItemsMatch } from '../lib/orderFulfillment'
import { orderTotalDfp, resolveOrderFulfillmentItems } from '../lib/orderPricing'
import { formatResourceQuantity } from '../lib/resourceQuantity'
import { useBlueprintData } from './blueprints'
import {
  buyerReputationFromRow,
  fulfillerMeetsOrderMinRep,
  fulfillerReputationFromRow,
  passesBuyerRepFilter,
  type MemberReputationRow,
} from '../lib/reputation'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { useAuth } from '../contexts/AuthContext'
import {
  acceptCustomOrder,
  abandonCustomOrderFulfillment,
  archiveCustomOrderWithRating,
  completeOrderCraft,
  replaceCustomOrderFulfillmentItems,
  fetchCustomOrders,
  fetchFulfillments,
  fetchInventory,
  fetchMemberReputations,
  startCustomOrderWork,
  type CustomOrder,
  type OrderFulfillment,
  type ResourceInventoryRow,
} from '../lib/operations'
import { displayNameFromFields } from '../lib/supabase'

export default function FulfillmentRoute() {
  const { user, profile, acquiredBlueprints, dfpDisplayEnabled } = useAuth()
  const craftDeductInventory = profile?.craft_deduct_inventory ?? false
  const { data: blueprints = [] } = useBlueprintData()
  const { labelMap } = useResourceCatalog()
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [inventory, setInventory] = useState<ResourceInventoryRow[]>([])
  const [fulfillments, setFulfillments] = useState<OrderFulfillment[]>([])
  const [reputations, setReputations] = useState<Record<string, MemberReputationRow>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null)
  const [minBuyerRepFilter, setMinBuyerRepFilter] = useState('')
  const [onlyMyBlueprintOrders, setOnlyMyBlueprintOrders] = useState(false)
  const [archiveOrder, setArchiveOrder] = useState<CustomOrder | null>(null)
  const [archiving, setArchiving] = useState(false)

  const userId = user?.id

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [ordersResult, inventoryResult, fulfillmentsResult] = await Promise.all([
      fetchCustomOrders(),
      fetchInventory({ scope: 'personal', userId }),
      fetchFulfillments(),
    ])

    if (ordersResult.error) setError(ordersResult.error)
    if (inventoryResult.error && !ordersResult.error) setError(inventoryResult.error)
    if (fulfillmentsResult.error && !ordersResult.error) setError(fulfillmentsResult.error)

    const nextOrders = ordersResult.data
    setOrders(nextOrders)
    setInventory(inventoryResult.data)
    setFulfillments(fulfillmentsResult.data)

    const repIds = new Set<string>()
    if (userId) repIds.add(userId)
    nextOrders.forEach((order) => {
      repIds.add(order.requester_id)
      if (order.assignee_id) repIds.add(order.assignee_id)
    })

    const repResult = await fetchMemberReputations([...repIds])
    if (repResult.error && !ordersResult.error) setError(repResult.error)
    setReputations(repResult.data)

    setLoading(false)
  }, [userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const quantityByKey = useMemo(() => buildStockTotalsByResource(inventory), [inventory])

  const blueprintById = useMemo(() => {
    const map = new Map<string, BlueprintWithSlots>()
    blueprints.forEach((bp) => {
      if (bp.file) map.set(bp.file, bp)
    })
    return map
  }, [blueprints])

  const fulfillmentItemsForOrder = useCallback(
    (order: CustomOrder) => resolveOrderFulfillmentItems(order, blueprintById),
    [blueprintById]
  )

  const syncFulfillmentItems = useCallback(
    async (order: CustomOrder) => {
      const computed = fulfillmentItemsForOrder(order)
      if (fulfillmentItemsMatch(order.items, computed)) return {}
      return replaceCustomOrderFulfillmentItems(order.id, computed)
    },
    [fulfillmentItemsForOrder]
  )

  const myFulfillerRep = useMemo(
    () => fulfillerReputationFromRow(userId ? reputations[userId] : undefined),
    [reputations, userId]
  )

  const pendingOrders = useMemo(() => {
    const minFilter = minBuyerRepFilter ? Number(minBuyerRepFilter) : null

    return orders.filter((order) => {
      if (order.status !== 'pending' || order.requester_id === userId) return false

      const buyerRep = buyerReputationFromRow(reputations[order.requester_id])
      if (!passesBuyerRepFilter(buyerRep, minFilter)) return false

      return true
    })
  }, [orders, userId, minBuyerRepFilter, reputations])

  const visiblePendingOrders = useMemo(() => {
    if (!onlyMyBlueprintOrders) return pendingOrders
    return pendingOrders.filter((order) =>
      fulfillerHasAllOrderBlueprints(order, acquiredBlueprints)
    )
  }, [pendingOrders, onlyMyBlueprintOrders, acquiredBlueprints])

  const myBuyingOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.requester_id === userId &&
          o.assignee_id != null &&
          ['accepted', 'in_progress', 'ready_for_pickup', 'completed'].includes(o.status)
      ),
    [orders, userId]
  )

  const myAssignedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.assignee_id === userId &&
          ['accepted', 'in_progress'].includes(o.status)
      ),
    [orders, userId]
  )

  const myFinishedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.assignee_id === userId &&
          (o.status === 'ready_for_pickup' || o.status === 'completed') &&
          !o.fulfiller_archived_at
      ),
    [orders, userId]
  )

  const handleArchiveConfirm = async (stars: number, comment?: string) => {
    if (!archiveOrder) return

    setArchiving(true)
    const result = await archiveCustomOrderWithRating(archiveOrder.id, stars, comment)
    setArchiving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setArchiveOrder(null)
    await loadData()
  }

  const selectedOrder = myAssignedOrders.find((o) => o.id === selectedOrderId) ?? null

  const selectedFulfillmentItems = useMemo(
    () => (selectedOrder ? fulfillmentItemsForOrder(selectedOrder) : []),
    [selectedOrder, fulfillmentItemsForOrder]
  )

  const stockCheck = useMemo(() => {
    if (!selectedOrder || !craftDeductInventory) {
      return { canFulfill: true, shortages: [] as string[] }
    }

    const shortages: string[] = []
    for (const item of selectedFulfillmentItems) {
      const available = quantityByKey[item.resourceKey] ?? 0
      if (available < item.quantity) {
        shortages.push(
          `${getResourceLabel(item.resourceKey, labelMap)} (need ${formatResourceQuantity(item.quantity)} SCU, have ${formatResourceQuantity(available)} SCU)`
        )
      }
    }

    return { canFulfill: shortages.length === 0, shortages }
  }, [selectedOrder, selectedFulfillmentItems, quantityByKey, labelMap, craftDeductInventory])

  const handleAccept = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return

    setAcceptingOrderId(orderId)
    setError(null)

    const syncResult = await syncFulfillmentItems(order)
    if (syncResult.error) {
      setAcceptingOrderId(null)
      setError(syncResult.error)
      return
    }

    const result = await acceptCustomOrder(orderId)

    setAcceptingOrderId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    await loadData()
  }

  const handleAbandon = async (orderId: string) => {
    if (
      !window.confirm(
        'Release this order back to the fulfillment pool? Another member can accept it.'
      )
    ) {
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await abandonCustomOrderFulfillment(orderId)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (selectedOrderId === orderId) setSelectedOrderId(null)
    await loadData()
  }

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

    const syncResult = await syncFulfillmentItems(selectedOrder)
    if (syncResult.error) {
      setSubmitting(false)
      setError(syncResult.error)
      return
    }

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
      subtitle={SITE_SLOGAN}
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
        Browse pending orders here with buyer reputation before accepting. You need every required
        blueprint to accept. Enable{' '}
        <span className="text-slate-300">Deduct inventory on craft complete</span> in Settings if
        you want My Resources checked and deducted when you finish a craft. Ratings show as{' '}
        <span className="text-slate-400 italic">Pending</span> until a member has 5 completed
        orders or fulfillments.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ReputationBadge label="Your fulfiller rep" reputation={myFulfillerRep} />
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="space-y-6">
            <div>
              <div className="flex flex-col gap-3 mb-3">
                <h2 className="text-white font-medium">Available orders</h2>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyMyBlueprintOrders}
                      onChange={(e) => setOnlyMyBlueprintOrders(e.target.checked)}
                      className="rounded border-slate-500 bg-slate-800 text-purple-500 focus:ring-purple-500/40"
                    />
                    <span>Only orders with my blueprints</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="shrink-0">Min buyer rep</span>
                    <select
                      value={minBuyerRepFilter}
                      onChange={(e) => setMinBuyerRepFilter(e.target.value)}
                      className="px-2 py-1 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                    >
                      <option value="">All buyers</option>
                      {REPUTATION_STAR_OPTIONS.map((tier) => (
                        <option key={tier} value={tier}>
                          {tier}+
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <p className="text-slate-500 text-xs mb-3">
                Buyers without 5 completed orders always appear — they cannot be filtered out.
              </p>
              {visiblePendingOrders.length === 0 ? (
                <div className="p-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                  No pending orders match your filters.
                </div>
              ) : (
                <div className="space-y-2">
                  {visiblePendingOrders.map((order) => {
                    const totalDfp = orderTotalDfp(order)
                    const buyerRep = buyerReputationFromRow(reputations[order.requester_id])
                    const acceptBlockers = getOrderAcceptBlockers({
                      order,
                      acquiredBlueprints,
                    })
                    const meetsMinRep = fulfillerMeetsOrderMinRep(
                      myFulfillerRep,
                      order.min_fulfiller_reputation
                    )
                    const canAccept = acceptBlockers.length === 0 && meetsMinRep
                    const accepting = acceptingOrderId === order.id

                    return (
                      <div
                        key={order.id}
                        className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-2">
                            <p className="text-white font-medium">{order.title}</p>
                            <p className="text-slate-500 text-xs">
                              Buyer: {displayNameFromFields(order.requester)}
                              {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <ReputationBadge label="Buyer rep" reputation={buyerRep} />
                              {order.min_fulfiller_reputation != null && (
                                <span className="px-2 py-0.5 rounded text-xs border bg-slate-800 text-slate-300 border-slate-600">
                                  Requires fulfiller {order.min_fulfiller_reputation}+
                                </span>
                              )}
                            </div>
                            <div className="mt-1">
                              <OrderRequestLines order={order} />
                            </div>
                            {!meetsMinRep && (
                              <p className="text-amber-400/90 text-xs">
                                Your fulfiller reputation is below this order&apos;s minimum.
                              </p>
                            )}
                            {acceptBlockers.length > 0 && (
                              <ul className="text-amber-400/80 text-xs space-y-0.5 max-w-full break-words">
                                {acceptBlockers.map((blocker) => (
                                  <li key={blocker}>{blocker}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleAccept(order.id)}
                            disabled={!canAccept || accepting}
                            className="px-3 py-1.5 text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 rounded disabled:opacity-40 shrink-0"
                          >
                            {accepting ? 'Accepting...' : 'Accept order'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
            <h2 className="text-white font-medium mb-3">My assigned orders</h2>
            {myAssignedOrders.length === 0 ? (
              <div className="p-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                No orders assigned to you. Accept a pending order from Available orders above.
              </div>
            ) : (
              <div className="space-y-2">
                {myAssignedOrders.map((order) => {
                  const isSelected = selectedOrderId === order.id
                  const totalDfp = orderTotalDfp(order)
                  const orderItems = fulfillmentItemsForOrder(order)
                  const shortages = craftDeductInventory
                    ? orderItems.filter((item) => {
                        const available = quantityByKey[item.resourceKey] ?? 0
                        return available < item.quantity
                      })
                    : []

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
                      <p className="text-slate-500 text-xs mt-1">
                        {order.status.replace(/_/g, ' ')}
                        {dfpDisplayEnabled && totalDfp > 0 && (
                          <span className="text-amber-300/90">
                            {' '}
                            · {formatDfpAuec(totalDfp)}
                          </span>
                        )}
                      </p>
                      <div className="mt-2">
                        <OrderRequestLines order={order} showDfp={dfpDisplayEnabled} />
                      </div>
                      <div className="mt-2">
                        <ReputationBadge
                          label="Buyer rep"
                          reputation={buyerReputationFromRow(reputations[order.requester_id])}
                        />
                      </div>
                      {dfpDisplayEnabled && exceedsSingleTransferLimit(totalDfp) && (
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
                  {dfpDisplayEnabled && orderTotalDfp(selectedOrder) > 0 && (
                    <p className="text-amber-200 text-sm font-medium mt-1">
                      Required price: {formatDfpRequiredPrice(orderTotalDfp(selectedOrder))}
                    </p>
                  )}
                </div>

                {dfpDisplayEnabled && exceedsSingleTransferLimit(orderTotalDfp(selectedOrder)) && (
                  <AuecTransferLimitNotice
                    totalAuec={orderTotalDfp(selectedOrder)}
                    context="fulfiller"
                    compact
                  />
                )}

                <OrderRequestLines order={selectedOrder} showDfp={dfpDisplayEnabled} />

                {selectedFulfillmentItems.length > 0 && (
                  <div className="space-y-2">
                    {craftDeductInventory && (
                      <p className="text-slate-500 text-xs">
                        Inventory deduction is on — stock is checked from My Resources.
                      </p>
                    )}
                    {selectedFulfillmentItems.map((item) => {
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
                            {formatResourceQuantity(item.quantity)} SCU
                            {craftDeductInventory && (
                              <>
                                {' '}
                                needed · {formatResourceQuantity(available)} SCU in My Resources
                              </>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
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

                <button
                  type="button"
                  onClick={() => void handleAbandon(selectedOrder.id)}
                  disabled={submitting}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium"
                >
                  {submitting ? 'Releasing...' : 'Abandon job — return to pool'}
                </button>

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
                      disabled={(craftDeductInventory && !stockCheck.canFulfill) || submitting}
                      className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                    >
                      {submitting ? 'Completing...' : 'Complete craft & mark ready for pickup'}
                    </button>
                  </>
                )}
              </div>
            )}
            </div>
          </section>

          <section className="space-y-6">
            {myBuyingOrders.length > 0 && (
              <div>
                <h2 className="text-white font-medium mb-3">Orders you&apos;re buying</h2>
                <p className="text-slate-500 text-xs mb-3">
                  Fulfiller reputation appears after they accept your order.
                </p>
                <div className="space-y-2">
                  {myBuyingOrders.map((order) => {
                    const totalDfp = orderTotalDfp(order)
                    const fulfillerRep = fulfillerReputationFromRow(
                      order.assignee_id ? reputations[order.assignee_id] : undefined
                    )

                    return (
                      <div
                        key={order.id}
                        className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl"
                      >
                        <p className="text-white text-sm font-medium">{order.title}</p>
                        <p className="text-slate-500 text-xs mt-1">
                          {order.status.replace(/_/g, ' ')}
                          {order.assignee &&
                            ` · Fulfiller: ${displayNameFromFields(order.assignee)}`}
                          {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                        </p>
                        {order.assignee_id && (
                          <div className="mt-2">
                            <ReputationBadge label="Fulfiller rep" reputation={fulfillerRep} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
            <h2 className="text-white font-medium mb-3">Finished orders</h2>
            {myFinishedOrders.length === 0 ? (
              <div className="p-6 mb-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                No orders waiting on pickup or archive yet.
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {myFinishedOrders.map((order) => {
                  const totalDfp = orderTotalDfp(order)
                  const canArchive = canFulfillerArchive(order, userId)

                  return (
                    <div
                      key={order.id}
                      className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-white text-sm font-medium">{order.title}</p>
                          <p className="text-slate-500 text-xs mt-1">
                            {order.status.replace(/_/g, ' ')}
                            {order.requester &&
                              ` · Customer: ${displayNameFromFields(order.requester)}`}
                            {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                          </p>
                          <div className="mt-2">
                            <ReputationBadge
                              label="Buyer rep"
                              reputation={buyerReputationFromRow(reputations[order.requester_id])}
                            />
                          </div>
                          {order.status === 'ready_for_pickup' && (
                            <p className="text-cyan-300/80 text-xs mt-2">
                              Waiting for customer pickup confirmation.
                            </p>
                          )}
                          {order.status === 'completed' && (
                            <p className="text-green-300/80 text-xs mt-2">
                              Pickup confirmed — archive and rate the customer when you are done.
                            </p>
                          )}
                          <div className="mt-2">
                            <OrderRequestLines order={order} showDfp={dfpDisplayEnabled} />
                          </div>
                        </div>
                        {canArchive && (
                          <button
                            type="button"
                            onClick={() => setArchiveOrder(order)}
                            className="px-2 py-1 text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded shrink-0"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            </div>

            <div>
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
                      {dfpDisplayEnabled &&
                        entry.order?.total_dfp_auec != null &&
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
                            {getResourceLabel(item.resource_key, labelMap)} −
                            {formatResourceQuantity(Number(item.quantity))} SCU
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </section>
        </div>
      )}

      {archiveOrder && (
        <OrderRatingModal
          target="customer"
          rateeName={displayNameFromFields(archiveOrder.requester)}
          orderTitle={archiveOrder.title}
          onConfirm={(stars, comment) => void handleArchiveConfirm(stars, comment)}
          onCancel={() => setArchiveOrder(null)}
          confirming={archiving}
        />
      )}
    </FeaturePageLayout>
  )
}
