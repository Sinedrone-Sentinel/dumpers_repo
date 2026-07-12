import React from 'react'
import type { WindowBarModel } from '../../lib/miningWindowDisplay'

interface WindowSizeBarProps {
  model: WindowBarModel
  /** Compact height for per-head rows. */
  compact?: boolean
}

function clampSpan(center: number, width: number): { left: number; width: number } {
  const half = width / 2
  const left = Math.max(0, Math.min(100 - width, center - half))
  return { left, width: Math.min(100, width) }
}

/**
 * Miniature charge-bar with the ore's optimal window band.
 * Dim band = where the window can drift rock-to-rock (midpoint randomness);
 * bright band = estimated window width at the scanned midpoint.
 */
export default function WindowSizeBar({ model, compact = false }: WindowSizeBarProps) {
  const band = clampSpan(model.midpointPercent, model.widthPercent)
  const drift = clampSpan(model.midpointPercent, model.widthPercent + model.driftPercent * 2)
  const bandColor =
    model.rating === 'wide'
      ? 'bg-green-500/80'
      : model.rating === 'average'
        ? 'bg-green-600/70'
        : model.rating === 'narrow'
          ? 'bg-amber-500/80'
          : 'bg-red-500/80'

  return (
    <div
      className={`relative w-full ${compact ? 'h-1.5' : 'h-2'} rounded-full bg-slate-800/80 overflow-hidden`}
      role="img"
      aria-label={`Estimated optimal window: ${model.rating}, ~${model.widthPercent}% of charge bar`}
    >
      {model.driftPercent > 0 ? (
        <div
          className="absolute inset-y-0 rounded-full bg-slate-600/40"
          style={{ left: `${drift.left}%`, width: `${drift.width}%` }}
        />
      ) : null}
      <div
        className={`absolute inset-y-0 rounded-full ${bandColor}`}
        style={{ left: `${band.left}%`, width: `${band.width}%` }}
      />
    </div>
  )
}
