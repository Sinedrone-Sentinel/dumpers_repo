import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitNotice from '../components/AuecTransferLimitNotice'
import OrderRatingModal, { type OrderRatingTarget } from '../components/OrderRatingModal'
import OrderRequestLines from '../components/OrderRequestLines'
import ReputationBadge from '../components/ReputationBadge'
import ResourceBuyOrderPanel from '../components/ResourceBuyOrderPanel'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel } from '../lib/blueprintResources'
import { formatDfpRequiredPrice } from '../lib/dfp'
import { SITE_SLOGAN } from '../config/site'
import { canRequesterModifyOrder } from '../lib/orderEdit'
import { orderTotalDfp } from '../lib/orderPricing'
import { formatResourceQuantity } from '../lib/resourceQuantity'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { useBlueprintData } from './blueprints'
import { useAuth } from '../contexts/AuthContext'
import {
  canCustomerArchive,
  isArchivedForUser,
  isCompletedStageOrder,
  isOpenOrder,
  orderMatchesTab,
  type OrderListTab,
} from '../lib/orderArchive'
import { buyerReputationFromRow, type MemberReputationRow } from '../lib/reputation'
import {
  archiveCustomOrderWithRating,
  confirmOrderPickup,
  deleteCustomOrderRequester,
  fetchCustomOrders,
  fetchMemberReputations,
  updateCustomOrderStatus,
  type CustomOrder,
  type CustomOrderStatus,
} from '../lib/operations'
import { getDisplayName } from '../lib/supabase'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
  accepted: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30',
  in_progress: 'bg-blue-950/50 text-blue-300 border-blue-500/30',
  ready_for_pickup: 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30',
  fulfilled: 'bg-green-950/50 text-green-300 border-green-500/30',
  completed: 'bg-green-950/50 text-green-300 border-green-500/30',
  archived: 'bg-slate-800/80 text-slate-400 border-slate-600',
  cancelled: 'bg-slate-800 text-slate-400 border-slate-600',
}

const LIST_TABS: { id: OrderListTab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'archive', label: 'Archive' },
]

const OPEN_STATUSES: CustomOrderStatus[] = [
  'pending',
  'accepted',
  'in_progress',
  'ready_for_pickup',
]

function profileFromOrderFields(
  userId: string,
  fields?: { rsi_handle: string | null; display_name: string | null; email: string | null } | null
) {
  if (!fields) return null
  return {
    id: userId,
    rsi_handle: fields.rsi_handle,
    display_name: fields.display_name,
    email: fields.email,
    avatar_url: null,
    role: 'member' as const,
    created_at: '',
    approved_at: null,
    approved_by: null,
    ghost_mode: false,
    preview_features_enabled: false,
    craft_deduct_inventory: false,
  }
}

