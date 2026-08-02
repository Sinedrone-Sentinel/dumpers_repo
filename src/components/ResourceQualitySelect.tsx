import React from 'react'
import { SALVAGE_ORDER_MIN_QUALITY } from '../config/extraResources'
import { stockQualityTiersForResource } from '../config/dfp'
import {
  getDefaultBandQuality,
  getQualityTier,
  getQualityTierColor,
  getResourceBands,
  PURCHASED_STOCK_QUALITY,
  supportsPurchasedQuality,
} from '../lib/qualityBands'

interface ResourceQualitySelectProps {
  resourceKey: string
  resourceLabel: string
  quality: string
  onQualityChange: (quality: string) => void
}

export default function ResourceQualitySelect({
  resourceKey,
  resourceLabel,
  quality,
  onQualityChange,
}: ResourceQualitySelectProps) {
  const qualityTiers = stockQualityTiersForResource(resourceKey, resourceLabel)
  const selectedIsSalvage =
    qualityTiers.length === 1 && qualityTiers[0] === SALVAGE_ORDER_MIN_QUALITY
  const resourceBands = !selectedIsSalvage ? getResourceBands(resourceLabel) : undefined
  const showPurchased = supportsPurchasedQuality(resourceKey, resourceLabel)

  if (selectedIsSalvage) {
    return (
      <div className="site-input w-full h-full px-3 py-2 text-slate-300 text-sm">
        Q0 (no quality)
      </div>
    )
  }

  if (resourceBands) {
    return (
      <select
        value={quality}
        onChange={(e) => onQualityChange(e.target.value)}
        className="site-input w-full min-w-0 px-3 py-2 text-sm"
        aria-label="Quality band"
      >
        {showPurchased && (
          <option value={PURCHASED_STOCK_QUALITY}>Purchased (Q0)</option>
        )}
        {resourceBands.map((bandValue, idx) => {
          const tier = getQualityTier(bandValue)
          return (
            <option key={idx} value={bandValue} className={getQualityTierColor(tier)}>
              Band {idx + 1}: Q{bandValue}
            </option>
          )
        })}
      </select>
    )
  }

  return (
    <div className="w-full min-w-0 flex items-center gap-2">
      <input
        type="range"
        min={showPurchased ? PURCHASED_STOCK_QUALITY : 1}
        max={1000}
        step={1}
        value={quality}
        onChange={(e) => onQualityChange(e.target.value)}
        className="site-range flex-1"
        aria-label="Quality slider"
      />
      <input
        type="number"
        min={showPurchased ? PURCHASED_STOCK_QUALITY : 1}
        max={1000}
        value={quality}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10)
          const min = showPurchased ? PURCHASED_STOCK_QUALITY : 1
          if (!isNaN(val) && val >= min && val <= 1000) {
            onQualityChange(e.target.value)
          }
        }}
        className="site-input w-16 px-2 py-1.5 text-sm text-orange-400 font-mono text-center"
        aria-label="Quality value"
      />
    </div>
  )
}

export function getDefaultQualityForResource(resourceKey: string, resourceLabel: string): string {
  const qualityTiers = stockQualityTiersForResource(resourceKey, resourceLabel)
  const selectedIsSalvage =
    qualityTiers.length === 1 && qualityTiers[0] === SALVAGE_ORDER_MIN_QUALITY
  if (selectedIsSalvage) {
    return String(SALVAGE_ORDER_MIN_QUALITY)
  }
  const bands = getResourceBands(resourceLabel)
  if (bands && bands.length > 0) {
    return String(getDefaultBandQuality(resourceLabel))
  }
  return String(qualityTiers[0] ?? 500)
}
