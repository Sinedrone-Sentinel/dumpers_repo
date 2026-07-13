import React, { useMemo } from 'react'
import BlueprintSlotQualityCard from './BlueprintSlotQualityCard'
import BlueprintEffectiveStatsSummary from './BlueprintEffectiveStatsSummary'
import { isAmmoBlueprint, formatDfpAuec } from '../lib/dfp'
import { formatSlotQualitySummary } from '../lib/blueprintQuality'
import type { BlueprintWithSlots } from '../lib/blueprintResources'
import {
  blueprintHasQualityModifiers,
  computeBlueprintEffectiveModifiers,
  resolveEffectiveSlotQualities,
  type BlueprintForEffectiveStats,
} from '../lib/blueprintEffectiveStats'
import { createCartPricingFields, pricingForBlueprintLine } from '../lib/orderPricing'

export interface EditableCartBlueprintLine {
  cartKey: string
  blueprintId: string
  blueprintTitle: string
  minQuality: number
  slotQualities?: Record<number, number>
  quantity: number
  unitDfpAuec: number
  lineDfpAuec: number
  baseUnitDfpAuec: number
  baseLineDfpAuec: number
}

interface CartBlueprintLineEditorProps {
  line: EditableCartBlueprintLine
  blueprint: BlueprintWithSlots
  showDfp?: boolean
  onUpdate: (cartKey: string, updates: Partial<EditableCartBlueprintLine>) => void
  onRemove: (cartKey: string) => void
  onCollapse: () => void
}

export default function CartBlueprintLineEditor({
  line,
  blueprint,
  showDfp = true,
  onUpdate,
  onRemove,
  onCollapse,
}: CartBlueprintLineEditorProps) {
  const bpStats = blueprint as BlueprintForEffectiveStats
  const isAmmo = isAmmoBlueprint(blueprint)
  const effectiveQualities = useMemo(
    () => resolveEffectiveSlotQualities(bpStats, line.slotQualities, line.minQuality),
    [bpStats, line.slotQualities, line.minQuality]
  )

  const effectiveModifiers = useMemo(() => {
    if (isAmmo || !blueprintHasQualityModifiers(bpStats)) return []
    return computeBlueprintEffectiveModifiers(bpStats, line.slotQualities, line.minQuality)
  }, [bpStats, isAmmo, line.slotQualities, line.minQuality])

  const applyPricingUpdate = (
    pricing: ReturnType<typeof pricingForBlueprintLine>,
    quantity: number,
    slotQualities?: Record<number, number>
  ) => {
    onUpdate(line.cartKey, {
      ...line,
      ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
      quantity,
      slotQualities,
      minQuality: pricing.orderMinQuality,
    })
  }

  const handleQualityChange = (slotIndex: number, quality: number) => {
    const nextQualities = { ...effectiveQualities, [slotIndex]: quality }
    const pricing = pricingForBlueprintLine(blueprint, nextQualities, line.quantity)
    applyPricingUpdate(pricing, line.quantity, nextQualities)
  }

  const handleQuantityChange = (rawQty: string) => {
    const quantity = Math.max(1, Number(rawQty) || 1)
    const pricing = pricingForBlueprintLine(
      blueprint,
      isAmmo ? {} : effectiveQualities,
      quantity
    )
    applyPricingUpdate(pricing, quantity, isAmmo ? undefined : effectiveQualities)
  }

  return (
    <div className="px-3 py-3 bg-slate-900/50 border border-orange-500/25 rounded-xl space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white text-sm font-medium">{line.blueprintTitle}</p>
          {!isAmmo && (
            <p className="text-orange-300/80 text-xs mt-0.5">
              {formatSlotQualitySummary(effectiveQualities)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showDfp && (
            <span className="text-amber-300 text-xs">{formatDfpAuec(line.lineDfpAuec)}</span>
          )}
          <button
            type="button"
            onClick={onCollapse}
            className="text-slate-400 hover:text-slate-300 text-xs underline"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => onRemove(line.cartKey)}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            Remove
          </button>
        </div>
      </div>

      {!isAmmo && blueprint.slots && blueprint.slots.length > 0 && (
        <div className="space-y-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide">
            Craft slots
          </p>
          {blueprint.slots.map((slot, idx) => (
            <BlueprintSlotQualityCard
              key={idx}
              slot={slot}
              slotIndex={idx}
              quality={effectiveQualities[idx]}
              onQualityChange={handleQualityChange}
              compact
            />
          ))}
        </div>
      )}

      {effectiveModifiers.length > 0 && (
        <BlueprintEffectiveStatsSummary modifiers={effectiveModifiers} compact />
      )}

      <div className="flex items-center gap-2">
        <label className="text-slate-500 text-xs shrink-0">Qty</label>
        <input
          type="number"
          min={1}
          value={line.quantity}
          onChange={(e) => handleQuantityChange(e.target.value)}
          className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
        />
      </div>
    </div>
  )
}
