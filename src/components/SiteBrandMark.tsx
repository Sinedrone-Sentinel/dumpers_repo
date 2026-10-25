import React from 'react'
import { Link } from '@tanstack/react-router'
import SiteTooltip from './SiteTooltip'
import { SITE_BRAND_FONT, SITE_BRAND_REPO_GRADIENT } from '../config/site'

type SiteBrandMarkSize = 'sm' | 'md' | 'lg'

interface SiteBrandMarkProps {
  size?: SiteBrandMarkSize
  className?: string
}

const boxClasses: Record<SiteBrandMarkSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
}

/** Typographic DR — stays crisp in the header; detailed SVG paths blur at small sizes. */
export default function SiteBrandMark({ size = 'md', className = '' }: SiteBrandMarkProps) {
  return (
    <SiteTooltip content="Dumper's Repo — home">
    <Link
      to="/"
      className={`shrink-0 flex items-center justify-center rounded-lg border border-orange-500/25 bg-slate-950/90 hover:border-orange-500/50 transition-colors ${boxClasses[size]} ${className}`}
    >
      <span
        className="font-black leading-none tracking-tight"
        style={{
          fontFamily: SITE_BRAND_FONT,
          background: SITE_BRAND_REPO_GRADIENT,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        DR
      </span>
    </Link>
    </SiteTooltip>
  )
}
