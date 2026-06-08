import React, { useMemo } from 'react'
import {
  formatBlueprintOrderQualityLabel,
  formatDfpAuec,
  formatResourceOrderQualityLabel,
} from '../lib/dfp'
import {
  buildOrderTitle,
  resolveOrderBlueprintLines,
  resolveOrderResourceLines,
} from '../lib/orderPricing'
import { formatResourceQuantity } from '../lib/resourceQuantity'
import type { CustomOrder } from '../lib/operations'

interface OrderRequestLinesProps {
  order: CustomOrder
  showDfp?: boolean
}

export function orderKindLabel(order: CustomOrder): string {
  const bpCount = resolveOrderBlueprintLines(order).length
  const resCount = resolveOrderResourceLines(order).length
  return buildOrderTitle(bpCount, resCount)
}

export default function OrderRequestLines({ order, showDfp = true }: OrderRequestLinesProps) {
  const blueprintLines = useMemo(() => resolveOrderBlueprintLines(order), [order])
  const resourceLines = useMemo(() => resolveOrderResourceLines(order), [order])

  if (blueprintLines.length === 0 && resourceLines.length === 0) return null

  const kind = orderKindLabel(order)
  const isMixed = blueprintLines.length > 0 && resourceLines.length > 0

  return (
    <div className="space-y-1.5">
      <span
        className={`inline-block px-2 py-0.5 rounded text-[10px] border font-medium uppercase tracking-wide ${
          isMixed
            ? 'bg-amber-950/40 text-amber-200 border-amber-500/30'
            : blueprintLines.length > 0
              ? 'bg-red-950/40 text-red-200 border-red-500/30'
              : 'bg-cyan-950/40 text-cyan-200 border-cyan-500/30'
        }`}
      >
        {kind}
      </span>
      <ul className="space-y-0.5">
        {blueprintLines.map((line) => (
          <li
            key={`${order.id}-bp-${line.blueprintId}-${line.minQuality}-${line.quantity}`}
            className="text-slate-400 text-xs flex flex-wrap gap-x-1.5"
          >
            <span className="text-slate-300">{line.blueprintTitle}</span>
            <span>× {line.quantity}</span>
            <span>· {formatBlueprintOrderQualityLabel(line.minQuality)}</span>
            {showDfp && line.lineDfpAuec > 0 && (
              <span className="text-amber-300/90">· {formatDfpAuec(line.lineDfpAuec)}</span>
            )}
          </li>
        ))}
        {resourceLines.map((line) => (
          <li
            key={`${order.id}-res-${line.resourceKey}-${line.minQuality}-${line.quantityScu}`}
            className="text-slate-400 text-xs flex flex-wrap gap-x-1.5"
          >
            <span className="text-slate-300">{line.resourceLabel}</span>
            <span>· {formatResourceQuantity(line.quantityScu)} SCU</span>
            <span>
              ·{' '}
              {formatResourceOrderQualityLabel(
                line.resourceKey,
                line.resourceLabel,
                line.minQuality
              )}
            </span>
            {showDfp && line.lineDfpAuec > 0 && (
              <span className="text-amber-300/90">· {formatDfpAuec(line.lineDfpAuec)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
