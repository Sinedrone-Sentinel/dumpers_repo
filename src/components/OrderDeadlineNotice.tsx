import React from 'react'
import type { CustomOrder } from '../lib/operations'
import {
  deadlineFromStart,
  formatHoursRemaining,
  hoursRemaining,
} from '../lib/orderDeadlines'

interface OrderDeadlineNoticeProps {
  order: CustomOrder
  role: 'buyer' | 'fulfiller' | 'seller'
}

function myArchivedAt(
  order: CustomOrder,
  role: 'buyer' | 'fulfiller' | 'seller'
): string | null | undefined {
  if (role === 'buyer') {
    return order.listing_type === 'wts' ? order.fulfiller_archived_at : order.requester_archived_at
  }
  if (role === 'seller') {
    return order.requester_archived_at
  }
  return order.fulfiller_archived_at
}

function otherArchivedAt(
  order: CustomOrder,
  role: 'buyer' | 'fulfiller' | 'seller'
): string | null | undefined {
  if (role === 'buyer') {
    return order.listing_type === 'wts' ? order.requester_archived_at : order.fulfiller_archived_at
  }
  if (role === 'seller') {
    return order.fulfiller_archived_at
  }
  return order.requester_archived_at
}

export default function OrderDeadlineNotice({ order, role }: OrderDeadlineNoticeProps) {
  if (order.dispute_opened_at) {
    return (
      <div className="mt-2 p-2 rounded-lg bg-amber-900/30 border border-amber-500/30 text-amber-200 text-xs">
        Under review — pickup timer paused. An officer will resolve this dispute.
      </div>
    )
  }

  if (
    (role === 'fulfiller' || role === 'seller') &&
    ['accepted', 'in_progress'].includes(order.status) &&
    order.accepted_at
  ) {
    const deadline = deadlineFromStart(order.accepted_at, 72)
    const hours = hoursRemaining(deadline)
    if (hours === null) return null
    const urgent = hours <= 12
    return (
      <div
        className={`mt-2 p-2 rounded-lg text-xs border ${
          urgent
            ? 'bg-red-900/30 border-red-500/40 text-red-300'
            : 'bg-blue-900/20 border-blue-500/30 text-blue-300'
        }`}
      >
        Mark ready within {formatHoursRemaining(hours)} or the order releases back to the pool.
      </div>
    )
  }

  if (order.status === 'ready_for_pickup' && order.ready_at) {
    const deadline = deadlineFromStart(order.ready_at, 72)
    const hours = hoursRemaining(deadline)
    if (hours === null) return null
    const urgent = hours <= 12
    const buyerCopy =
      hours === 0
        ? 'Pickup deadline expired — this order will auto-complete shortly (you may receive a strike).'
        : `Confirm pickup within ${formatHoursRemaining(hours)} or the order auto-completes (you may receive a strike).`
    const sellerCopy =
      hours === 0
        ? 'Customer pickup deadline expired — this order will auto-complete shortly.'
        : `Customer has ${formatHoursRemaining(hours)} to confirm pickup, or this auto-completes.`
    return (
      <div
        className={`mt-2 p-2 rounded-lg text-xs border ${
          urgent
            ? 'bg-red-900/30 border-red-500/40 text-red-300'
            : 'bg-cyan-900/20 border-cyan-500/30 text-cyan-300'
        }`}
      >
        {role === 'buyer' ? buyerCopy : sellerCopy}
      </div>
    )
  }

  if (order.status === 'completed') {
    const myArchived = myArchivedAt(order, role)
    const otherArchived = otherArchivedAt(order, role)

    if (myArchived) return null

    if (otherArchived) {
      const deadline = deadlineFromStart(otherArchived, 24)
      const hours = hoursRemaining(deadline)
      if (hours === null) return null
      return (
        <div className="mt-2 p-2 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-300 text-xs">
          They already rated — archive &amp; rate within {formatHoursRemaining(hours)} or a 5-star
          rating is auto-applied on your behalf.
        </div>
      )
    }

    if (order.completed_at) {
      return (
        <div className="mt-2 p-2 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-300 text-xs">
          Click <strong className="text-purple-100">Archive &amp; rate</strong> to finish this
          order. If the other party rates first, you have 24 hours to rate or a 5-star rating is
          auto-applied on your behalf.
        </div>
      )
    }
  }

  return null
}
