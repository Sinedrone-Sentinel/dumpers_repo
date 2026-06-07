import React, { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { getResourceLabel } from '../lib/blueprintResources'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { useAuth } from '../contexts/AuthContext'
import {
  createCustomOrder,
  fetchCustomOrders,
  updateCustomOrderStatus,
  type CustomOrder,
  type CustomOrderStatus,
} from '../lib/operations'
import { getDisplayName } from '../lib/supabase'

const STATUS_STYLES: Record<CustomOrderStatus, string> = {
  pending: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
  in_progress: 'bg-blue-950/50 text-blue-300 border-blue-500/30',
  fulfilled: 'bg-green-950/50 text-green-300 border-green-500/30',
  cancelled: 'bg-slate-800 text-slate-400 border-slate-600',
}

interface DraftLineItem {
  resourceKey: string
  quantity: string
}

export default function CustomOrdersRoute() {
  const { user, profile } = useAuth()
  const { catalog, labelMap, loading: catalogLoading } = useResourceCatalog({ syncOnLoad: true })
  const [orders, setOrders] = useState<CustomOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([{ resourceKey: '', quantity: '1' }])
  const [submitting, setSubmitting] = useState(false)

  const defaultResourceKey = catalog[0]?.resource_key ?? ''

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchCustomOrders()
    if (fetchError) setError(fetchError)
    setOrders(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  useEffect(() => {
    if (!defaultResourceKey) return
    setLineItems((items) =>
      items.map((item) =>
        item.resourceKey === '' ? { ...item, resourceKey: defaultResourceKey } : item
      )
    )
  }, [defaultResourceKey])

  const addLineItem = () => {
    setLineItems((items) => [
      ...items,
      { resourceKey: defaultResourceKey, quantity: '1' },
    ])
  }

  const updateLineItem = (index: number, patch: Partial<DraftLineItem>) => {
    setLineItems((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    )
  }

  const removeLineItem = (index: number) => {
    setLineItems((items) => items.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title is required')
      return
    }

    const parsedItems = lineItems
      .map((item) => ({
        resourceKey: item.resourceKey,
        quantity: Number(item.quantity),
      }))
      .filter((item) => item.resourceKey && item.quantity > 0)

    if (parsedItems.length === 0) {
      setError('Add at least one resource line item')
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await createCustomOrder({
      requesterId: user.id,
      title: trimmedTitle,
      notes,
      items: parsedItems,
    })

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setTitle('')
    setNotes('')
    setLineItems([{ resourceKey: defaultResourceKey, quantity: '1' }])
    setShowForm(false)
    await loadOrders()
  }

  const handleStatusChange = async (orderId: string, status: CustomOrderStatus) => {
    const result = await updateCustomOrderStatus(orderId, status)
    if (result.error) {
      setError(result.error)
      return
    }
    await loadOrders()
  }

  const openOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_progress')

  return (
    <FeaturePageLayout
      title="Custom Orders"
      subtitle="Request crafting orders tied to org resource inventory"
      badge="Super-admin preview"
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

      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mb-6 bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-4"
        >
          <h2 className="text-white font-medium">Create custom order</h2>
          <p className="text-slate-500 text-xs">
            Preview mode: orders are created under your account ({getDisplayName(profile)}).
          </p>

          <div>
            <label className="block text-slate-400 text-sm mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cutlass Black upgrade package"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-400 text-sm">Required resources</label>
              <button
                type="button"
                onClick={addLineItem}
                className="text-xs text-red-400 hover:text-red-300"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    value={item.resourceKey}
                    onChange={(e) => updateLineItem(index, { resourceKey: e.target.value })}
                    className="flex-1 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    {catalog.map((resource) => (
                      <option key={resource.resource_key} value={resource.resource_key}>
                        {resource.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, { quantity: e.target.value })}
                    className="w-24 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                  />
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="px-2 text-slate-500 hover:text-red-400"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {submitting ? 'Submitting...' : 'Submit order'}
          </button>
        </form>
      )}

      {(loading || catalogLoading) ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
          <p className="text-slate-400">No custom orders yet. Create one to test the flow.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-slate-900/60 border border-slate-700 rounded-xl p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-white font-medium">{order.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs border ${STATUS_STYLES[order.status]}`}
                    >
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    Requested by{' '}
                    {getDisplayName(
                      order.requester
                        ? {
                            id: order.requester_id,
                            rsi_handle: order.requester.rsi_handle,
                            display_name: order.requester.display_name,
                            email: order.requester.email,
                            avatar_url: null,
                            role: 'member',
                            created_at: '',
                            approved_at: null,
                            approved_by: null,
                            ghost_mode: false,
                          }
                        : null
                    )}{' '}
                    · {new Date(order.created_at).toLocaleString()}
                  </p>
                  {order.notes && <p className="text-slate-400 text-sm mt-2">{order.notes}</p>}
                </div>

                {(order.status === 'pending' || order.status === 'in_progress') && (
                  <div className="flex gap-2 flex-wrap">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => void handleStatusChange(order.id, 'in_progress')}
                        className="px-2 py-1 text-xs bg-blue-950/50 text-blue-300 border border-blue-500/30 rounded"
                      >
                        Mark in progress
                      </button>
                    )}
                    <button
                      onClick={() => void handleStatusChange(order.id, 'cancelled')}
                      className="px-2 py-1 text-xs bg-slate-800 text-slate-400 border border-slate-600 rounded"
                    >
                      Cancel
                    </button>
                    <Link
                      to="/fulfillment"
                      className="px-2 py-1 text-xs bg-purple-950/50 text-purple-300 border border-purple-500/30 rounded"
                    >
                      Fulfill →
                    </Link>
                  </div>
                )}
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
          ))}
        </div>
      )}
    </FeaturePageLayout>
  )
}
