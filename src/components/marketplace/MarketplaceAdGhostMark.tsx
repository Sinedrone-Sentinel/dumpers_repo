import React from 'react'
import { SITE_BRAND_FONT, SITE_BRAND_REPO_GRADIENT } from '../../config/site'

export default function MarketplaceAdGhostMark() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden
    >
      <span
        className="select-none text-5xl font-black tracking-tight opacity-[0.1]"
        style={{
          fontFamily: SITE_BRAND_FONT,
          background: SITE_BRAND_REPO_GRADIENT,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        DR
      </span>
    </div>
  )
}
