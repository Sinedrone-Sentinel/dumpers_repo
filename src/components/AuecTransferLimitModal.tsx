import React, { useState } from 'react'
import AppModal from './layout/AppModal'
import {
  AUEC_DAILY_TRANSFER_COUNT_MAX,
  AUEC_SINGLE_TRANSFER_MAX,
  formatAuecFull,
} from '../lib/auecTransferLimits'
import { formatDfpRequiredPrice } from '../lib/dfp'

interface AuecTransferLimitModalProps {
  totalAuec: number
  onConfirm: () => void
  onCancel: () => void
  confirming?: boolean
}

export default function AuecTransferLimitModal({
  totalAuec,
  onConfirm,
  onCancel,
  confirming = false,
}: AuecTransferLimitModalProps) {
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <AppModal
      title="In-game payment required"
      onClose={onCancel}
      size="md"
      zIndex={60}
      titleId="auec-transfer-limit-title"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-sm font-medium border border-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!acknowledged || confirming}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
          >
            {confirming ? 'Submitting...' : 'Submit order'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-white text-sm">
          This order total is <strong>{formatDfpRequiredPrice(totalAuec)}</strong>, which is more than the
          commonly reported per-transfer cap in Star Citizen.
        </p>

        <div className="text-sm text-slate-300 space-y-2">
          <p>
            <strong className="text-slate-200">As commonly reported in-game today</strong> (limits may
            change):
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Up to {formatAuecFull(AUEC_SINGLE_TRANSFER_MAX)} per transfer.</li>
            <li>Up to {AUEC_DAILY_TRANSFER_COUNT_MAX} transfers per day per player.</li>
          </ul>
          <p className="text-slate-400 text-xs">
            It is unclear whether the daily cap means five separate payments or up to five million aUEC
            total. Verify current rules in-game — this app does not track or send aUEC.
          </p>
        </div>

        <label className="flex items-start gap-3 p-3 rounded-lg bg-orange-950/30 border border-orange-500/40 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 shrink-0"
          />
          <span className="text-sm text-orange-50 leading-relaxed">
            I understand that exceeding the current game limits on currency transfer means that it is up to
            the <strong>Customer</strong> and <strong>Fulfiller</strong> to come to agreements on when and how
            payment is split across in-game transfers.
          </span>
        </label>
      </div>
    </AppModal>
  )
}
