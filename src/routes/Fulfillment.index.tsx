import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitNotice from '../components/AuecTransferLimitNotice'
import AvailableOrderCard from '../components/AvailableOrderCard'
import AssignedOrderCard from '../components/AssignedOrderCard'
import OrderArchiveCallout from '../components/OrderArchiveCallout'
import OrderRatingModal, { type OrderRatingTarget } from '../components/OrderRatingModal'
import OrderRequestLines from '../components/OrderRequestLines'
import ListingTypeBadge from '../components/ListingTypeBadge'
import TradeContactChip from '../components/TradeContactChip'
import WtsSaleOrderCard from '../components/WtsSaleOrderCard'
import { type WtsLineSelection } from '../components/WtsPartialPurchasePanel'
import ReputationBadge from '../components/ReputationBadge'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { REPUTATION_STAR_OPTIONS } from '../config/reputation'
import { SITE_SLOGAN } from '../config/site'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import { formatDfpAuec } from '../lib/dfp'
import { buildStockTotalsByResource } from '../lib/inventoryStock'
import {
  fulfillerHasAllOrderBlueprints,
  getOrderAcceptBlockers,
} from '../lib/orderAccept'
import {
  archiveRatingInfo,
  canUserArchiveOrder,
} from '../lib/orderArchive'
import { releaseOrderConfirmMessage } from '../lib/orderRelease'
import { fulfillmentItemsMatch } from '../lib/orderFulfillment'
import { orderTotalDfp, resolveOrderFulfillmentItems } from '../lib/orderPricing'
import { resourceQuantityUnitLabel } from '../config/resourceTypes'
import { formatQuantityForResource } from '../lib/resourceQuantity'
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
  acceptWtsPartialPurchase,
  abandonCustomOrderFulfillment,
  archiveCustomOrderWithRating,
  completeOrderCraft,
  replaceCustomOrderFulfillmentItems,
  fetchCustomOrders,
  fetchFulfillments,
  fetchInventory,
  fetchMemberReputations,
  fetchPendingCustomOrderCount,
  fetchUserOrderLimits,
  startCustomOrderWork,
  type CustomOrder,
  type OrderFulfillment,
  type ResourceInventoryRow,
  type UserOrderLimits,
} from '../lib/operations'
import { displayNameFromFields } from '../lib/supabase'
import {
  matchesListingTypeFilter,
  orderListingType,
  type ListingTypeFilter,
} from '../lib/listingType'

