import React from 'react'
import BlueprintEffectiveStatsSummary from './BlueprintEffectiveStatsSummary'
import { formatDfpAuec } from '../lib/dfp'
import type { OrderBlueprintLine } from '../lib/orderPricing'
import type { BlueprintWithSlots } from '../lib/blueprintResources'
import {
  blueprintHasQualityModifiers,
  computeBlueprintEffectiveModifiers,
  formatStoredStatCompact,
  statsFromLineSnapshot,
  type BlueprintForEffectiveStats,
} from '../lib/blueprintEffectiveStats'

interface SlotQualityDetail {
  slotIndex: number
  slotName: string
  resourceName: string
  quality: number
}

interface BlueprintOrderLineCardProps {
  line: OrderBlueprintLine
  blueprint?: BlueprintWithSlots
  showDfp?: boolean
  slotDetails: SlotQualityDetail[]
}

export default function BlueprintOrderLineCard({
  line,
  blueprint,
  showDfp = true,
  slotDetails,
}: BlueprintOrderLineCardProps) {
  const snapshotStats = statsFromLineSnapshot(line.lineSnapshot)
  const computedModifiers =
    blueprint && blueprintHasQualityModifiers(blueprint as BlueprintForEffectiveStats)
      ? computeBlueprintEffectiveModifiers(
          blueprint as BlueprintForEffectiveStats,
          line.slotQualities,
          line.minQuality
        )
      : []

  const useSnapshotStats = snapshotStats.length > 0
  const slotSummary = line.lineSnapshot?.slotSummary

  return (
    <div className="site-surface p-2.5 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="text-slate-200 text-xs font-medium">
          {line.blueprintTitle} × {line.quantity}
        </span>
        {showDfp && line.lineDfpAuec > 0 && (
          <span className="text-amber-300/90 text-xs">{formatDfpAuec(line.lineDfpAuec)}</span>
        )}
      </div>

      {(slotSummary || slotDetails.length > 0) && (
        <div className="space-y-0.5">
          <p className="site-label !mb-0 text-[10px]">Materials</p>
          {slotSummary ? (
            <p className="text-[11px] text-slate-400 leading-relaxed">{slotSummary}</p>
          ) : (
            slotDetails.map((detail) => (
              <div key={detail.slotIndex} className="text-[11px] text-slate-400">
                <span className="text-slate-500">{detail.slotName}</span>
                {detail.resourceName && (
                  <span className="text-slate-400"> ({detail.resourceName})</span>
                )}
                <span className="text-orange-300 ml-1">Q{detail.quality}</span>
              </div>
            ))
          )}
        </div>
      )}

      {(useSnapshotStats || computedModifiers.length > 0) && (
        <div className="space-y-0.5">
          <p className="site-label !mb-0 text-[10px]">Resulting stats</p>
          {useSnapshotStats ? (
            <ul className="space-y-0.5">
              {snapshotStats.map((stat) => (
                <li key={stat.propertyLabel} className="text-[11px] text-slate-300">
                  {formatStoredStatCompact(stat)}
                </li>
              ))}
            </ul>
          ) : (
            <BlueprintEffectiveStatsSummary modifiers={computedModifiers} compact />
          )}
        </div>
      )}
    </div>
  )
}
