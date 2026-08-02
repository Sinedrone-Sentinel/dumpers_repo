import { useState } from 'react'
import ListingTypeBadge from './ListingTypeBadge'
import { formatDfpAuec } from '../lib/dfp'
import { formatSlotQualitySummary, isUniformSlotQuality } from '../lib/blueprintQuality'
import { orderListingType } from '../lib/listingType'
import { orderTotalDfp } from '../lib/orderPricing'
import { resourceQuantityUnitLabel } from '../config/resourceTypes'
import { formatQuantityForResource } from '../lib/resourceQuantity'
import {
  removeListingLine,
  updateListingLine,
  type CustomOrder,
  type CustomOrderBlueprint,
  type CustomOrderResourceLine,
} from '../lib/operations'

interface MyListingCardProps {
  order: CustomOrder
  showDfp: boolean
  onChanged: () => void
  onAddItems: () => void
  onDelete: () => void
  onError: (message: string) => void
}

function blueprintQualityLabel(line: CustomOrderBlueprint): string {
  if (!line.slot_qualities || isUniformSlotQuality(line.slot_qualities)) {
    return `Q${line.min_quality}`
  }
  return formatSlotQualitySummary(line.slot_qualities)
}

/**
 * Manages one open Bazaar listing (WTS or WTB container): per-line quantity
 * edits and removal, plus append/close actions. Totals recalc server-side.
 */
export default function MyListingCard({
  order,
  showDfp,
  onChanged,
  onAddItems,
  onDelete,
  onError,
}: MyListingCardProps) {
  const isWts = orderListingType(order) === 'wts'
  const totalDfp = orderTotalDfp(order)
  const bpLines = order.blueprints ?? []
  const resLines = order.resource_lines ?? []
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
  const [busyLineId, setBusyLineId] = useState<string | null>(null)

  const draftFor = (lineId: string, current: number) =>
    qtyDrafts[lineId] ?? String(current)

  const setDraft = (lineId: string, value: string) =>
    setQtyDrafts((prev) => ({ ...prev, [lineId]: value }))

  const clearDraft = (lineId: string) =>
    setQtyDrafts((prev) => {
      const next = { ...prev }
      delete next[lineId]
      return next
    })

  const handleSaveQuantity = async (
    lineId: string,
    kind: 'blueprint' | 'resource',
    current: number
  ) => {
    const raw = draftFor(lineId, current)
    const quantity = Number(raw)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      onError('Quantity must be a positive number.')
      clearDraft(lineId)
      return
    }
    if (quantity === current) {
      clearDraft(lineId)
      return
    }

    setBusyLineId(lineId)
    const result = await updateListingLine(lineId, kind, quantity)
    setBusyLineId(null)
    clearDraft(lineId)

    if (result.error) {
      onError(result.error)
      return
    }
    onChanged()
  }

  const handleRemoveLine = async (lineId: string, kind: 'blueprint' | 'resource') => {
    const isLastLine = bpLines.length + resLines.length === 1
    if (
      isLastLine &&
      !window.confirm('Removing the last item closes this listing. Continue?')
    ) {
      return
    }

    setBusyLineId(lineId)
    const result = await removeListingLine(lineId, kind)
    setBusyLineId(null)

    if (result.error) {
      onError(result.error)
      return
    }
    onChanged()
  }

  const renderLineControls = (
    lineId: string,
    kind: 'blueprint' | 'resource',
    current: number,
    step: string
  ) => {
    const busy = busyLineId === lineId
    const dirty = draftFor(lineId, current) !== String(current)

    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min={step}
          step={step}
          value={draftFor(lineId, current)}
          onChange={(e) => setDraft(lineId, e.target.value)}
          disabled={busy}
          className="site-input w-20 px-2 py-1 text-xs text-right"
        />
        {dirty && (
          <button
            type="button"
            onClick={() => void handleSaveQuantity(lineId, kind, current)}
            disabled={busy}
            className="px-2 py-1 text-xs bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 rounded disabled:opacity-50"
          >
            {busy ? '…' : 'Save'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleRemoveLine(lineId, kind)}
          disabled={busy}
          title="Remove from listing"
          className="site-btn-danger !px-2 !py-1 text-xs"
        >
          Remove
        </button>
      </div>
    )
  }

  const renderBlueprintLine = (line: CustomOrderBlueprint) => (
    <div
      key={line.id}
      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 site-surface"
    >
      <div className="min-w-0">
        <p className="text-white text-sm truncate">
          {line.blueprint_title ?? line.blueprint_id}
        </p>
        <p className="text-slate-500 text-xs">
          {blueprintQualityLabel(line)}
          {showDfp && ` · ${formatDfpAuec(line.line_dfp_auec)}`}
        </p>
      </div>
      {renderLineControls(line.id, 'blueprint', line.quantity, '1')}
    </div>
  )

  const renderResourceLine = (line: CustomOrderResourceLine) => (
    <div
      key={line.id}
      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 site-surface"
    >
      <div className="min-w-0">
        <p className="text-white text-sm truncate">{line.resource_label}</p>
        <p className="text-slate-500 text-xs">
          Q{line.min_quality} ·{' '}
          {formatQuantityForResource(line.resource_key, line.quantity_scu)}{' '}
          {resourceQuantityUnitLabel(line.resource_key)}
          {showDfp && ` · ${formatDfpAuec(line.line_dfp_auec)}`}
        </p>
      </div>
      {renderLineControls(line.id, 'resource', line.quantity_scu, '0.01')}
    </div>
  )

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        isWts
          ? 'bg-cyan-950/15 border-cyan-500/30'
          : 'bg-red-950/15 border-red-500/30'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-white font-medium">
            {isWts ? 'My sell listing' : 'My buy listing'}
          </h3>
          <ListingTypeBadge order={order} />
          {showDfp && totalDfp > 0 && (
            <span className="px-2 py-0.5 rounded text-xs border bg-amber-950/50 text-amber-200 border-amber-500/30 font-medium">
              {formatDfpAuec(totalDfp)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddItems}
            className="px-2 py-1 text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 rounded"
          >
            Add items
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1 text-xs bg-red-950/50 text-red-300 border border-red-500/30 rounded"
          >
            Close listing
          </button>
        </div>
      </div>

      {order.notes && <p className="text-slate-400 text-sm">{order.notes}</p>}

      <div className="space-y-1.5">
        {bpLines.map(renderBlueprintLine)}
        {resLines.map(renderResourceLine)}
        {bpLines.length === 0 && resLines.length === 0 && (
          <p className="text-slate-500 text-sm">No items on this listing.</p>
        )}
      </div>

      <p className="text-slate-500 text-xs">
        {isWts
          ? 'Buyers pick items straight from this listing — each purchase becomes its own transaction below.'
          : 'Fulfillers claim items from this listing — each claim becomes its own transaction below.'}
      </p>
    </div>
  )
}