export default function FulfillmentRoute() {
  const { user, profile, acquiredBlueprints, dfpDisplayEnabled, isGuestPreview } = useAuth()
  const isGuest = !user && isGuestPreview
  const craftDeductInventory = profile?.craft_deduct_inventory ?? false
  const isRsiVerified = profile?.rsi_handle_verified ?? false
  const { data: blueprints = [] } = useBlueprintData()
  const { labelMap } = useResourceCatalog()
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [inventory, setInventory] = useState<ResourceInventoryRow[]>([])
  const [fulfillments, setFulfillments] = useState<OrderFulfillment[]>([])
  const [reputations, setReputations] = useState<Record<string, MemberReputationRow>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [craftNotesByOrderId, setCraftNotesByOrderId] = useState<Record<string, string>>({})
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null)
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null)
  const [minBuyerRepFilter, setMinBuyerRepFilter] = useState('')
  const [onlyMyBlueprintOrders, setOnlyMyBlueprintOrders] = useState(false)
  const [archiveRatingModal, setArchiveRatingModal] = useState<{
    orderId: string
    target: OrderRatingTarget
    rateeName: string
    orderTitle: string
  } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [orderLimits, setOrderLimits] = useState<UserOrderLimits | null>(null)
  const [guestPendingCount, setGuestPendingCount] = useState<number | null>(null)
  const [listingTypeFilter, setListingTypeFilter] = useState<ListingTypeFilter>('all')
  const [expandedPendingOrderId, setExpandedPendingOrderId] = useState<string | null>(null)

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

    const [repResult, limitsResult] = await Promise.all([
      fetchMemberReputations([...repIds]),
      fetchUserOrderLimits(userId),
    ])
    if (repResult.error && !ordersResult.error) setError(repResult.error)
    setReputations(repResult.data)
    setOrderLimits(limitsResult.data ?? null)

    setLoading(false)
  }, [userId])

  // Guest: load only the pending order count (anon-safe aggregate RPC)
  const loadGuestData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { count, error: countError } = await fetchPendingCustomOrderCount()
    if (countError) {
      setError(countError)
      setGuestPendingCount(null)
      setLoading(false)
      return
    }
    setGuestPendingCount(count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isGuest) {
      void loadGuestData()
    } else {
      void loadData()
    }
  }, [isGuest, loadData, loadGuestData])

  const quantityByKey = useMemo(() => buildStockTotalsByResource(inventory), [inventory])

  const blueprintById = useMemo(() => {
    const map = new Map<string, BlueprintWithSlots>()
    blueprints.forEach((bp) => {
      if (bp.internalName) map.set(bp.internalName, bp)
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
  const myBuyerRep = useMemo(
    () => buyerReputationFromRow(userId ? reputations[userId] : undefined),
    [reputations, userId]
  )

  const pendingOrders = useMemo(() => {
    const minFilter = minBuyerRepFilter ? Number(minBuyerRepFilter) : null

    return orders.filter((order) => {
      if (order.status !== 'pending' || order.requester_id === userId) return false
      if (!matchesListingTypeFilter(order, listingTypeFilter)) return false

      if (orderListingType(order) === 'wtb') {
        const buyerRep = buyerReputationFromRow(reputations[order.requester_id])
        if (!passesBuyerRepFilter(buyerRep, minFilter)) return false
      }

      return true
    })
  }, [orders, userId, minBuyerRepFilter, reputations, listingTypeFilter])

  const visiblePendingOrders = useMemo(() => {
    let list = pendingOrders
    if (onlyMyBlueprintOrders) {
      list = list.filter(
        (order) =>
          orderListingType(order) === 'wts' ||
          fulfillerHasAllOrderBlueprints(order, acquiredBlueprints)
      )
    }
    return list
  }, [pendingOrders, onlyMyBlueprintOrders, acquiredBlueprints])

  useEffect(() => {
    setExpandedPendingOrderId(null)
  }, [listingTypeFilter, minBuyerRepFilter, onlyMyBlueprintOrders])

  const handleTogglePendingOrder = useCallback((orderId: string) => {
    setExpandedPendingOrderId((current) => (current === orderId ? null : orderId))
  }, [])

  const myBuyingOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          matchesListingTypeFilter(o, listingTypeFilter) &&
          o.requester_id === userId &&
          o.listing_type !== 'wts' &&
          o.assignee_id != null &&
          ['accepted', 'in_progress', 'ready_for_pickup', 'completed'].includes(o.status)
      ),
    [orders, userId, listingTypeFilter]
  )

  const myAssignedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          matchesListingTypeFilter(o, listingTypeFilter) &&
          o.assignee_id === userId &&
          orderListingType(o) === 'wtb' &&
          ['accepted', 'in_progress'].includes(o.status)
      ),
    [orders, userId, listingTypeFilter]
  )

  const myWtsSales = useMemo(
    () =>
      orders.filter(
        (o) =>
          matchesListingTypeFilter(o, listingTypeFilter) &&
          o.requester_id === userId &&
          orderListingType(o) === 'wts' &&
          o.assignee_id != null &&
          ['accepted', 'in_progress', 'ready_for_pickup'].includes(o.status)
      ),
    [orders, userId, listingTypeFilter]
  )

  const myFinishedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          matchesListingTypeFilter(o, listingTypeFilter) &&
          o.assignee_id === userId &&
          orderListingType(o) === 'wtb' &&
          o.status === 'ready_for_pickup'
      ),
    [orders, userId, listingTypeFilter]
  )

  const myOrdersNeedingRating = useMemo(
    () =>
      orders.filter(
        (o) =>
          matchesListingTypeFilter(o, listingTypeFilter) &&
          o.status === 'completed' &&
          canUserArchiveOrder(o, userId)
      ),
    [orders, userId, listingTypeFilter]
  )

  const openArchiveForOrder = (order: CustomOrder) => {
    const info = archiveRatingInfo(order, userId)
    if (!info) return
    setArchiveRatingModal({
      orderId: order.id,
      target: info.target,
      rateeName: displayNameFromFields(info.rateeFields),
      orderTitle: order.title,
    })
  }

  const handleArchiveConfirm = async (stars: number, comment?: string) => {
    if (!archiveRatingModal) return

    setArchiving(true)
    const result = await archiveCustomOrderWithRating(archiveRatingModal.orderId, stars, comment)
    setArchiving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setArchiveRatingModal(null)
    await loadData()
  }

  const getStockCheckForOrder = useCallback(
    (order: CustomOrder) => {
      if (!craftDeductInventory) {
        return { canFulfill: true, shortages: [] as string[] }
      }

      const items = fulfillmentItemsForOrder(order)
      const shortages: string[] = []
      for (const item of items) {
        const available = quantityByKey[item.resourceKey] ?? 0
        if (available < item.quantity) {
          shortages.push(
            `${getResourceLabel(item.resourceKey, labelMap)} (need ${formatQuantityForResource(item.resourceKey, item.quantity)} ${resourceQuantityUnitLabel(item.resourceKey)}, have ${formatQuantityForResource(item.resourceKey, available)} ${resourceQuantityUnitLabel(item.resourceKey)})`
          )
        }
      }

      return { canFulfill: shortages.length === 0, shortages }
    },
    [craftDeductInventory, fulfillmentItemsForOrder, quantityByKey, labelMap]
  )

  const handleAcceptPartial = async (listingId: string, selections: WtsLineSelection[]) => {
    setAcceptingOrderId(listingId)
    setError(null)

    const result = await acceptWtsPartialPurchase(listingId, selections)

    if (result.error) {
      setAcceptingOrderId(null)
      setError(result.error)
      return
    }

    if (result.purchaseOrderId) {
      const { data: refreshed } = await fetchCustomOrders()
      const purchaseOrder = refreshed.find((o) => o.id === result.purchaseOrderId)
      if (purchaseOrder) {
        const syncResult = await syncFulfillmentItems(purchaseOrder)
        if (syncResult.error) {
          setAcceptingOrderId(null)
          setError(syncResult.error)
          return
        }
      }
    }

    setAcceptingOrderId(null)
    await loadData()
  }

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
    const order = orders.find((o) => o.id === orderId)
    if (
      !window.confirm(
        order
          ? releaseOrderConfirmMessage(order)
          : 'Release this order back to the fulfillment pool? Another member can accept it.'
      )
    ) {
      return
    }

    setSubmittingOrderId(orderId)
    setError(null)

    const result = await abandonCustomOrderFulfillment(orderId)

    setSubmittingOrderId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setCraftNotesByOrderId((prev) => {
      const next = { ...prev }
      delete next[orderId]
      return next
    })
    await loadData()
  }

  const handleMarkWtsReady = async (orderId: string) => {
    setSubmittingOrderId(orderId)
    setError(null)
    const note = craftNotesByOrderId[orderId]?.trim()
    const result = await completeOrderCraft(orderId, note || undefined)
    setSubmittingOrderId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setCraftNotesByOrderId((prev) => {
      const next = { ...prev }
      delete next[orderId]
      return next
    })
    await loadData()
  }

  const handleStartWork = async (orderId: string) => {
    setSubmittingOrderId(orderId)
    setError(null)

    const result = await startCustomOrderWork(orderId)

    setSubmittingOrderId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    await loadData()
  }

  const handleCompleteCraft = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return

    setSubmittingOrderId(orderId)
    setError(null)

    const syncResult = await syncFulfillmentItems(order)
    if (syncResult.error) {
      setSubmittingOrderId(null)
      setError(syncResult.error)
      return
    }

    const note = craftNotesByOrderId[orderId]?.trim()
    const result = await completeOrderCraft(orderId, note || undefined)

    setSubmittingOrderId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setCraftNotesByOrderId((prev) => {
      const next = { ...prev }
      delete next[orderId]
      return next
    })
    await loadData()
  }

  // Guest teaser view
  if (isGuest) {
    return (
      <FeaturePageLayout title="Fulfillment" subtitle={SITE_SLOGAN}>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 mb-6">
            <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Order Fulfillment</h2>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm max-w-md mx-auto">
              {error}
              {error.includes('get_pending_custom_order_count') && (
                <p className="mt-2 text-red-200/80">
                  Run pending Supabase migration 077 first.
                </p>
              )}
            </div>
          )}
          {loading ? (
            <div className="text-slate-400 mb-4">Checking pending orders...</div>
          ) : guestPendingCount !== null && guestPendingCount > 0 ? (
            <div className="mb-4">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-300 font-medium">
                  {guestPendingCount} order{guestPendingCount === 1 ? '' : 's'} waiting for fulfillment
                </span>
              </span>
            </div>
          ) : (
            <p className="text-slate-400 mb-4">No pending orders right now.</p>
          )}
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Members browse live <strong className="text-amber-300">WTB</strong> buy requests and{' '}
            <strong className="text-cyan-300">WTS</strong> sell listings, then accept trades that match
            their blueprints or needs. Build reputation and earn aUEC — sign in to participate.
          </p>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700 text-left max-w-md mx-auto">
            <h3 className="text-white font-medium mb-2">What members can do:</h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Fulfill WTB craft orders that match your acquired blueprints</li>
              <li>• Buy WTS listings from members selling stock on hand</li>
              <li>• Track progress and mark orders ready for pickup</li>
              <li>• Build buyer and seller reputation through ratings</li>
            </ul>
          </div>
          <p className="text-amber-300/70 text-sm mt-6">
            Sign in to browse full order details and accept trades.
          </p>
        </div>
      </FeaturePageLayout>
    )
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

      {!isRsiVerified && (
        <div className="mb-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40">
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 rounded-lg bg-amber-600/20">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-amber-300 font-medium">RSI Handle Verification Required</h3>
              <p className="text-amber-200/70 text-sm mt-1">
                To accept and fulfill orders, you must first verify your RSI Handle. This ensures all traders 
                can be identified by their in-game identity.
              </p>
              <p className="text-amber-200/70 text-sm mt-2">
                Go to <strong className="text-amber-300">Settings → Profile</strong> and click <strong className="text-cyan-400">Validate</strong> next to your RSI Handle.
              </p>
            </div>
          </div>
        </div>
      )}

      {isRsiVerified && orderLimits && orderLimits.unrated_count > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-red-950/40 border border-red-500/40">
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 rounded-lg bg-red-600/20">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-red-300 font-medium">Rate Your Completed Orders</h3>
              <p className="text-red-200/70 text-sm mt-1">
                You have <strong className="text-red-300">{orderLimits.unrated_count}</strong> completed {orderLimits.unrated_count === 1 ? 'order' : 'orders'} awaiting your rating.
                You must archive and rate all completed orders before accepting new ones. You can still browse the marketplace and work on orders you have already accepted.
              </p>
              <Link
                to="/orders"
                search={{ tab: 'completed' }}
                className="mt-2 inline-block text-sm text-red-300 hover:text-red-200 underline"
              >
                Go to Completed tab →
              </Link>
            </div>
          </div>
        </div>
      )}

      {isRsiVerified && (
        <>
          <p className="mb-4 text-slate-500 text-sm">
            Browse pending orders here with buyer reputation before accepting. You need every required
            blueprint to accept. Once accepted, you have <strong className="text-slate-300">72 hours</strong>{' '}
            to mark the order ready or it releases back to the pool. Orders with blueprints at{' '}
            <strong className="text-slate-300">800+ quality</strong> require materials on hand — only
            accept if you can fulfill. Enable{' '}
            <span className="text-slate-300">Deduct inventory on craft complete</span> in Settings if
            you want My Resources checked and deducted when you finish a craft. Ratings show as{' '}
            <span className="text-slate-400 italic">Pending</span> until a member has 5 completed
            orders or fulfillments.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <ReputationBadge label="Your fulfiller rep" reputation={myFulfillerRep} type="fulfiller" />
            {orderLimits?.has_pending_fulfiller_rep && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400">
                  {orderLimits.fulfillment_count}/{orderLimits.fulfiller_order_limit} active
                </span>
                <a
                  href="/archive#pending-rep"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-orange-400/70 hover:text-orange-300 underline"
                >
                  (pending rep limit)
                </a>
              </>
            )}
          </div>
        </>
      )}

      {isRsiVerified && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Show:</span>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'wtb', label: 'WTB' },
              { id: 'wts', label: 'WTS' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setListingTypeFilter(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors site-btn-shimmer ${
                listingTypeFilter === opt.id
                  ? 'site-filter-selected-slate'
                  : 'bg-slate-900/60 text-slate-400 border-slate-700 hover:border-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

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
                    const isWts = orderListingType(order) === 'wts'
                    const buyerRep = buyerReputationFromRow(reputations[order.requester_id])
                    const acceptBlockers = getOrderAcceptBlockers({
                      order,
                      acquiredBlueprints,
                    })
                    const meetsMinRep = isWts
                      ? fulfillerMeetsOrderMinRep(myBuyerRep, order.min_fulfiller_reputation)
                      : fulfillerMeetsOrderMinRep(myFulfillerRep, order.min_fulfiller_reputation)
                    const canAcceptLimits = isWts
                      ? orderLimits?.can_accept_wts_order !== false
                      : orderLimits?.can_accept_order !== false
                    const canAccept =
                      acceptBlockers.length === 0 && meetsMinRep && canAcceptLimits

                    return (
                      <AvailableOrderCard
                        key={order.id}
                        order={order}
                        expanded={expandedPendingOrderId === order.id}
                        onToggle={() => handleTogglePendingOrder(order.id)}
                        blueprintById={blueprintById}
                        showDfp={dfpDisplayEnabled}
                        buyerRep={buyerRep}
                        sellerRep={fulfillerReputationFromRow(reputations[order.requester_id])}
                        acceptBlockers={acceptBlockers}
                        meetsMinRep={meetsMinRep}
                        canAccept={canAccept}
                        canAcceptLimits={canAcceptLimits}
                        accepting={acceptingOrderId === order.id}
                        onAccept={() => void handleAccept(order.id)}
                        onAcceptPartial={(selections) =>
                          void handleAcceptPartial(order.id, selections)
                        }
                      />
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
                  const orderItems = fulfillmentItemsForOrder(order)
                  const stockCheck = getStockCheckForOrder(order)
                  const isSubmitting = submittingOrderId === order.id

                  return (
                    <AssignedOrderCard
                      key={order.id}
                      order={order}
                      blueprintById={blueprintById}
                      dfpDisplayEnabled={dfpDisplayEnabled}
                      craftDeductInventory={craftDeductInventory}
                      reputations={reputations}
                      labelMap={labelMap}
                      quantityByKey={quantityByKey}
                      orderItems={orderItems}
                      stockCheck={stockCheck}
                      notes={craftNotesByOrderId[order.id] ?? ''}
                      onNotesChange={(value) =>
                        setCraftNotesByOrderId((prev) => ({ ...prev, [order.id]: value }))
                      }
                      submitting={isSubmitting}
                      onAbandon={() => void handleAbandon(order.id)}
                      onStartWork={() => void handleStartWork(order.id)}
                      onCompleteCraft={() => void handleCompleteCraft(order.id)}
                    />
                  )
                })}
              </div>
            )}
            </div>

            <div>
              <h2 className="text-white font-medium mb-3">My WTS sales</h2>
              {myWtsSales.length === 0 ? (
                <div className="p-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                  No active sell listings with a buyer yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {myWtsSales.map((order) => (
                    <WtsSaleOrderCard
                      key={order.id}
                      order={order}
                      userId={userId ?? ''}
                      blueprintById={blueprintById}
                      dfpDisplayEnabled={dfpDisplayEnabled}
                      submitting={submittingOrderId === order.id}
                      onAbandon={() => void handleAbandon(order.id)}
                      onStartWork={() => void handleStartWork(order.id)}
                      onMarkReady={() => void handleMarkWtsReady(order.id)}
                    />
                  ))}
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
                        className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl space-y-2"
                      >
                        <p className="text-white text-sm font-medium">{order.title}</p>
                        <p className="text-slate-500 text-xs">
                          {order.status.replace(/_/g, ' ')}
                          {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                        </p>
                        {order.assignee && (
                          <TradeContactChip role="fulfiller" profile={order.assignee} compact />
                        )}
                        {order.assignee_id && (
                          <ReputationBadge label="Fulfiller rep" reputation={fulfillerRep} type="fulfiller" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
            {myOrdersNeedingRating.length > 0 && (
              <div className="mb-6">
                <h2 className="text-white font-medium mb-1">Rate completed orders</h2>
                <p className="text-slate-500 text-xs mb-3">
                  Pickup is done — archive &amp; rate each order below to finish the deal. Both
                  parties must rate before new orders unlock.
                </p>
                <div className="space-y-2">
                  {myOrdersNeedingRating.map((order) => {
                    const totalDfp = orderTotalDfp(order)
                    return (
                      <div
                        key={order.id}
                        className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-3"
                      >
                        <div>
                          <p className="text-white text-sm font-medium flex items-center gap-2 flex-wrap">
                            {order.title}
                            <ListingTypeBadge order={order} />
                          </p>
                          <p className="text-slate-500 text-xs mt-1">
                            completed
                            {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                          </p>
                          {order.listing_type === 'wts' && order.assignee && (
                            <div className="mt-2">
                              <TradeContactChip role="buyer" profile={order.assignee} compact />
                            </div>
                          )}
                          {order.listing_type === 'wtb' && order.requester && (
                            <div className="mt-2">
                              <TradeContactChip role="customer" profile={order.requester} compact />
                            </div>
                          )}
                        </div>
                        <OrderArchiveCallout
                          order={order}
                          userId={userId}
                          onArchive={() => openArchiveForOrder(order)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <h2 className="text-white font-medium mb-3">Awaiting pickup confirmation</h2>
            {myFinishedOrders.length === 0 ? (
              <div className="p-6 mb-6 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl text-slate-400 text-sm">
                No WTB orders waiting on customer pickup confirmation.
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {myFinishedOrders.map((order) => {
                  const totalDfp = orderTotalDfp(order)

                  return (
                    <div
                      key={order.id}
                      className="p-4 bg-slate-900/60 border border-slate-700 rounded-xl space-y-3"
                    >
                      <div>
                        <p className="text-white text-sm font-medium">{order.title}</p>
                        <p className="text-slate-500 text-xs mt-1">
                          {order.status.replace(/_/g, ' ')}
                          {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                        </p>
                        <div className="mt-2">
                          <TradeContactChip role="customer" profile={order.requester} compact />
                        </div>
                        <div className="mt-2">
                          <ReputationBadge
                            label="Buyer rep"
                            reputation={buyerReputationFromRow(reputations[order.requester_id])}
                          />
                        </div>
                        <p className="text-cyan-300/80 text-xs mt-2">
                          Waiting for customer pickup confirmation in Custom Orders.
                        </p>
                        <div className="mt-2">
                          <OrderRequestLines order={order} showDfp={dfpDisplayEnabled} blueprintById={blueprintById} showEffectiveStats />
                        </div>
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
                            {formatQuantityForResource(item.resource_key, Number(item.quantity))}{' '}
                            {resourceQuantityUnitLabel(item.resource_key)}
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

      {archiveRatingModal && (
        <OrderRatingModal
          target={archiveRatingModal.target}
          rateeName={archiveRatingModal.rateeName}
          orderTitle={archiveRatingModal.orderTitle}
          onConfirm={(stars, comment) => void handleArchiveConfirm(stars, comment)}
          onCancel={() => setArchiveRatingModal(null)}
          confirming={archiving}
        />
      )}
    </FeaturePageLayout>
  )
}
