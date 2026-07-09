import { resourceLabelClassName } from '../config/resourceTypes'
import { slugifyResourceName } from '../lib/blueprintResources'
import { getResourceBands, getQualityTier, getQualityTierColor } from '../lib/qualityBands'
import {
  formatSlotModifierDisplay,
  getSlotModifierColorClass,
  type SlotModifierResult,
} from '../lib/qualityModifiers'

export interface BlueprintSlotQualityOption {
  type?: string
  resourceName?: string
  entityName?: string
  displayName?: string
  itemName?: string
  quantity?: number
  standardCargoUnits?: number
  modifiers?: unknown[]
}

export interface BlueprintSlotQualitySlot {
  slotDisplayName?: string
  requiredCount?: number
  options?: BlueprintSlotQualityOption[]
}

export interface BlueprintSlotQualityCardProps {
  slot: BlueprintSlotQualitySlot
  slotIndex: number
  quality: number
  onQualityChange: (slotIndex: number, quality: number) => void
  modifierResults?: SlotModifierResult[]
  compact?: boolean
  /** `q-values` shows Q847-style labels; default `bands` keeps Band N: Q847 (orders UI). */
  qualityDisplay?: 'bands' | 'q-values'
}

export default function BlueprintSlotQualityCard({
  slot,
  slotIndex,
  quality,
  onQualityChange,
  modifierResults = [],
  compact = false,
  qualityDisplay = 'bands',
}: BlueprintSlotQualityCardProps) {
  const option = slot.options?.[0]
  const resourceName =
    option?.resourceName ||
    option?.entityName ||
    option?.displayName ||
    option?.itemName ||
    ''
  const bands = getResourceBands(resourceName)
  const hasModifiers = (option?.modifiers?.length ?? 0) > 0
  const isMineable = (option?.standardCargoUnits ?? 0) > 0
  const isItem = option?.type === 'item'
  const showQualitySelector = hasModifiers || (isMineable && !isItem)

  return (
    <div
      className={`bg-slate-900/50 rounded-lg border border-slate-700 ${
        compact ? 'p-2' : 'p-3'
      }`}
    >
      <div className="flex justify-between items-center gap-2 mb-2">
        <span className={`text-white font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
          {slot.slotDisplayName}
        </span>
        <span className={`text-slate-400 shrink-0 ${compact ? 'text-xs' : 'text-sm'}`}>
          ×{slot.requiredCount || 1}
        </span>
      </div>

      {slot.options && slot.options.length > 0 && (
        <div className="space-y-2">
          {slot.options.map((opt, optIdx) => {
            const name =
              opt.resourceName ||
              opt.entityName ||
              opt.displayName ||
              opt.itemName ||
              'Unknown'
            const resourceKey = slugifyResourceName(name)
            const optIsItem = opt.type === 'item'
            const labelClass = optIsItem ? 'text-purple-400' : resourceLabelClassName(resourceKey)
            return (
              <div key={optIdx} className="flex justify-between gap-2 text-sm min-w-0">
                <span className={`min-w-0 break-words ${labelClass}`}>{name}</span>
                {(opt.standardCargoUnits ?? 0) > 0 ? (
                  <span className="text-slate-500 shrink-0">{opt.standardCargoUnits} SCU</span>
                ) : (opt.quantity ?? 0) > 0 ? (
                  <span className="text-slate-500 shrink-0">×{opt.quantity}</span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {showQualitySelector && (
        <div className={`mt-3 pt-3 border-t border-slate-700/50 ${compact ? 'mt-2 pt-2' : ''}`}>
          <div className="flex items-center gap-3 mb-2">
            <label className="text-xs text-slate-500 uppercase tracking-wide shrink-0">
              {qualityDisplay === 'q-values' ? 'Quality' : 'Quality Band'}
            </label>
            {bands ? (
              <select
                value={quality}
                onChange={(e) => onQualityChange(slotIndex, parseInt(e.target.value, 10))}
                className="flex-1 px-2 py-1 bg-slate-700/80 border border-slate-500 rounded text-sm font-mono text-white cursor-pointer hover:bg-slate-600/80 focus:border-orange-500/50 focus:outline-none"
              >
                {bands.map((bandValue, idx) => {
                  const tier = getQualityTier(bandValue)
                  const label =
                    qualityDisplay === 'q-values'
                      ? `Q${bandValue}`
                      : `Band ${idx + 1}: Q${bandValue}`
                  return (
                    <option key={idx} value={bandValue} className={getQualityTierColor(tier)}>
                      {label}
                    </option>
                  )
                })}
              </select>
            ) : (
              <>
                <input
                  type="range"
                  min={1}
                  max={1000}
                  step={1}
                  value={quality}
                  onChange={(e) => onQualityChange(slotIndex, parseInt(e.target.value, 10))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={quality}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val) && val >= 1 && val <= 1000) {
                      onQualityChange(slotIndex, val)
                    }
                  }}
                  className="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-orange-400 font-mono text-center"
                />
              </>
            )}
          </div>

          {hasModifiers && modifierResults.length > 0 && (
            <div className="space-y-1">
              {modifierResults.map((result, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{result.propertyLabel}</span>
                  <span className={getSlotModifierColorClass(result)}>
                    {formatSlotModifierDisplay(result)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
