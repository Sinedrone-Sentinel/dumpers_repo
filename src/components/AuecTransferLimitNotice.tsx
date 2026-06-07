import React from 'react'
import {
  AUEC_DAILY_TRANSFER_COUNT_MAX,
  AUEC_SINGLE_TRANSFER_MAX,
  formatAuecFull,
} from '../lib/auecTransferLimits'

interface AuecTransferLimitNoticeProps {
  totalAuec: number
  /** customer = placing order; fulfiller = accepting/completing work */
  context: 'customer' | 'fulfiller'
  compact?: boolean
}

export default function AuecTransferLimitNotice({
  totalAuec,
  context,
  compact = false,
}: AuecTransferLimitNoticeProps) {
  if (totalAuec <= AUEC_SINGLE_TRANSFER_MAX) return null

  const partner = context === 'customer' ? 'fulfiller' : 'customer'

  if (compact) {
    return (
      <p className="text-orange-300 text-xs font-medium mt-1">
        Over 1M DFP — arrange multiple in-game payments with your {partner}. This app does not
        track transfers.
      </p>
    )
  }

  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-orange-500/60 bg-orange-950/40 p-4 space-y-3"
    >
      <div>
        <p className="text-orange-200 font-bold text-sm uppercase tracking-wide">
          In-game payment — heads up
        </p>
        <p className="text-orange-100 text-sm mt-1">
          This order is <strong>{formatAuecFull(totalAuec)}</strong> (DFP required), which is more
          than you can send in a single Star Citizen player transfer.
        </p>
      </div>

      <div className="text-sm text-orange-50/95 space-y-2">
        <p>
          <strong>As commonly reported in-game today</strong> (limits may change):
        </p>
        <ul className="list-disc list-inside pl-1 space-y-1">
          <li>
            Up to <strong>{formatAuecFull(AUEC_SINGLE_TRANSFER_MAX)}</strong> per transfer.
          </li>
          <li>
            Up to <strong>{AUEC_DAILY_TRANSFER_COUNT_MAX} transfers per day</strong> per player.
          </li>
        </ul>
        <p>
          It is <strong>unclear</strong> whether the daily cap means five separate payments (each up
          to 1M) or up to five million aUEC total if every payment is maxed. Check in-game or with
          your org — do not rely on this site for current RSI rules.
        </p>
      </div>

      <p className="text-sm text-orange-50 rounded-lg bg-orange-900/30 border border-orange-500/30 px-3 py-2">
        {context === 'customer'
          ? 'You and your fulfiller need to agree how to pay the full DFP total across multiple in-game transfers before pickup.'
          : 'The customer may need multiple in-game transfers to pay the full DFP total. Agree on timing with them before pickup.'}
      </p>

      <p className="text-xs text-orange-200/80">
        Dumpers Repo only records the full DFP price. All aUEC payments happen in-game — this app does
        not send, split, or track transfers.
      </p>
    </div>
  )
}
