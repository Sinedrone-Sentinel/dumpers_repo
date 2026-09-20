import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import ResourceQuantityInput from '../ResourceQuantityInput'
import { applyStockCardListing } from '../../lib/applyStockCardListing'
import { parseQuantityForResource } from '../../lib/resourceQuantity'
import { resourceQuantityUnitLabel } from '../../config/resourceTypes'
import type { StockCardListingType } from '../../lib/stockCardListing'

type Props = {
  userId: string
  resourceKey: string
  resourceLabel: string
  quality: number
  lineKey: string
  canList: boolean
  rsiVerified: boolean
  listingEdit: { lineKey: string; type: StockCardListingType } | null
  listingQty: string
  onOpen: (type: StockCardListingType) => void
  onQtyChange: (value: string) => void
  onCancel: () => void
}

function gateTitle(canList: boolean, rsiVerified: boolean): string | undefined {
  if (!canList) return 'Approved members can post listings.'
  if (!rsiVerified) return 'Link Citizen iD in Settings to post listings.'
  return undefined
}

export default function StockCardListingShortcut({
  userId,
  resourceKey,
  resourceLabel,
  quality,
  lineKey,
  canList,
  rsiVerified,
  listingEdit,
  listingQty,
  onOpen,
  onQtyChange,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const qtyUnit = resourceQuantityUnitLabel(resourceKey)
  const gated = !canList || !rsiVerified
  const gate = gateTitle(canList, rsiVerified)
  const active = listingEdit?.lineKey === lineKey ? listingEdit.type : null
  const parsedQty = parseQuantityForResource(resourceKey, listingQty)
  const canFinish = !busy && parsedQty != null && parsedQty > 0

  const finish = async () => {
    if (!active || parsedQty == null || parsedQty <= 0) return
    setBusy(true)
    setFeedback(null)
    const result = await applyStockCardListing({
      userId,
      listingType: active,
      resourceKey,
      resourceLabel,
      minQuality: quality,
      quantityScu: parsedQty,
    })
    setBusy(false)
    if (!result.ok) {
      setFeedback({ ok: false, text: result.error ?? 'Could not update listing.' })
      return
    }
    const label = active.toUpperCase()
    const base =
      result.action === 'set'
        ? `${label} updated`
        : `Added to your ${label} listing`
    const text = result.deductError
      ? `${base}. Could not turn on deduct from Tracked Resources: ${result.deductError}`
      : base
    setFeedback({ ok: true, text })
    onCancel()
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      {active ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <ResourceQuantityInput
            resourceKey={resourceKey}
            value={listingQty}
            onValueChange={onQtyChange}
            className="site-input w-28 px-2 py-1 text-xs tabular-nums"
            aria-label={`${active.toUpperCase()} quantity`}
          />
          <span className="text-slate-500 text-xs">{qtyUnit}</span>
          <button
            type="button"
            disabled={!canFinish}
            onClick={() => void finish()}
            className="px-2 py-1 text-xs site-btn-success"
          >
            {busy ? '…' : 'Finish'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setFeedback(null)
              onCancel()
            }}
            className="px-2 py-1 text-xs text-slate-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={gated}
            title={gate}
            onClick={() => {
              setFeedback(null)
              onOpen('wts')
            }}
            className="flex-1 min-w-0 px-2 py-1 text-xs site-btn-accent site-btn-shimmer"
          >
            WTS
          </button>
          <button
            type="button"
            disabled={gated}
            title={gate}
            onClick={() => {
              setFeedback(null)
              onOpen('wtb')
            }}
            className="flex-1 min-w-0 px-2 py-1 text-xs site-btn-danger site-btn-shimmer"
          >
            WTB
          </button>
        </div>
      )}
      {feedback ? (
        <p className={`text-[11px] leading-snug ${feedback.ok ? 'text-emerald-300' : 'site-error-text'}`}>
          {feedback.text}
          {feedback.ok ? (
            <>
              {' '}
              <Link to="/orders" className="text-sky-400 underline-offset-2 hover:underline">
                My Listings
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

