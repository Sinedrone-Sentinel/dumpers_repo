import { resourceLabelClassName, resourceQuantityUnitLabel } from '../config/resourceTypes'
import { slugifyResourceName } from '../lib/blueprintResources'
import {
  formatInventoryQualityLabel,
  formatStockScu,
  getResourceBands,
  getQualityTier,
  getQualityTierColor,
  isBandedStockQuality,
  stockByBand,
} from '../lib/qualityBands'
import type { OwnedResourceStock } from '../lib/craftFromStock'
import { formatQuantityForResource } from '../lib/resourceQuantity'
import QualityBandSelect from './QualityBandSelect'
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
  /** Craft mode restricts the quality picker to tiers the member actually holds. */
  craftMode?: boolean
  craftResourceKey?: string
  craftAvailableQualities?: number[]
  craftHave?: number
  craftNeeded?: number
  craftEnough?: boolean
  /** Signed-in member's stock for this slot's resource; shows per-option amounts in the open list. */
  ownedStock?: OwnedResourceStock | null
}

export default function BlueprintSlotQualityCard({
  slot,
  slotIndex,
  quality,
  onQualityChange,
  modifierResults = [],
  compact = false,
  qualityDisplay = 'bands',
  craftMode = false,
  craftResourceKey,
  craftAvailableQualities,
  craftHave,
  craftNeeded,
  craftEnough,
  ownedStock = null,
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
  const craftResKey = craftResourceKey ?? slugifyResourceName(resourceName)
  const craftUnit = resourceQuantityUnitLabel(craftResKey)
  const craftQualityOptions = craftAvailableQualities ?? []
  const bandStock = ownedStock && bands ? stockByBand(resourceName, ownedStock.byQuality) : null
  const modifierRows =
    hasModifiers && modifierResults.length > 0 ? (
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
    ) : null

  return (
    <div
      className={`site-surface min-w-0 ${
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

      {craftMode && (
        <div className="mt-3 pt-3 site-divider">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1.5 min-w-0">
            <label className="text-xs text-slate-500 uppercase tracking-wide shrink-0">
              Use quality
            </label>
            {craftQualityOptions.length > 0 ? (
              <QualityBandSelect
                value={quality}
                onChange={(q) => onQualityChange(slotIndex, q)}
                ariaLabel="Use quality"
                className="w-full min-w-0 sm:flex-1 px-2 py-1 text-sm font-mono"
                options={craftQualityOptions.map((q) => ({
                  value: q,
                  label: formatInventoryQualityLabel(craftResKey, q),
                  stockLabel:
                    ownedStock && isBandedStockQuality(q)
                      ? formatStockScu(ownedStock.byQuality.get(q))
                      : undefined,
                }))}
              />
            ) : (
              <span className="text-xs text-red-400 font-medium">None in stock</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">
              Need {formatQuantityForResource(craftResKey, craftNeeded ?? 0)} {craftUnit}
            </span>
            <span className={craftEnough ? 'text-green-400' : 'text-red-400'}>
              Have {formatQuantityForResource(craftResKey, craftHave ?? 0)} {craftUnit}
            </span>
          </div>
          {modifierRows && <div className="mt-2">{modifierRows}</div>}
        </div>
      )}

      {!craftMode && showQualitySelector && (
        <div className={`mt-3 pt-3 site-divider ${compact ? 'mt-2 pt-2' : ''}`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2 min-w-0">
            <label className="text-xs text-slate-500 uppercase tracking-wide shrink-0">
              {qualityDisplay === 'q-values' ? 'Quality' : 'Quality Band'}
            </label>
            {bands ? (
              <QualityBandSelect
                value={quality}
                onChange={(q) => onQualityChange(slotIndex, q)}
                ariaLabel={qualityDisplay === 'q-values' ? 'Quality' : 'Quality band'}
                className="w-full min-w-0 sm:flex-1 px-2 py-1 text-sm font-mono"
                options={bands.map((bandValue, idx) => ({
                  value: bandValue,
                  label:
                    qualityDisplay === 'q-values' ? `Q${bandValue}` : `Band ${idx + 1}: Q${bandValue}`,
                  className: getQualityTierColor(getQualityTier(bandValue)),
                  stockLabel: bandStock ? formatStockScu(bandStock[idx]) : undefined,
                }))}
              />
            ) : (
              <>
                <input
                  type="range"
                  min={1}
                  max={1000}
                  step={1}
                  value={quality}
                  onChange={(e) => onQualityChange(slotIndex, parseInt(e.target.value, 10))}
                  className="site-range flex-1"
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
                  className="site-input w-16 px-2 py-1 text-sm text-orange-400 font-mono text-center"
                />
              </>
            )}
          </div>

          {modifierRows}
        </div>
      )}
    </div>
  )
}
