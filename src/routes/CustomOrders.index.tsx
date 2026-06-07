import React, { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitNotice from '../components/AuecTransferLimitNotice'
import ResourceBuyOrderPanel from '../components/ResourceBuyOrderPanel'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel } from '../lib/blueprintResources'
import { formatDfpAuec, formatDfpRequiredPrice, formatOrderQualityLabel } from '../lib/dfp'
import {
  orderBlueprintIds,
  orderTotalDfp,
  resolveOrderBlueprintLines,
  resolveOrderResourceLines,
} from '../lib/orderPricing'
import { formatResourceQuantity } from '../lib/resourceQuantity'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { useBlueprintData } from './blueprints'
import { useAuth } from '../contexts/AuthContext'
import {
  acceptCustomOrder,
  confirmOrderPickup,
  fetchCustomOrders,
  fetchInventory,
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
  cancelled: 'bg-slate-800 text-slate-400 border-slate-600',
}

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

  const handleAccept = async (orderId: string) => {
    const result = await acceptCustomOrder(orderId)
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
    await loadOrders()
  }

  const getAcceptBlockers = (order: CustomOrder): string[] => {
    const blockers: string[] = []
    for (const bpId of orderBlueprintIds(order)) {
      if (!acquiredBlueprints[bpId]) {
        blockers.push(`Missing blueprint: ${bpId}`)
      }
    }
    for (const item of order.items ?? []) {
      const have = personalStock[item.resource_key] ?? 0
      if (have < Number(item.quantity)) {
        blockers.push(
          `Need ${getResourceLabel(item.resource_key, labelMap)} × ${item.quantity} (have ${have})`
        )
      }
    }
    return blockers
  }

  const handleMarkRead = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await loadOrders()
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    await loadOrders()
  }

  const openOrders = orders.filter((o) => OPEN_STATUSES.includes(o.status))
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Open orders</p>
          <p className="text-2xl font-bold text-amber-300 mt-1">{openOrders.length}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Total orders</p>
          <p className="text-2xl font-bold text-white mt-1">{orders.length}</p>
        </div>
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
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
          <p className="text-slate-400">No orders yet. Create a blueprint-linked request to test.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isOwn = order.requester_id === user?.id
            const isAssignee = order.assignee_id === user?.id
            const acceptBlockers = getAcceptBlockers(order)
            const canAccept =
              order.status === 'pending' && !isOwn && acceptBlockers.length === 0
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
                        <button
                          onClick={() => void handleAccept(order.id)}
                          disabled={!canAccept}
                          title={
                            acceptBlockers.length > 0 ? acceptBlockers.join('; ') : undefined
                          }
                          className="px-2 py-1 text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Accept order
                        </button>
                      )}
                      {order.status === 'ready_for_pickup' && isOwn && (
                        <button
                          onClick={() => void handleConfirmPickup(order.id)}
                          className="px-2 py-1 text-xs bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 rounded"
                        >
                          Confirm pickup
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
    </FeaturePageLayout>
  )
}
