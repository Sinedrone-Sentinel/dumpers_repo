import React from 'react'
import { getPublicTrustBadgeImages } from '../config/trustBadges'

type Props = {
  className?: string
  /** `xs` for landing under stats; `sm` Archive; `md` if a larger strip is needed. */
  size?: 'xs' | 'sm' | 'md'
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  xs: 'h-3.5 w-auto max-w-[140px] sm:h-4 sm:max-w-[155px]',
  sm: 'h-5 w-auto max-w-[200px]',
  md: 'h-6 w-auto max-w-[220px] sm:h-7',
}

/** Centered OpenSSF / trust badge images (Scorecard, Best Practices, Baseline, ...). */
export default function TrustBadgeStrip({ className = '', size = 'sm' }: Props) {
  const badges = getPublicTrustBadgeImages()
  if (badges.length === 0) return null
  const imgClass = SIZE_CLASS[size]
  const gapClass = size === 'xs' ? 'gap-2' : 'gap-3'

  return (
    <div
      className={`flex flex-wrap items-center justify-center ${gapClass} ${className}`}
      role="list"
      aria-label="Security and trust badges"
    >
      {badges.map((badge) => (
        <a
          key={badge.id}
          href={badge.href}
          target="_blank"
          rel="noopener noreferrer"
          role="listitem"
          className="inline-flex opacity-95 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400/70"
          title={badge.alt}
        >
          <img src={badge.src} alt={badge.alt} className={imgClass} loading="lazy" />
        </a>
      ))}
    </div>
  )
}
