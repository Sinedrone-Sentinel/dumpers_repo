import React from 'react'
import type { CustomOrder } from '../lib/operations'
import {
  deadlineFromStart,
  formatHoursRemaining,
  hoursRemaining,
} from '../lib/orderDeadlines'

interface OrderDeadlineNoticeProps {
  order: CustomOrder
  role: 'buyer' | 'fulfiller'
}

export default function OrderDeadlineNotice({ order, role }: OrderDeadlineNoticeProps) {
  if (order.dispute_opened_at) {
    return (
      <div className="mt-2 p-2 rounded-lg bg-amber-900/30 border border-amber-500/30 text-amber-200 text-xs">
        Under review — pickup timer paused. An officer will resolve this dispute.
      </div>
    )
  }

  if (role === 'fulfiller' && ['accepted', 'in_progress'].includes(order.status) && order.accepted_at) {
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

  if (role === 'buyer' && order.status === 'ready_for_pickup' && order.ready_at) {
    const deadline = deadlineFromStart(order.ready_at, 72)
    const hours = hoursRemaining(deadline)
    if (hours === null) return null
    const urgent = hours <= 12
    return (
      <div
        className={`mt-2 p-2 rounded-lg text-xs border ${
          urgent
            ? 'bg-red-900/30 border-red-500/40 text-red-300'
            : 'bg-cyan-900/20 border-cyan-500/30 text-cyan-300'
        }`}
      >
        Confirm pickup within {formatHoursRemaining(hours)} or the order auto-completes (you may
        receive a strike).
      </div>
    )
  }

  if (order.status === 'completed') {
    const myArchived =
      role === 'buyer' ? order.requester_archived_at : order.fulfiller_archived_at
    const otherArchived =
      role === 'buyer' ? order.fulfiller_archived_at : order.requester_archived_at

    if (myArchived) return null

    if (otherArchived) {
      const deadline = deadlineFromStart(otherArchived, 24)
      const hours = hoursRemaining(deadline)
      if (hours === null) return null
      return (
        <div className="mt-2 p-2 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-300 text-xs">
          Rate within {formatHoursRemaining(hours)} or a 5-star rating is auto-applied on your
          behalf.
        </div>
      )
    }

    if (order.completed_at) {
      return (
        <div className="mt-2 p-2 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-300 text-xs">
          Rate this order when you archive. If the other party rates first, you have 24 hours to rate
          or a 5-star rating is auto-applied on your behalf.
        </div>
      )
    }
  }

  return null
}
