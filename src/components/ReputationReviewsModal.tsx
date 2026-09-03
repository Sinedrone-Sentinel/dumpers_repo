import React from 'react'
import AppModal from './layout/AppModal'
import type { MemberOrderRating } from '../lib/operations'

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
      {'★★★★★'.slice(0, stars)}
      <span className="text-slate-600">{'★★★★★'.slice(stars)}</span>
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
  return (
    <AppModal
      title={title}
      subtitle={
        score != null
          ? `${score} average from ${ratingCount} rating${ratingCount === 1 ? '' : 's'}`
          : undefined
      }
      onClose={onClose}
      size="md"
      zIndex={70}
      titleId="rep-reviews-title"
    >
      {loading ? (
        <p className="site-hint">Loading ratings…</p>
      ) : error ? (
        <p className="site-error-text">{error}</p>
      ) : ratings.length === 0 ? (
        <div className="site-empty !py-8 text-sm">No ratings yet.</div>
      ) : (
        <ul className="space-y-3">
          {ratings.map((row, idx) => (
            <li key={`${row.createdAt}-${idx}`} className="site-surface p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <StarRow stars={row.stars} />
                <span className="text-slate-500 text-xs">
                  {new Date(row.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-1">
                {row.isAuto ? 'Auto-applied' : row.raterName}
                {row.orderTitle ? ` · ${row.orderTitle}` : ''}
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
    </AppModal>
  )
}
