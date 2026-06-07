import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitNotice from '../components/AuecTransferLimitNotice'
import OrderRatingModal, { type OrderRatingTarget } from '../components/OrderRatingModal'
import ReputationBadge from '../components/ReputationBadge'
import ResourceBuyOrderPanel from '../components/ResourceBuyOrderPanel'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel } from '../lib/blueprintResources'
import { formatDfpAuec, formatDfpRequiredPrice, formatOrderQualityLabel } from '../lib/dfp'
import { getOrderAcceptBlockers } from '../lib/orderAccept'
import {
  orderTotalDfp,
  resolveOrderBlueprintLines,
  resolveOrderResourceLines,
} from '../lib/orderPricing'
import { formatResourceQuantity } from '../lib/resourceQuantity'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { useBlueprintData } from './blueprints'
import { useAuth } from '../contexts/AuthContext'
import {
  canCustomerArchive,
  canFulfillerArchive,
  isArchivedForUser,
  isCompletedStageOrder,
  isOpenOrder,
  orderMatchesTab,
  type OrderListTab,
} from '../lib/orderArchive'
import {
  buyerReputationFromRow,
  fulfillerReputationFromRow,
  type MemberReputationRow,
} from '../lib/reputation'
import {
  archiveCustomOrderWithRating,
  confirmOrderPickup,
  fetchCustomOrders,
  fetchInventory,
  fetchMemberReputations,
  fetchUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateCustomOrderStatus,
  type CustomOrder,
  type CustomOrderStatus,
  type UserNotification,
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
    fulfillment_enabled: false,
    share_personal_resources: false,
  }
}

