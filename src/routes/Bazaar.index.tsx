import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import AvailableOrderCard from '../components/AvailableOrderCard'
import AssignedOrderCard from '../components/AssignedOrderCard'
import OrderArchiveCallout from '../components/OrderArchiveCallout'
import OrderRatingModal, { type OrderRatingTarget } from '../components/OrderRatingModal'
import OrderRequestLines from '../components/OrderRequestLines'
import ListingTypeBadge from '../components/ListingTypeBadge'
import TradeContactChip from '../components/TradeContactChip'
import DealMessageButton from '../components/DealMessageButton'
import OrderDeadlineNotice from '../components/OrderDeadlineNotice'
import WtsSaleOrderCard from '../components/WtsSaleOrderCard'
import { type WtsLineSelection } from '../components/WtsPartialPurchasePanel'
import ReputationBadge from '../components/ReputationBadge'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { setAnalyticsSubTool } from '../lib/analytics'
import { REPUTATION_STAR_OPTIONS } from '../config/reputation'
import { SITE_SLOGAN } from '../config/site'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import { formatDfpAuec } from '../lib/dfp'
import { buildStockTotalsByResource } from '../lib/inventoryStock'
import {
  archiveRatingInfo,
  canUserArchiveOrder,
} from '../lib/orderArchive'
import { releaseOrderConfirmMessage } from '../lib/orderRelease'
import { fulfillmentItemsMatch } from '../lib/orderFulfillment'
import { orderTotalDfp, resolveOrderFulfillmentItems } from '../lib/orderPricing'
import { resourceQuantityUnitLabel } from '../config/resourceTypes'
import { formatQuantityForResource } from '../lib/resourceQuantity'
import { getBandTier, getResourceBands } from '../lib/qualityBands'
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
  acceptWtsPartialPurchase,
  acceptWtbPartialFulfillment,
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
import { orderListingType } from '../lib/listingType'

const bazaarRouteApi = getRouteApi('/bazaar')

type BazaarTab = 'fulfillment' | 'store'

const QUALITY_BAND_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

/** Fallback band mapping for lines without resource-specific bands (Q 0–1000 → 1–8). */
function fallbackBand(quality: number): number {
  return Math.min(8, Math.max(1, Math.ceil(quality / 125)))
}

function resourceLineBand(label: string, quality: number): number {
  const bands = getResourceBands(label)
  if (bands && bands.length > 0) return getBandTier(quality, bands)
  return fallbackBand(quality)
}

function blueprintLineBand(
  minQuality: number,
  slotQualities: Record<number, number> | null
): number {
  const qualities = slotQualities ? Object.values(slotQualities) : []
  const quality = qualities.length > 0 ? Math.max(...qualities) : minQuality
  return fallbackBand(quality)
}

/** True when any listing line matches the text search and minimum Q-band. */
function listingMatchesSearch(
  order: CustomOrder,
  searchText: string,
  minBand: number | null
): boolean {
  const text = searchText.trim().toLowerCase()
  if (!text && minBand == null) return true

  const bpLines = order.blueprints ?? []
  const resLines = order.resource_lines ?? []

  for (const line of bpLines) {
    const title = (line.blueprint_title ?? line.blueprint_id).toLowerCase()
    if (text && !title.includes(text)) continue
    if (minBand != null && blueprintLineBand(line.min_quality, line.slot_qualities) < minBand) {
      continue
    }
    return true
  }

  for (const line of resLines) {
    if (text && !line.resource_label.toLowerCase().includes(text)) continue
    if (minBand != null && resourceLineBand(line.resource_label, line.min_quality) < minBand) {
      continue
    }
    return true
  }

  return false
}

