import React from 'react'
import { getPublicTrustBadgeImages } from '../config/trustBadges'

type Props = {
  className?: string
  /** `md` for landing hero; default `sm` for Archive welcome. */
  size?: 'sm' | 'md'
}

/** Centered OpenSSF / trust badge images (Scorecard, Best Practices, Baseline, ...). */
export default function TrustBadgeStrip({ className = '', size = 'sm' }: Props) {
  const badges = getPublicTrustBadgeImages()
  if (badges.length === 0) return null
  const imgClass =
    size === 'md' ? 'h-7 w-auto max-w-[240px] sm:h-8' : 'h-5 w-auto max-w-[220px]'

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-3 ${className}`}
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
