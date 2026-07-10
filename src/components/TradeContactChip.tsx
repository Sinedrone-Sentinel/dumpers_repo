import React from 'react'
import { displayNameFromFields } from '../lib/supabase'

export type TradeContactRole = 'buyer' | 'seller' | 'fulfiller' | 'customer'

const ROLE_LABELS: Record<TradeContactRole, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  fulfiller: 'Fulfiller',
  customer: 'Customer',
}

interface TradeContactChipProps {
  role: TradeContactRole
  profile?: {
    rsi_handle: string | null
    display_name: string | null
    email: string | null
  } | null
  compact?: boolean
  /** Single-line chip for dense order rows. */
  inline?: boolean
  className?: string
}

export default function TradeContactChip({
  role,
  profile,
  compact = false,
  inline = false,
  className = '',
}: TradeContactChipProps) {
  const inGameName = profile?.rsi_handle
  const fallbackName = displayNameFromFields(profile)

  if (inline) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-600 bg-slate-800/70 text-xs ${className}`}
      >
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
          {ROLE_LABELS[role]}
        </span>
        <span className="font-mono font-semibold text-cyan-300">
          {inGameName ?? fallbackName}
        </span>
      </span>
    )
  }

  return (
    <div
      className={`inline-flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-600 ${className}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
          {ROLE_LABELS[role]}
        </span>
        <span className="text-sm font-semibold font-mono text-cyan-300">
          {inGameName ?? fallbackName}
        </span>
      </div>
      {!inGameName && (
        <span className="text-[10px] text-slate-500">No in-game name on file</span>
      )}
      {!compact && (
        <span className="text-[10px] text-slate-500">Add in-game to coordinate pickup</span>
      )}
    </div>
  )
}
