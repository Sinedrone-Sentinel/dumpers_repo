import React from 'react'
import { getPublicTrustBadgeImages } from '../config/trustBadges'

type Props = {
  className?: string
}

/** Centered OpenSSF / trust badge images (Scorecard, Baseline, …). */
export default function TrustBadgeStrip({ className = '' }: Props) {
  const badges = getPublicTrustBadgeImages()
  if (badges.length === 0) return null

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
          <img src={badge.src} alt={badge.alt} className="h-5 w-auto max-w-[220px]" loading="lazy" />
        </a>
      ))}
    </div>
  )
}
