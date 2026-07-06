import React, { useCallback, useEffect, useState } from 'react'
import { BP_DUMPER_CALLOUT_DISMISS_KEY } from '../../config/bpDumper'

interface BpDumperCalloutProps {
  onOpenModal: () => void
  className?: string
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(BP_DUMPER_CALLOUT_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function BpDumperCallout({ onOpenModal, className = '' }: BpDumperCalloutProps) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(readDismissed())
  }, [])

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(BP_DUMPER_CALLOUT_DISMISS_KEY, '1')
    } catch {
      // ignore storage failures
    }
    setDismissed(true)
  }, [])

  if (dismissed) return null

  return (
    <div
      className={`mb-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-100 text-sm ${className}`}
    >
      <div className="flex-1 min-w-0">
        <strong className="text-amber-50">BP Dumper + Live Tracker</strong>
        {' — '}
        Run BP Dumper while you play, then open Live Tracker to see active missions and pool
        blueprints still to acquire.
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenModal}
          className="px-3 py-1.5 rounded-lg text-xs font-medium site-btn-shimmer site-filter-selected-amber whitespace-nowrap"
        >
          Get BP Dumper
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          aria-label="Dismiss BP Dumper notice"
        >
          ×
        </button>
      </div>
    </div>
  )
}
