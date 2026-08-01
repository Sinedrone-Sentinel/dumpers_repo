import React from 'react'
import {
  getVariantGroupSummary,
  type BlueprintVariantInput,
} from '../lib/blueprintVariantGroups'

interface BlueprintVariantGroupCardProps {
  familyLabel: string
  categoryName: string
  members: BlueprintVariantInput[]
  expanded: boolean
  onToggle: () => void
  acquiredCount: number
  renderBlueprintCard: (blueprint: BlueprintVariantInput) => React.ReactNode
}

export default function BlueprintVariantGroupCard({
  familyLabel,
  categoryName,
  members,
  expanded,
  onToggle,
  acquiredCount,
  renderBlueprintCard,
}: BlueprintVariantGroupCardProps) {
  const summary = getVariantGroupSummary(members, categoryName)
  const total = members.length
  const allAcquired = acquiredCount === total

  return (
    <div
      className={`min-w-0 max-w-full rounded-xl border overflow-hidden transition-colors transition-shadow duration-200 ${
        expanded
          ? 'col-span-full border-red-500/30 ring-1 ring-red-500/10'
          : 'h-full border-slate-700 hover:border-red-500/30 hover:shadow-lg'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full text-left bg-gradient-to-br from-slate-900 to-slate-800 transition-colors ${
          expanded ? 'border-b border-slate-700/80' : 'hover:from-slate-900 hover:to-slate-800/90'
        }`}
      >
        <div className="px-3 sm:px-4 py-2.5 border-b border-red-500/20 bg-red-950/20">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-white text-sm truncate">{familyLabel}</h3>
            <svg
              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-3 min-w-0">
          <p className="text-sm text-slate-400 min-w-0 truncate">{summary}</p>
          <div className="shrink-0 text-right">
            <span
              className={`text-sm font-medium tabular-nums ${
                allAcquired ? 'text-green-400' : 'text-amber-400'
              }`}
            >
              {acquiredCount}/{total}
            </span>
            <p className="text-[10px] text-slate-500">acquired</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="p-3 sm:p-4 bg-slate-950/40">
          <div className="blueprint-card-grid items-stretch">
            {members.map((bp) => (
              <div key={bp.internalName || bp.file} className="h-full min-h-0">
                {renderBlueprintCard(bp)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
