import React from 'react'
import type { WindowBarModel } from '../../lib/miningWindowDisplay'

interface WindowSizeBarProps {
  model: WindowBarModel
}

/**
 * The ore's optimal charge window as a physically-sized green bar — thickness
 * mirrors the green band on the in-game charge arc. Scale anchor: the thinnest
 * window seen in game (Quantainium + full negative window stack) ≈ 1/16 inch.
 * CSS px are density-independent, so proportions hold across resolutions.
 */
export default function WindowSizeBar({ model }: WindowSizeBarProps) {
  return (
    <div
      className="w-full rounded-sm bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"
      style={{ height: `${model.heightPx}px` }}
      role="img"
      aria-label={`Estimated optimal window thickness, ${model.rating}`}
    />
  )
}
