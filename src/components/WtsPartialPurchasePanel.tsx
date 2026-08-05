import React, { useMemo, useState } from 'react'
import { formatDfpAuec, formatResourceOrderQualityLabel } from '../lib/dfp'
import {
  isWholeUnitResource,
  resourceLabelClassName,
  resourceQuantityUnitLabel,
} from '../config/resourceTypes'
import { formatQuantityForResource } from '../lib/resourceQuantity'
import type { CustomOrder } from '../lib/operations'

export interface WtsLineSelection {
  lineId: string
  kind: 'blueprint' | 'resource'
  quantity: number
}

interface PartialSelectionPanelProps {
  order: CustomOrder
  /** 'buy' = purchasing from a WTS listing; 'fulfill' = crafting for a WTB listing. */
  mode?: 'buy' | 'fulfill'
  /** Fulfill mode: blueprint lines you do not own are disabled. */
  acquiredBlueprints?: Record<string, boolean>
  showDfp?: boolean
  disabled?: boolean
  submitting?: boolean
  onPurchase: (selections: WtsLineSelection[]) => void | Promise<void>
  className?: string
}

export default function WtsPartialPurchasePanel({
  order,
  mode = 'buy',
  acquiredBlueprints,
  showDfp = true,
  disabled = false,
  submitting = false,
  onPurchase,
  className = '',
}: PartialSelectionPanelProps) {
  const isFulfill = mode === 'fulfill'

  const blueprintLines = useMemo(
    () =>
      [...(order.blueprints ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => ({
          lineId: row.id,
          blueprintId: row.blueprint_id,
          title: row.blueprint_title ?? row.blueprint_id,
          available: row.quantity,
          unitDfpAuec: Number(row.unit_dfp_auec),
          isBlueprint: true as const,
        })),
    [order.blueprints]
  )

  const resourceLines = useMemo(
    () =>
      [...(order.resource_lines ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => ({
          lineId: row.id,
          title: row.resource_label,
          resourceKey: row.resource_key,
          minQuality: row.min_quality,
          available: Number(row.quantity_scu),
          unitDfpAuec: Number(row.unit_dfp_auec),
          isBlueprint: false as const,
        })),
    [order.resource_lines]
  )

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [quantities, setQuantities] = useState<Record<string, string>>({})

  const canSelectBlueprint = (blueprintId: string) =>
    !isFulfill || !acquiredBlueprints || acquiredBlueprints[blueprintId] === true

  const resourceQtyForLine = (line: (typeof resourceLines)[number]) => {
    // SCU ores/salvage/etc.: always the full remaining line (cannot split refined cargo).
    if (!isWholeUnitResource(line.resourceKey)) return line.available
    return Math.min(
      line.available,
      Math.max(1, Math.trunc(Number(quantities[line.lineId]) || 0))
    )
  }

  const toggleLine = (lineId: string, defaultQty: number, wholeUnit = true) => {
    setSelected((prev) => {
      const next = { ...prev, [lineId]: !prev[lineId] }
      if (next[lineId] && quantities[lineId] == null && wholeUnit) {
        setQuantities((q) => ({
          ...q,
          [lineId]: String(
            defaultQty === Math.trunc(defaultQty) ? Math.min(1, defaultQty) || 1 : defaultQty
          ),
        }))
      }
      return next
    })
  }

  const selectionTotal = useMemo(() => {
    let total = 0
    for (const line of blueprintLines) {
      if (!selected[line.lineId]) continue
      const qty = Math.min(
        line.available,
        Math.max(1, Math.trunc(Number(quantities[line.lineId]) || 0))
      )
      total += line.unitDfpAuec * qty
    }
    for (const line of resourceLines) {
      if (!selected[line.lineId]) continue
      const qty = resourceQtyForLine(line)
      total += Math.round(line.unitDfpAuec * qty)
    }
    return total
  }, [blueprintLines, resourceLines, selected, quantities])

  const buildSelections = (): WtsLineSelection[] => {
    const out: WtsLineSelection[] = []
    for (const line of blueprintLines) {
      if (!selected[line.lineId]) continue
      const qty = Math.min(
        line.available,
        Math.max(1, Math.trunc(Number(quantities[line.lineId]) || 0))
      )
      out.push({ lineId: line.lineId, kind: 'blueprint', quantity: qty })
    }
    for (const line of resourceLines) {
      if (!selected[line.lineId]) continue
      out.push({
        lineId: line.lineId,
        kind: 'resource',
        quantity: resourceQtyForLine(line),
      })
    }
    return out
  }

  const qtyVerb = isFulfill ? 'Crafting' : 'Buying'

  return (
    <div
      className={`p-3 rounded-lg border border-cyan-500/30 bg-cyan-950/20 flex flex-col gap-3 min-w-0 ${className}`.trim()}
    >
      <div className="shrink-0">
        <p className="text-cyan-200 text-xs font-medium">
          {isFulfill ? 'Select items to fulfill' : 'Partial purchase available'}
        </p>
        <p className="site-hint text-[11px] !mt-0.5">
          {isFulfill
            ? 'Check the lines you will supply. Whole-unit items can use a quantity; SCU resources are always the full listed amount (refined cargo cannot be split). Unclaimed lines stay open for others.'
            : 'Check the lines you want. Whole-unit items can use a quantity; SCU resources are always the full listed amount (refined cargo cannot be split). Unsold lines stay listed.'}
        </p>
      </div>

      <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
        {blueprintLines.map((line) => {
          const isOn = !!selected[line.lineId]
          const selectable = canSelectBlueprint(line.blueprintId)
          return (
            <div
              key={line.lineId}
              className={`rounded-lg border p-2.5 ${
                isOn
                  ? 'border-cyan-500/40 site-surface'
                  : 'site-surface'
              } ${!selectable ? 'opacity-60' : ''}`}
            >
              <label className={`flex items-start gap-2 ${selectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!selectable}
                  onChange={() => toggleLine(line.lineId, 1)}
                  className="site-checkbox mt-1 accent-cyan-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-white text-sm font-medium">{line.title}</span>
                    <span className="text-slate-500 text-xs">
                      {line.available} {isFulfill ? 'requested' : 'listed'}
                      {showDfp && line.unitDfpAuec > 0 && (
                        <span className="text-amber-300/80 ml-1">
                          · {formatDfpAuec(line.unitDfpAuec)}/ea
                        </span>
                      )}
                    </span>
                  </div>
                  {!selectable && (
                    <p className="text-amber-400/80 text-[11px] mt-1">
                      You need this blueprint to fulfill this line.
                    </p>
                  )}
                  {isOn && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-slate-500 text-xs">{qtyVerb}</span>
                      <input
                        type="number"
                        min={1}
                        max={line.available}
                        value={quantities[line.lineId] ?? '1'}
                        onChange={(e) =>
                          setQuantities((q) => ({ ...q, [line.lineId]: e.target.value }))
                        }
                        className="site-input w-20 px-2 py-1 text-sm"
                      />
                      <span className="text-slate-500 text-xs">of {line.available}</span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          )
        })}

        {resourceLines.map((line) => {
          const isOn = !!selected[line.lineId]
          const wholeUnit = isWholeUnitResource(line.resourceKey)
          return (
            <div
              key={line.lineId}
              className={`rounded-lg border p-2.5 ${
                isOn ? 'border-cyan-500/40 site-surface' : 'site-surface'
              }`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggleLine(line.lineId, line.available, wholeUnit)}
                  className="site-checkbox mt-1 accent-cyan-500"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className={`text-sm ${resourceLabelClassName(line.resourceKey)}`}>
                      {line.title}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {formatQuantityForResource(line.resourceKey, line.available)}{' '}
                      {resourceQuantityUnitLabel(line.resourceKey)}{' '}
                      {isFulfill ? 'requested' : 'listed'} ·{' '}
                      {formatResourceOrderQualityLabel(line.resourceKey, line.title, line.minQuality)}
                      {!wholeUnit && (
                        <span className="text-slate-400 ml-1">(full line only)</span>
                      )}
                    </span>
                  </div>
                  {isOn && wholeUnit && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-slate-500 text-xs">{qtyVerb}</span>
                      <input
                        type="number"
                        min={1}
                        max={line.available}
                        step={1}
                        value={quantities[line.lineId] ?? '1'}
                        onChange={(e) =>
                          setQuantities((q) => ({ ...q, [line.lineId]: e.target.value }))
                        }
                        className="site-input w-24 px-2 py-1 text-sm"
                      />
                      <span className="text-slate-500 text-xs">of {line.available}</span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-cyan-500/20 shrink-0 mt-auto">
        {showDfp && (
          <p className="text-amber-200 text-sm">
            Selected total: <span className="font-medium">{formatDfpAuec(selectionTotal)}</span>
          </p>
        )}
        <button
          type="button"
          disabled={disabled || submitting || selectionTotal <= 0}
          onClick={() => {
            const selections = buildSelections()
            if (selections.length === 0) return
            void onPurchase(selections)
          }}
          className="px-3 py-1.5 text-xs bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 rounded disabled:opacity-40 shrink-0"
        >
          {submitting
            ? isFulfill
              ? 'Claiming...'
              : 'Purchasing...'
            : isFulfill
              ? 'Fulfill selected items'
              : 'Buy selected items'}
        </button>
      </div>
    </div>
  )
}