export default function BazaarRoute() {
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
  const [activeTab, setActiveTab] = useState<BazaarTab>('fulfillment')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    setAnalyticsSubTool(activeTab)
  }, [activeTab])

  const [minBandFilter, setMinBandFilter] = useState('')
  const [expandedPendingOrderId, setExpandedPendingOrderId] = useState<string | null>(null)
  const [flashOrderId, setFlashOrderId] = useState<string | null>(null)
  const highlightAppliedRef = useRef<string | null>(null)

  const { highlight } = bazaarRouteApi.useSearch()

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

  const activeListingType = activeTab === 'store' ? 'wts' : 'wtb'
  const minBand = minBandFilter ? Number(minBandFilter) : null

  const pendingListings = useMemo(() => {
    const minRepFilter = minBuyerRepFilter ? Number(minBuyerRepFilter) : null

    return orders.filter((order) => {
      if (order.status !== 'pending' || order.requester_id === userId) return false
      if (order.source_listing_id) return false
      if (orderListingType(order) !== activeListingType) return false

      if (activeListingType === 'wtb') {
        const buyerRep = buyerReputationFromRow(reputations[order.requester_id])
        if (!passesBuyerRepFilter(buyerRep, minRepFilter)) return false
      }

      return listingMatchesSearch(order, searchText, minBand)
    })
  }, [orders, userId, minBuyerRepFilter, reputations, activeListingType, searchText, minBand])

  const visiblePendingListings = useMemo(() => {
    if (activeListingType !== 'wtb' || !onlyMyBlueprintOrders) return pendingListings
    // Partial fulfillment: keep listings where at least one blueprint line is owned.
    return pendingListings.filter((order) => {
      const bpLines = order.blueprints ?? []
      if (bpLines.length === 0) return (order.resource_lines ?? []).length > 0
      return bpLines.some((line) => acquiredBlueprints[line.blueprint_id] === true)
    })
  }, [pendingListings, activeListingType, onlyMyBlueprintOrders, acquiredBlueprints])

  useEffect(() => {
    if (highlight) return
    setExpandedPendingOrderId(null)
  }, [activeTab, minBuyerRepFilter, onlyMyBlueprintOrders, searchText, minBandFilter, highlight])

  const handleTogglePendingOrder = useCallback((orderId: string) => {
    setExpandedPendingOrderId((current) => (current === orderId ? null : orderId))
  }, [])

  useEffect(() => {
    if (!highlight || loading || !userId) return
    if (highlightAppliedRef.current === highlight) return

    const target = orders.find(
      (o) => o.id === highlight && o.status === 'pending' && o.requester_id !== userId
    )
    if (!target) return

    const targetTab: BazaarTab = orderListingType(target) === 'wts' ? 'store' : 'fulfillment'
    if (activeTab !== targetTab) setActiveTab(targetTab)
    if (onlyMyBlueprintOrders) setOnlyMyBlueprintOrders(false)
    if (searchText) setSearchText('')
    if (minBandFilter) setMinBandFilter('')
  }, [
    highlight,
    loading,
    userId,
    orders,
    activeTab,
    onlyMyBlueprintOrders,
    searchText,
    minBandFilter,
  ])

  useEffect(() => {
    if (!highlight || loading || !userId) return
    if (highlightAppliedRef.current === highlight) return
    if (!visiblePendingListings.some((o) => o.id === highlight)) return

    highlightAppliedRef.current = highlight
    setExpandedPendingOrderId(highlight)
    setFlashOrderId(highlight)

    requestAnimationFrame(() => {
      document.getElementById(`fulfillment-order-${highlight}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })

    const timer = window.setTimeout(() => setFlashOrderId(null), 4000)
    return () => window.clearTimeout(timer)
  }, [highlight, loading, userId, visiblePendingListings])

  const myBuyingOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.requester_id === userId &&
          o.listing_type !== 'wts' &&
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
          orderListingType(o) === 'wtb' &&
          ['accepted', 'in_progress'].includes(o.status)
      ),
    [orders, userId]
  )

  const myWtsSales = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.requester_id === userId &&
          orderListingType(o) === 'wts' &&
          o.assignee_id != null &&
          ['accepted', 'in_progress', 'ready_for_pickup'].includes(o.status)
      ),
    [orders, userId]
  )

  const myFinishedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.assignee_id === userId &&
          orderListingType(o) === 'wtb' &&
          o.status === 'ready_for_pickup'
      ),
    [orders, userId]
  )

  const myOrdersNeedingRating = useMemo(
    () =>
      orders.filter(
        (o) => o.status === 'completed' && canUserArchiveOrder(o, userId)
      ),
    [orders, userId]
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

  const handleAcceptPartial = async (listing: CustomOrder, selections: WtsLineSelection[]) => {
    setAcceptingOrderId(listing.id)
    setError(null)

    const result =
      orderListingType(listing) === 'wts'
        ? await acceptWtsPartialPurchase(listing.id, selections)
        : await acceptWtbPartialFulfillment(listing.id, selections)

    if (result.error) {
      setAcceptingOrderId(null)
      setError(result.error)
      return
    }

    if (result.purchaseOrderId) {
      const { data: refreshed } = await fetchCustomOrders()
      const childOrder = refreshed.find((o) => o.id === result.purchaseOrderId)
      if (childOrder) {
        const syncResult = await syncFulfillmentItems(childOrder)
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
      <FeaturePageLayout
        title="The Bazaar"
        subtitle="Star Citizen community WTB & WTS marketplace"
        seoIntro="The Bazaar is a Star Citizen member marketplace for WTB craft requests and WTS stock listings — browse open trades, fulfill by item and quantity, and build buyer/seller reputation. Sign in to participate."
      >
        <div className="max-w-2xl mx-auto py-12 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 mb-6">
            <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">The Bazaar</h2>
          {error && (
            <div className="mb-4 site-banner-error max-w-md mx-auto">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-slate-400 mb-4">Checking open listings...</div>
          ) : guestPendingCount !== null && guestPendingCount > 0 ? (
            <div className="mb-4">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-300 font-medium">
                  {guestPendingCount} open listing{guestPendingCount === 1 ? '' : 's'} on the Bazaar
                </span>
              </span>
            </div>
          ) : (
            <p className="text-slate-400 mb-4">No open listings right now.</p>
          )}
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Members browse live <strong className="text-amber-300">WTB</strong> buy listings and{' '}
            <strong className="text-cyan-300">WTS</strong> sell listings, then pick the exact items
            and quantities they want to fulfill or buy. Build reputation and earn aUEC — sign in to
            participate.
          </p>
          <div className="p-4 site-surface text-left max-w-md mx-auto">
            <h3 className="text-white font-medium mb-2">What members can do:</h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Fulfill WTB craft requests that match your acquired blueprints</li>
              <li>• Shop WTS listings from members selling stock on hand</li>
              <li>• Pick individual items and quantities — no all-or-nothing trades</li>
              <li>• Build buyer and seller reputation through ratings</li>
            </ul>
          </div>
          <p className="text-amber-300/70 text-sm mt-6">
            Sign in to browse full listing details and trade.
          </p>
        </div>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="The Bazaar"
      subtitle="Star Citizen community WTB & WTS marketplace"
      seoIntro="The Bazaar is a Star Citizen member marketplace for WTB craft requests and WTS stock listings — browse open trades, fulfill by item and quantity, and build buyer/seller reputation."
      actions={
        <Link
          to="/orders"
          search={{ tab: undefined }}
          className="site-btn-secondary !px-3 !py-1.5 text-sm"
        >
          My Listings
        </Link>
      }
    >
      {error && (
        <div className="mb-4 site-banner-error">
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
                To trade on the Bazaar, you must first verify your RSI Handle. This ensures all traders 
                can be identified by their in-game identity.
              </p>
              <p className="text-amber-200/70 text-sm mt-2">
                Go to <strong className="text-amber-300">Settings → Profile</strong>, get a verification code, paste it into your public RSI Bio, then click <strong className="text-cyan-400">Verify</strong>.
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
                You must archive and rate all completed orders before starting new trades. You can still browse the Bazaar and work on trades you have already started.
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
            Every listing is priced at exact{' '}
            <a
              href="/archive#dfp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400/70 hover:text-orange-300 underline"
            >
              DFP
            </a>{' '}
            and every trade is item-by-item — pick what you want from a listing and the rest stays
            open. Once you start a trade, you have{' '}
            <strong className="text-slate-300">72 hours</strong> to finish your side or it returns
            to the listing. Ratings show as <span className="text-slate-400 italic">Pending</span>{' '}
            until a member has 5 completed items (quantity on a line counts).
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <ReputationBadge label="Your fulfiller rep" reputation={myFulfillerRep} type="fulfiller" />
            <ReputationBadge label="Your buyer rep" reputation={myBuyerRep} type="buyer" />
            {orderLimits?.has_pending_fulfiller_rep && (
              <>
                <span className="text-slate-500">·</span>
                <span className="site-badge-slate text-xs">
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

      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <>
          {isRsiVerified && (
            <div className="mb-6">
              <div className="flex flex-wrap gap-2 mb-4">
                {(
                  [
                    { id: 'fulfillment', label: 'Fulfillment (WTB)' },
                    { id: 'store', label: 'Store (WTS)' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors site-btn-shimmer ${
                      activeTab === tab.id
                        ? tab.id === 'store'
                          ? 'bg-cyan-950/50 text-cyan-200 border-cyan-500/40'
                          : 'bg-red-950/50 text-red-200 border-red-500/40'
                        : 'site-filter-idle'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={
                    activeTab === 'store'
                      ? 'Search items for sale (e.g. Killshot, Quantainium)…'
                      : 'Search wanted items (e.g. Killshot, Quantainium)…'
                  }
                  className="flex-1 px-3 py-2 site-input text-white text-sm placeholder-slate-500"
                />
                <label className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                  <span>Min Q-band</span>
                  <select
                    value={minBandFilter}
                    onChange={(e) => setMinBandFilter(e.target.value)}
                    className="px-2 py-2 site-input text-white text-sm"
                  >
                    <option value="">Any</option>
                    {QUALITY_BAND_OPTIONS.map((band) => (
                      <option key={band} value={band}>
                        Band {band}+
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {activeTab === 'fulfillment' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyMyBlueprintOrders}
                      onChange={(e) => setOnlyMyBlueprintOrders(e.target.checked)}
                      className="site-checkbox text-purple-500"
                    />
                    <span>Only listings with my blueprints</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="shrink-0">Min buyer rep</span>
                    <select
                      value={minBuyerRepFilter}
                      onChange={(e) => setMinBuyerRepFilter(e.target.value)}
                      className="px-2 py-1 site-input text-white text-sm"
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
              )}

              {activeTab === 'fulfillment' && (
                <p className="text-slate-500 text-xs mb-3">
                  Buyers without 5 completed items always appear — they cannot be filtered out.
                  You only need the blueprints for the lines you choose to fulfill.
                </p>
              )}

              {visiblePendingListings.length === 0 ? (
                <div className="site-empty !py-6 text-sm">
                  {activeTab === 'store'
                    ? 'No sell listings match your search.'
                    : 'No buy listings match your search.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {visiblePendingListings.map((order) => {
                    const isWts = orderListingType(order) === 'wts'
                    const buyerRep = buyerReputationFromRow(reputations[order.requester_id])
                    const meetsMinRep = isWts
                      ? fulfillerMeetsOrderMinRep(myBuyerRep, order.min_fulfiller_reputation)
                      : fulfillerMeetsOrderMinRep(myFulfillerRep, order.min_fulfiller_reputation)
                    const canAcceptLimits = isWts
                      ? orderLimits?.can_accept_wts_order !== false
                      : orderLimits?.can_accept_order !== false

                    return (
                      <AvailableOrderCard
                        key={order.id}
                        order={order}
                        expanded={expandedPendingOrderId === order.id}
                        highlighted={flashOrderId === order.id}
                        onToggle={() => handleTogglePendingOrder(order.id)}
                        blueprintById={blueprintById}
                        showDfp={dfpDisplayEnabled}
                        buyerRep={buyerRep}
                        sellerRep={fulfillerReputationFromRow(reputations[order.requester_id])}
                        acceptBlockers={[]}
                        meetsMinRep={meetsMinRep}
                        canAcceptLimits={canAcceptLimits}
                        accepting={acceptingOrderId === order.id}
                        acquiredBlueprints={acquiredBlueprints}
                        onAcceptPartial={(selections) =>
                          void handleAcceptPartial(order, selections)
                        }
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="space-y-6">
              {activeTab === 'fulfillment' && (
                <div>
                  <h2 className="text-white font-medium mb-3">My assigned orders</h2>
                  {myAssignedOrders.length === 0 ? (
                    <div className="site-empty !py-6 text-sm">
                      No orders assigned to you. Claim items from a buy listing above.
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
              )}

              {activeTab === 'store' && (
                <div>
                  <h2 className="text-white font-medium mb-3">My WTS sales</h2>
                  {myWtsSales.length === 0 ? (
                    <div className="site-empty !py-6 text-sm">
                      No active sales from your sell listing yet.
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
              )}
            </section>

            <section className="space-y-6">
              {activeTab === 'fulfillment' && myBuyingOrders.length > 0 && (
                <div>
                  <h2 className="text-white font-medium mb-3">Orders you&apos;re buying</h2>
                  <p className="text-slate-500 text-xs mb-3">
                    Fulfiller reputation appears after they claim items from your listing.
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
                          className="p-4 site-surface space-y-2"
                        >
                          <p className="text-white text-sm font-medium">{order.title}</p>
                          <p className="text-slate-500 text-xs">
                            {order.status.replace(/_/g, ' ')}
                            {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                          </p>
                          {order.assignee && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <TradeContactChip role="fulfiller" profile={order.assignee} compact />
                              <DealMessageButton order={order} />
                            </div>
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
                      parties must rate before new trades unlock.
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

                {activeTab === 'fulfillment' && (
                  <>
                    <h2 className="text-white font-medium mb-3">Awaiting pickup confirmation</h2>
                    {myFinishedOrders.length === 0 ? (
                      <div className="site-empty !py-6 mb-6 text-sm">
                        No WTB orders waiting on customer pickup confirmation.
                      </div>
                    ) : (
                      <div className="space-y-2 mb-6">
                        {myFinishedOrders.map((order) => {
                          const totalDfp = orderTotalDfp(order)

                          return (
                            <div
                              key={order.id}
                              className="p-4 site-surface space-y-3"
                            >
                              <div>
                                <p className="text-white text-sm font-medium">{order.title}</p>
                                <p className="text-slate-500 text-xs mt-1">
                                  {order.status.replace(/_/g, ' ')}
                                  {dfpDisplayEnabled && totalDfp > 0 && ` · ${formatDfpAuec(totalDfp)}`}
                                </p>
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <TradeContactChip role="customer" profile={order.requester} compact />
                                  <DealMessageButton order={order} />
                                </div>
                                <div className="mt-2">
                                  <ReputationBadge
                                    label="Buyer rep"
                                    reputation={buyerReputationFromRow(reputations[order.requester_id])}
                                  />
                                </div>
                                <p className="text-cyan-300/80 text-xs mt-2">
                                  Waiting for customer pickup confirmation in My Listings.
                                </p>
                                <OrderDeadlineNotice order={order} role="fulfiller" />
                                <div className="mt-2">
                                  <OrderRequestLines order={order} showDfp={dfpDisplayEnabled} blueprintById={blueprintById} showEffectiveStats />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {activeTab === 'fulfillment' && (
                <div>
                  <h2 className="text-white font-medium mb-3">Fulfillment history</h2>
                  <p className="text-slate-500 text-xs mb-3">Your crafts from the last 30 days.</p>
                  {fulfillments.length === 0 ? (
                    <div className="site-empty !py-6 text-sm">
                      No fulfillments in the last 30 days.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {fulfillments.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-4 site-surface"
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
                                  className="site-badge-slate"
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
              )}
            </section>
          </div>
        </>
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