export default function CustomOrdersRoute() {
  const { user, profile, acquiredBlueprints, siteOrg } = useAuth()
  const [personalStock, setPersonalStock] = useState<Record<string, number>>({})
  const { data: blueprints = [] } = useBlueprintData()
  const { catalog, labelMap, loading: catalogLoading } = useResourceCatalog()
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
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
    const inventoryPromise =
      user?.id && siteOrg?.id
        ? fetchInventory({ scope: 'personal', userId: user.id, orgId: siteOrg.id })
        : Promise.resolve({ data: [] as { resource_key: string; quantity: number }[] })

    const [ordersResult, notificationsResult, inventoryResult] = await Promise.all([
      fetchCustomOrders(),
      fetchUserNotifications(),
      inventoryPromise,
    ])
    if (ordersResult.error) setError(ordersResult.error)
    if (notificationsResult.error) setError(notificationsResult.error)
    setOrders(ordersResult.data)
    setNotifications(notificationsResult.data)

    const stock: Record<string, number> = {}
    inventoryResult.data?.forEach((row) => {
      stock[row.resource_key] = Number(row.quantity)
    })
    setPersonalStock(stock)

    if (user?.id) {
      const repResult = await fetchMemberReputations([user.id])
      if (repResult.error && !ordersResult.error) setError(repResult.error)
      setMyReputation(repResult.data[user.id] ?? null)
    } else {
      setMyReputation(null)
    }

    setLoading(false)
  }, [user?.id, siteOrg?.id])

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

  const handleConfirmPickup = async (orderId: string) => {
    const result = await confirmOrderPickup(orderId)
    if (result.error) {
      setError(result.error)
      return
    }
    setListTab('completed')
    await loadOrders()
  }

  const getAcceptBlockers = (order: CustomOrder): string[] =>
    getOrderAcceptBlockers({
      order,
      acquiredBlueprints,
      personalStock,
      labelMap,
    })

  const handleMarkRead = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await loadOrders()
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
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
  const myFulfillerRep = useMemo(
    () => fulfillerReputationFromRow(myReputation ?? undefined),
    [myReputation]
  )

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status !== 'cancelled' && orderMatchesTab(o, listTab, userId)
      ),
    [orders, listTab, userId]
  )

  const openOrderCount = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled' && isOpenOrder(o) && !isArchivedForUser(o, userId)).length,
    [orders, userId]
  )

  const completedOrderCount = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'cancelled' &&
          isCompletedStageOrder(o) &&
          !isArchivedForUser(o, userId)
      ).length,
    [orders, userId]
  )

  const totalOrderCount = openOrderCount + completedOrderCount
  const unreadCount = notifications.filter((n) => !n.read_at).length

  return (
    <FeaturePageLayout
      title="Custom Orders"
      subtitle="Request crafted items by blueprint — DFP is the required aUEC price for the org"
      badge="Preview"
      actions={
        <>
          <Link
            to="/fulfillment"
            className="px-3 py-1.5 text-sm bg-purple-950/50 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 rounded-lg transition-colors"
          >
            Go to Fulfillment
          </Link>
          <button
            onClick={() => setShowForm((v) => !v)}
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

      {notifications.length > 0 && (
        <div className="mb-6 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-white font-medium text-sm">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-red-600/80 text-white">
                  {unreadCount}
                </span>
              )}
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-xs text-slate-400 hover:text-white"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="space-y-2 max-h-40 overflow-y-auto">
            {notifications.slice(0, 8).map((n) => (
              <li
                key={n.id}
                className={`text-sm rounded-lg px-3 py-2 border ${
                  n.read_at
                    ? 'border-slate-800 text-slate-500'
                    : 'border-purple-500/30 bg-purple-950/20 text-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="text-xs mt-0.5 opacity-80">{n.body}</p>}
                  </div>
                  {!n.read_at && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(n.id)}
                      className="text-xs text-purple-300 shrink-0"
                    >
                      Read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {userId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ReputationBadge label="Your buyer rep" reputation={myBuyerRep} />
          <ReputationBadge label="Your fulfiller rep" reputation={myFulfillerRep} />
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

      {showForm && user?.id && (
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
            const isOwn = order.requester_id === user?.id
            const isAssignee = order.assignee_id === user?.id
            const acceptBlockers =
              order.status === 'pending' && !isOwn ? getAcceptBlockers(order) : []
            const totalDfp = orderTotalDfp(order)
            const blueprintLines = resolveOrderBlueprintLines(order)
            const resourceLines = resolveOrderResourceLines(order)

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
                      {totalDfp > 0 && (
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
                      Requested by{' '}
                      {getDisplayName(profileFromOrderFields(order.requester_id, order.requester))}{' '}
                      · {new Date(order.created_at).toLocaleString()}
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

                    {exceedsSingleTransferLimit(totalDfp) && (
                      <div className="mt-3">
                        <AuecTransferLimitNotice
                          totalAuec={totalDfp}
                          context={isOwn ? 'customer' : 'fulfiller'}
                        />
                      </div>
                    )}

                    {(blueprintLines.length > 0 || resourceLines.length > 0) && (
                      <ul className="mt-3 space-y-1">
                        {blueprintLines.map((line) => (
                          <li
                            key={`${order.id}-bp-${line.blueprintId}-${line.minQuality}-${line.quantity}`}
                            className="text-slate-400 text-xs flex flex-wrap gap-x-2"
                          >
                            <span className="text-slate-300">{line.blueprintTitle}</span>
                            <span>× {line.quantity}</span>
                            <span>· {formatOrderQualityLabel(line.minQuality)}</span>
                            {line.lineDfpAuec > 0 && (
                              <span className="text-amber-300/90">
                                · {formatDfpAuec(line.lineDfpAuec)}
                              </span>
                            )}
                          </li>
                        ))}
                        {resourceLines.map((line) => (
                          <li
                            key={`${order.id}-res-${line.resourceKey}-${line.minQuality}-${line.quantityScu}`}
                            className="text-slate-400 text-xs flex flex-wrap gap-x-2"
                          >
                            <span className="text-slate-300">{line.resourceLabel}</span>
                            <span>· {formatResourceQuantity(line.quantityScu)} SCU</span>
                            <span>· {formatOrderQualityLabel(line.minQuality)}</span>
                            {line.lineDfpAuec > 0 && (
                              <span className="text-amber-300/90">
                                · {formatDfpAuec(line.lineDfpAuec)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-2 flex-wrap justify-end">
                      {order.status === 'pending' && !isOwn && (
                        <Link
                          to="/fulfillment"
                          className="px-2 py-1 text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 rounded"
                        >
                          Accept on Fulfillment →
                        </Link>
                      )}
                      {order.status === 'ready_for_pickup' && isOwn && (
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
                      {canFulfillerArchive(order, userId) && (
                        <button
                          onClick={() =>
                            openArchiveModal(
                              order,
                              'customer',
                              order.requester,
                              order.requester_id
                            )
                          }
                          className="px-2 py-1 text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded"
                        >
                          Archive
                        </button>
                      )}
                      {isAssignee &&
                        (order.status === 'accepted' || order.status === 'in_progress') && (
                          <Link
                            to="/fulfillment"
                            className="px-2 py-1 text-xs bg-purple-950/50 text-purple-300 border border-purple-500/30 rounded"
                          >
                            Open fulfillment →
                          </Link>
                        )}
                      {OPEN_STATUSES.includes(order.status) && (isOwn || isAssignee) && (
                        <button
                          onClick={() => void handleStatusChange(order.id, 'cancelled')}
                          className="px-2 py-1 text-xs bg-slate-800 text-slate-400 border border-slate-600 rounded"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {order.status === 'pending' && !isOwn && totalDfp > 0 && (
                      <p className="text-amber-300/90 text-xs max-w-xs text-right">
                        Customer expects {formatDfpRequiredPrice(totalDfp)}
                      </p>
                    )}
                    {order.status === 'pending' && !isOwn && acceptBlockers.length > 0 && (
                      <p className="text-amber-400/80 text-xs max-w-xs text-right">
                        {acceptBlockers.join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <span
                        key={item.id}
                        className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded border border-slate-600"
                      >
                        {getResourceLabel(item.resource_key, labelMap)} × {item.quantity}
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
