import React from 'react'
import type { AggregatedModifier } from '../lib/qualityModifiers'
import {
  formatAggregatedModifierDisplay,
  formatStatValue,
  getAggregatedModifierColorClass,
} from '../lib/qualityModifiers'

interface BlueprintEffectiveStatsSummaryProps {
  modifiers: AggregatedModifier[]
  compact?: boolean
}

export default function BlueprintEffectiveStatsSummary({
  modifiers,
  compact = false,
}: BlueprintEffectiveStatsSummaryProps) {
  if (modifiers.length === 0) return null

  return (
    <div
      className={`rounded-lg border border-orange-500/20 bg-orange-950/15 ${
        compact ? 'p-2 mt-1' : 'p-3 mt-2'
      }`}
    >
      <p
        className={`font-medium text-orange-300/90 uppercase tracking-wide ${
          compact ? 'text-[10px] mb-1' : 'text-xs mb-2'
        }`}
      >
        Resulting stats
      </p>
      <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
        {modifiers.map((mod) => (
          <div
            key={mod.property}
            className={`flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0 ${
              compact ? 'text-[11px]' : 'text-xs'
            }`}
          >
            <span className="text-slate-300">{mod.propertyLabel}</span>
            <span className="flex flex-wrap items-center gap-x-2 justify-end">
              {mod.baseValue !== undefined && mod.finalValue !== undefined && (
                <span className="text-slate-500">
                  {formatStatValue(mod.baseValue, mod.property)} →{' '}
                  <span className={getAggregatedModifierColorClass(mod)}>
                    {formatStatValue(mod.finalValue, mod.property)}
                  </span>
                </span>
              )}
              <span
                className={`font-mono font-semibold ${getAggregatedModifierColorClass(mod)}`}
              >
                {formatAggregatedModifierDisplay(mod)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
