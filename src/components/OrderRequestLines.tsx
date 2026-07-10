import React, { useMemo } from 'react'
import {
  formatBlueprintOrderQualityLabel,
  formatDfpAuec,
  formatResourceOrderQualityLabel,
} from '../lib/dfp'
import {
  buildOrderTitle,
  orderBlueprintCraftCount,
  resolveOrderBlueprintLines,
  resolveOrderResourceLines,
  type OrderBlueprintLine,
} from '../lib/orderPricing'
import { resourceLabelClassName, resourceQuantityUnitLabel } from '../config/resourceTypes'
import { formatQuantityForResource } from '../lib/resourceQuantity'
import type { CustomOrder } from '../lib/operations'
import type { BlueprintWithSlots } from '../lib/blueprintResources'
import {
  resolveEffectiveSlotQualities,
  type BlueprintForEffectiveStats,
} from '../lib/blueprintEffectiveStats'
import BlueprintOrderLineCard from './BlueprintOrderLineCard'

function formatBlueprintQuality(line: OrderBlueprintLine): string {
  const sq = line.slotQualities
  if (!sq || Object.keys(sq).length === 0) {
    return formatBlueprintOrderQualityLabel(line.minQuality)
  }
  const values = Object.values(sq).map(Number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    return `Q${min}`
  }
  return `Q${min}–Q${max} mix`
}

function isMixedQuality(line: OrderBlueprintLine): boolean {
  const sq = line.slotQualities
  if (!sq || Object.keys(sq).length === 0) return false
  const values = Object.values(sq).map(Number)
  return values.length > 1 && Math.min(...values) !== Math.max(...values)
}

interface SlotQualityDetail {
  slotIndex: number
  slotName: string
  resourceName: string
  quality: number
}

function getSlotQualityDetails(
  line: OrderBlueprintLine,
  blueprint?: BlueprintWithSlots
): SlotQualityDetail[] {
  if (!blueprint?.slots?.length) return []

  const effectiveQualities = resolveEffectiveSlotQualities(
    blueprint as BlueprintForEffectiveStats,
    line.slotQualities,
    line.minQuality
  )

  return Object.entries(effectiveQualities)
    .map(([idx, quality]) => {
      const slotIndex = Number(idx)
      const slot = blueprint.slots?.[slotIndex]
      const slotName = slot?.slotDisplayName || `Slot ${slotIndex + 1}`
      const resourceName =
        slot?.options?.[0]?.resourceName ||
        slot?.options?.[0]?.entityName ||
        slot?.options?.[0]?.displayName ||
        slot?.options?.[0]?.itemName ||
        ''
      return { slotIndex, slotName, resourceName, quality: Number(quality) }
    })
    .sort((a, b) => a.slotIndex - b.slotIndex)
}

interface OrderRequestLinesProps {
  order: CustomOrder
  showDfp?: boolean
  blueprintById?: Map<string, BlueprintWithSlots>
  /** Itemized cards with materials + stats (fulfillment / marketplace). */
  showEffectiveStats?: boolean
  /** Hide the order-kind pill when the parent row already shows it. */
  showKindBadge?: boolean
}

export function orderKindLabel(order: CustomOrder): string {
  return buildOrderTitle(
    orderBlueprintCraftCount(order),
    resolveOrderResourceLines(order).length
  )
}

export default function OrderRequestLines({
  order,
  showDfp = true,
  blueprintById,
  showEffectiveStats = false,
  showKindBadge = true,
}: OrderRequestLinesProps) {
  const blueprintLines = useMemo(() => resolveOrderBlueprintLines(order), [order])

  const resourceLines = useMemo(() => resolveOrderResourceLines(order), [order])

  if (blueprintLines.length === 0 && resourceLines.length === 0) return null

  const kind = orderKindLabel(order)
  const isMixed = blueprintLines.length > 0 && resourceLines.length > 0

  if (showEffectiveStats) {
    return (
      <div className="space-y-2">
        {showKindBadge ? (
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
        ) : null}
        <div className="space-y-2">
          {blueprintLines.map((line) => {
            const lineKey = `${order.id}-bp-${line.blueprintId}-${line.minQuality}-${line.quantity}`
            const blueprint = blueprintById?.get(line.blueprintId)
            return (
              <BlueprintOrderLineCard
                key={lineKey}
                line={line}
                blueprint={blueprint}
                showDfp={showDfp}
                slotDetails={getSlotQualityDetails(line, blueprint)}
              />
            )
          })}
          {resourceLines.map((line) => (
            <div
              key={`${order.id}-res-${line.resourceKey}-${line.minQuality}-${line.quantityScu}`}
              className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-2.5 text-xs text-slate-400"
            >
              <span className={resourceLabelClassName(line.resourceKey)}>{line.resourceLabel}</span>
              <span>
                {' '}
                · {formatQuantityForResource(line.resourceKey, line.quantityScu)}{' '}
                {resourceQuantityUnitLabel(line.resourceKey)}
              </span>
              <span>
                {' '}
                ·{' '}
                {formatResourceOrderQualityLabel(
                  line.resourceKey,
                  line.resourceLabel,
                  line.minQuality
                )}
              </span>
              {showDfp && line.lineDfpAuec > 0 && (
                <span className="text-amber-300/90 ml-1">· {formatDfpAuec(line.lineDfpAuec)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

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
        {blueprintLines.map((line) => {
          const lineKey = `${order.id}-bp-${line.blueprintId}-${line.minQuality}-${line.quantity}`
          const hasMixedQuality = isMixedQuality(line)
          return (
            <li key={lineKey} className="text-slate-400 text-xs">
              <div className="flex flex-wrap gap-x-1.5 items-center">
                <span className="text-slate-300">{line.blueprintTitle}</span>
                <span>× {line.quantity}</span>
                <span className={hasMixedQuality ? 'text-orange-300' : ''}>
                  · {formatBlueprintQuality(line)}
                </span>
                {showDfp && line.lineDfpAuec > 0 && (
                  <span className="text-amber-300/90">· {formatDfpAuec(line.lineDfpAuec)}</span>
                )}
              </div>
            </li>
          )
        })}
        {resourceLines.map((line) => (
          <li
            key={`${order.id}-res-${line.resourceKey}-${line.minQuality}-${line.quantityScu}`}
            className="text-slate-400 text-xs flex flex-wrap gap-x-1.5"
          >
            <span className={resourceLabelClassName(line.resourceKey)}>{line.resourceLabel}</span>
            <span>
              · {formatQuantityForResource(line.resourceKey, line.quantityScu)}{' '}
              {resourceQuantityUnitLabel(line.resourceKey)}
            </span>
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
