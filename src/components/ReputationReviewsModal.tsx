import React, { useMemo, useState } from 'react'
import AppModal from './layout/AppModal'
import type { MemberOrderRating } from '../lib/operations'
import { formatReputationScore } from '../lib/reputation'

interface ReputationReviewsModalProps {
  title: string
  score: number | null
  ratingCount: number
  ratings: MemberOrderRating[]
  loading: boolean
  error?: string
  onClose: () => void
}

function StarRow({ stars }: { stars: number }) {
  return (
    <span className="text-amber-400 tracking-tight" aria-label={`${stars} of 5 stars`}>
      {'\u2605\u2605\u2605\u2605\u2605'.slice(0, stars)}
      <span className="text-slate-600">{'\u2605\u2605\u2605\u2605\u2605'.slice(stars)}</span>
    </span>
  )
}

export default function ReputationReviewsModal({
  title,
  score,
  ratingCount,
  ratings,
  loading,
  error,
  onClose,
}: ReputationReviewsModalProps) {
  const [starFilter, setStarFilter] = useState<number | 'all'>('all')

  const availableStars = useMemo(() => {
    const found = new Set(ratings.map((row) => row.stars))
    return [5, 4, 3, 2, 1].filter((star) => found.has(star))
  }, [ratings])

  const activeFilter = starFilter !== 'all' && !availableStars.includes(starFilter) ? 'all' : starFilter
  const list = activeFilter === 'all' ? ratings : ratings.filter((row) => row.stars === activeFilter)

  return (
    <AppModal
      title={title}
      subtitle={
        score != null
          ? `${formatReputationScore(score)} average from ${ratingCount} rating${ratingCount === 1 ? '' : 's'}`
          : undefined
      }
      onClose={onClose}
      size="md"
      zIndex={70}
      titleId="rep-reviews-title"
    >
      {loading ? (
        <p className="site-hint">Loading ratings...</p>
      ) : error ? (
        <p className="site-error-text">{error}</p>
      ) : ratings.length === 0 ? (
        <div className="site-empty !py-8 text-sm">No ratings yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="site-chip-strip w-fit">
            <button
              type="button"
              onClick={() => setStarFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-lg site-btn-shimmer ${
                activeFilter === 'all' ? 'site-filter-selected-amber' : 'site-filter-idle'
              }`}
            >
              ALL
            </button>
            {availableStars.map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setStarFilter(star)}
                className={`px-3 py-1 text-xs font-medium rounded-lg site-btn-shimmer ${
                  activeFilter === star ? 'site-filter-selected-amber' : 'site-filter-idle'
                }`}
              >
                {star}{'\u2605'}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <div className="site-empty !py-6 text-sm">No ratings at this star.</div>
          ) : (
            <ul className="space-y-3">
              {list.map((row, idx) => (
                <li key={`${row.createdAt}-${idx}`} className="site-surface p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <StarRow stars={row.stars} />
                    <span className="text-slate-500 text-xs">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    {row.isAuto ? 'Auto-applied' : 'Member review'}
                    {row.orderTitle ? ` \u00b7 ${row.orderTitle}` : ''}
                  </p>
                  {row.comment ? (
                    <p className="text-slate-200 text-sm mt-2 whitespace-pre-wrap">{row.comment}</p>
                  ) : (
                    <p className="site-hint !mt-2">No comment</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppModal>
  )
}
