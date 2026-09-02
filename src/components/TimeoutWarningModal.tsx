import React, { useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useUiOverlayRegistration } from '../contexts/UiOverlayContext'
import type { TimeoutWarning, TimeoutWarningRole } from '../lib/orderTimeoutWarning'

interface TimeoutWarningModalProps {
  warning: TimeoutWarning
  onAcknowledge: () => Promise<void>
}

function rolePhrase(role: TimeoutWarningRole): string {
  if (role === 'seller') return 'as the seller'
  if (role === 'fulfiller') return 'as the fulfiller'
  return 'as the buyer'
}

export default function TimeoutWarningModal({ warning, onAcknowledge }: TimeoutWarningModalProps) {
  const overlayId = useId()
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useBodyScrollLock(true)
  useUiOverlayRegistration(overlayId, true)

  const handleAck = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onAcknowledge()
    } catch {
      setError('Could not save your acknowledgement. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 site-modal-backdrop">
      <div
        className="relative w-full max-w-lg site-modal-shell overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-red-900/30 to-slate-900 site-divider">
          <h2 id={titleId} className="text-lg font-semibold text-white">
            You missed a trade deadline
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            72-hour limit missed {rolePhrase(warning.roleLabel)}
          </p>
        </div>
        <div className="p-6 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            Missing a deadline wastes other members&apos; time and the materials they reserved or
            crafted for the trade. Be mindful of every trade you start or accept.
          </p>
          <p>
            If you have not already, set a{' '}
            <Link to="/discord-subscribe" className="text-orange-400 hover:text-orange-300 underline">
              personal Discord webhook
            </Link>{' '}
            so buyer and seller alerts reach you even when you are away from the site.
          </p>
          <p>
            Repeated ghosting on an order — whether you are the buyer, seller, or fulfiller — can
            lead to an account ban. Read{' '}
            <a href="/archive#site-rules" className="text-orange-400 hover:text-orange-300 underline">
              Site Rules
            </a>{' '}
            and{' '}
            <a href="/archive#order-rules" className="text-orange-400 hover:text-orange-300 underline">
              Order System Rules
            </a>
            .
          </p>
          {error ? <p className="site-error-text">{error}</p> : null}
        </div>
        <div className="p-4 border-t border-orange-500/15 bg-black/20">
          <button
            type="button"
            onClick={() => void handleAck()}
            disabled={busy}
            className="site-btn-primary w-full !px-4 !py-2 text-sm font-medium"
          >
            {busy ? 'Saving…' : 'I understand'}
          </button>
        </div>
      </div>
    </div>
  )
}