export default function CustomOrdersRoute() {
  const { user, profile, dfpDisplayEnabled } = useAuth()
  const { data: blueprints = [] } = useBlueprintData()
  const { catalog, labelMap, loading: catalogLoading } = useResourceCatalog()
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [listTab, setListTab] = useState<OrderListTab>('active')
  const [ratingModal, setRatingModal] = useState<{
    orderId: string
    target: OrderRatingTarget
    rateeName: string
    orderTitle: string
  } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [myReputation, setMyReputation] = useState<MemberReputationRow | null>(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    const ordersResult = await fetchCustomOrders(
      user?.id ? { requesterId: user.id } : undefined
    )
    if (ordersResult.error) setError(ordersResult.error)
    setOrders(ordersResult.data)

    if (user?.id) {
      const repResult = await fetchMemberReputations([user.id])
      if (repResult.error && !ordersResult.error) setError(repResult.error)
      setMyReputation(repResult.data[user.id] ?? null)
    } else {
      setMyReputation(null)
    }

    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  const handleStatusChange = async (orderId: string, status: CustomOrderStatus) => {
    const result = await updateCustomOrderStatus(orderId, status)
    if (result.error) {
      setError(result.error)
      return
    }
    await loadOrders()
  }

  const handleDeleteOrder = async (orderId: string) => {
    if (
      !window.confirm(
        'Delete this order permanently? This cannot be undone.'
      )
    ) {
      return
    }
    const result = await deleteCustomOrderRequester(orderId)
    if (result.error) {
      setError(result.error)
      return
    }
    if (editingOrderId === orderId) setEditingOrderId(null)
    await loadOrders()
  }

  const handleConfirmPickup = async (orderId: string) => {
    const result = await confirmOrderPickup(orderId)
    if (result.error) {
      setError(result.error)
      return
    }
    setListTab('completed')
    await loadOrders()
  }

  const openArchiveModal = (
    order: CustomOrder,
    target: OrderRatingTarget,
    rateeFields?: { rsi_handle: string | null; display_name: string | null; email: string | null } | null,
    rateeId?: string | null
  ) => {
    setRatingModal({
      orderId: order.id,
      target,
      rateeName: getDisplayName(
        profileFromOrderFields(rateeId ?? '', rateeFields)
      ),
      orderTitle: order.title,
    })
  }

  const handleArchiveConfirm = async (stars: number, comment?: string) => {
    if (!ratingModal) return

    setArchiving(true)
    const result = await archiveCustomOrderWithRating(ratingModal.orderId, stars, comment)
    setArchiving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setRatingModal(null)
    setListTab('archive')
    await loadOrders()
  }

  const userId = user?.id
  const myBuyerRep = useMemo(
    () => buyerReputationFromRow(myReputation ?? undefined),
    [myReputation]
  )
  const myOrders = useMemo(
    () => (userId ? orders.filter((o) => o.requester_id === userId) : []),
    [orders, userId]
  )

  const visibleOrders = useMemo(
    () =>
      myOrders.filter(
        (o) => o.status !== 'cancelled' && orderMatchesTab(o, listTab, userId)
      ),
    [myOrders, listTab, userId]
  )

  const openOrderCount = useMemo(
    () =>
      myOrders.filter(
        (o) => o.status !== 'cancelled' && isOpenOrder(o) && !isArchivedForUser(o, userId)
      ).length,
    [myOrders, userId]
  )

  const completedOrderCount = useMemo(
    () =>
      myOrders.filter(
        (o) =>
          o.status !== 'cancelled' &&
          isCompletedStageOrder(o) &&
          !isArchivedForUser(o, userId)
      ).length,
    [myOrders, userId]
  )

  const totalOrderCount = openOrderCount + completedOrderCount

  return (
    <FeaturePageLayout
      title="Custom Orders"
      subtitle={SITE_SLOGAN}
      actions={
        <>
          <Link
            to="/fulfillment"
            className="px-3 py-1.5 text-sm bg-purple-950/50 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 rounded-lg transition-colors"
          >
            Go to Fulfillment
          </Link>
          <button
            onClick={() => {
              setEditingOrderId(null)
              setShowForm((v) => !v)
            }}
            className="px-3 py-1.5 text-sm bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/30 rounded-lg transition-colors"
          >
            {showForm ? 'Close form' : 'New order'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      {userId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ReputationBadge label="Your buyer rep" reputation={myBuyerRep} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Open orders</p>
          <p className="text-2xl font-bold text-amber-300 mt-1">{openOrderCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Completed orders</p>
          <p className="text-2xl font-bold text-cyan-300 mt-1">{completedOrderCount}</p>
          <p className="text-slate-500 text-[10px] mt-1">Ready for pickup or awaiting archive</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Total orders</p>
          <p className="text-2xl font-bold text-white mt-1">{totalOrderCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {LIST_TABS.map((tab) => {
          const count = orders.filter(
            (o) => o.status !== 'cancelled' && orderMatchesTab(o, tab.id, userId)
          ).length

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setListTab(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                listTab === tab.id
                  ? 'bg-red-950/50 text-red-200 border-red-500/40'
                  : 'bg-slate-900/60 text-slate-400 border-slate-700 hover:border-slate-600'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs opacity-80">({count})</span>
              )}
            </button>
          )
        })}
      </div>

      {showForm && user?.id && !editingOrderId && (
        <div className="mb-6 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <h2 className="text-white font-medium mb-2">New buy order</h2>
          <p className="text-slate-500 text-xs mb-4">
            Orders post under {getDisplayName(profile)}.
          </p>
          <ResourceBuyOrderPanel
            userId={user.id}
            blueprints={blueprints}
            catalog={catalog}
            labelMap={labelMap}
            onError={setError}
            onSubmitted={() => {
              setShowForm(false)
              void loadOrders()
            }}
          />
        </div>
      )}

      {editingOrderId && user?.id && (
        <div className="mb-6 bg-slate-900/60 border border-orange-500/30 rounded-xl p-4">
          <h2 className="text-white font-medium mb-2">Edit order</h2>
          <p className="text-slate-500 text-xs mb-4">
            Only pending orders with no fulfiller yet can be changed.
          </p>
          <ResourceBuyOrderPanel
            userId={user.id}
            blueprints={blueprints}
            catalog={catalog}
            labelMap={labelMap}
            editOrder={orders.find((o) => o.id === editingOrderId) ?? null}
            onCancelEdit={() => setEditingOrderId(null)}
            onError={setError}
            onSubmitted={() => {
              setEditingOrderId(null)
              void loadOrders()
            }}
          />
        </div>
      )}

      {loading || catalogLoading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
          <p className="text-slate-400">
            {listTab === 'active' && 'No open orders.'}
            {listTab === 'completed' &&
              'No completed orders. Finished crafts appear here when ready for pickup.'}
            {listTab === 'archive' && 'No archived orders yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => {
            const totalDfp = orderTotalDfp(order)
            return (
              <div
                key={order.id}
                className="bg-slate-900/60 border border-slate-700 rounded-xl p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-medium">{order.title}</h3>
                      <span
                        className={`px-2 py-0.5 rounded text-xs border ${
                          STATUS_STYLES[order.status] ?? STATUS_STYLES.pending
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      {dfpDisplayEnabled && totalDfp > 0 && (
                        <span className="px-2 py-0.5 rounded text-xs border bg-amber-950/50 text-amber-200 border-amber-500/30 font-medium">
                          {formatDfpRequiredPrice(totalDfp)}
                        </span>
                      )}
                      {order.min_fulfiller_reputation != null && (
                        <span className="px-2 py-0.5 rounded text-xs border bg-slate-800 text-slate-300 border-slate-600">
                          Min fulfiller rep {order.min_fulfiller_reputation}+
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 text-xs mt-1">
                      Placed {new Date(order.created_at).toLocaleString()}
                    </p>
                    {order.assignee && (
                      <p className="text-emerald-400/80 text-xs mt-1">
                        Accepted by{' '}
                        {getDisplayName(profileFromOrderFields(order.assignee_id!, order.assignee))}
                        {order.accepted_at &&
                          ` · ${new Date(order.accepted_at).toLocaleString()}`}
                      </p>
                    )}
                    {order.notes && <p className="text-slate-400 text-sm mt-2">{order.notes}</p>}

                    {dfpDisplayEnabled && exceedsSingleTransferLimit(totalDfp) && (
                      <div className="mt-3">
                        <AuecTransferLimitNotice totalAuec={totalDfp} context="customer" compact />
                      </div>
                    )}

                    <div className="mt-3">
                      <OrderRequestLines order={order} showDfp={dfpDisplayEnabled} />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-2 flex-wrap justify-end">
                      {order.status === 'ready_for_pickup' && (
                        <button
                          onClick={() => void handleConfirmPickup(order.id)}
                          className="px-2 py-1 text-xs bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 rounded"
                        >
                          Confirm pickup
                        </button>
                      )}
                      {canCustomerArchive(order, userId) && (
                        <button
                          onClick={() =>
                            openArchiveModal(order, 'fulfiller', order.assignee, order.assignee_id)
                          }
                          className="px-2 py-1 text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded"
                        >
                          Archive
                        </button>
                      )}
                      {canRequesterModifyOrder(order) && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setShowForm(false)
                              setEditingOrderId(order.id)
                            }}
                            className="px-2 py-1 text-xs bg-orange-950/50 text-orange-300 border border-orange-500/30 rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOrder(order.id)}
                            className="px-2 py-1 text-xs bg-red-950/50 text-red-300 border border-red-500/30 rounded"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {OPEN_STATUSES.includes(order.status) && !canRequesterModifyOrder(order) && (
                        <button
                          onClick={() => void handleStatusChange(order.id, 'cancelled')}
                          className="px-2 py-1 text-xs bg-slate-800 text-slate-400 border border-slate-600 rounded"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <span
                        key={item.id}
                        className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded border border-slate-600"
                      >
                        {getResourceLabel(item.resource_key, labelMap)} ×{' '}
                        {formatResourceQuantity(Number(item.quantity))} SCU
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {ratingModal && (
        <OrderRatingModal
          target={ratingModal.target}
          rateeName={ratingModal.rateeName}
          orderTitle={ratingModal.orderTitle}
          onConfirm={(stars, comment) => void handleArchiveConfirm(stars, comment)}
          onCancel={() => setRatingModal(null)}
          confirming={archiving}
        />
      )}
    </FeaturePageLayout>
  )
}
