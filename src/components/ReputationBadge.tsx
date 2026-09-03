import React, { useEffect, useState } from 'react'
import { formatDeliveryDuration, formatReputationLabel, type MemberReputation } from '../lib/reputation'
import { fetchMemberOrderRatings, type MemberOrderRating } from '../lib/operations'
import ReputationReviewsModal from './ReputationReviewsModal'

interface ReputationBadgeProps {
  label: string
  reputation: MemberReputation
  className?: string
  type?: 'buyer' | 'fulfiller'
  /** Required to open the star-review modal on an unlocked rating. */
  userId?: string
}

export default function ReputationBadge({
  label,
  reputation,
  className = '',
  type = 'buyer',
  userId,
}: ReputationBadgeProps) {
  const pending = reputation.isPending || reputation.score == null
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [showReviews, setShowReviews] = useState(false)
  const [reviews, setReviews] = useState<MemberOrderRating[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState<string | undefined>()
  const showDeliveryTime =
    type === 'fulfiller' &&
    !pending &&
    reputation.avgDeliverySeconds != null &&
    reputation.deliverySampleCount > 0

  useEffect(() => {
    if (!showReviews || !userId) return
    let cancelled = false
    setReviewsLoading(true)
    setReviewsError(undefined)
    void fetchMemberOrderRatings(userId, type).then((result) => {
      if (cancelled) return
      setReviewsLoading(false)
      if (result.error) {
        setReviewsError(result.error)
        setReviews([])
        return
      }
      setReviews(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [showReviews, userId, type])

  const badgeContent = (
    <>
      <span className="text-slate-500">{label}:</span>
      <span className={pending ? 'italic' : 'font-medium'}>{formatReputationLabel(reputation)}</span>
      {!pending && <span className="text-amber-400/80">★</span>}
      {showDeliveryTime && (
        <>
          <span className="text-slate-600">·</span>
          <span
            className="font-mono text-sky-200/90 tabular-nums"
            title={`Average time from accept to ready for pickup (${reputation.deliverySampleCount} order${reputation.deliverySampleCount === 1 ? '' : 's'})`}
          >
            {formatDeliveryDuration(reputation.avgDeliverySeconds!)}
          </span>
        </>
      )}
    </>
  )

  if (!pending) {
    const canOpenReviews = Boolean(userId)
    return (
      <>
        <button
          type="button"
          disabled={!canOpenReviews}
          onClick={(event) => {
            event.stopPropagation()
            if (canOpenReviews) setShowReviews(true)
          }}
          className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 px-2 py-0.5 rounded text-xs border bg-amber-950/40 text-amber-200 border-amber-500/30 ${
            canOpenReviews
              ? 'hover:border-amber-400/60 hover:text-amber-100 cursor-pointer'
              : 'cursor-default'
          } ${className}`}
          title={
            canOpenReviews
              ? `Average star rating (${reputation.ratingCount} rating${reputation.ratingCount === 1 ? '' : 's'}) — click to read comments`
              : `Average star rating (${reputation.ratingCount} rating${reputation.ratingCount === 1 ? '' : 's'})`
          }
        >
          {badgeContent}
        </button>
        {showReviews && (
          <ReputationReviewsModal
            title={label}
            score={reputation.score}
            ratingCount={reputation.ratingCount}
            ratings={reviews}
            loading={reviewsLoading}
            error={reviewsError}
            onClose={() => setShowReviews(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setShowRulesModal(true)
        }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border bg-slate-800/80 text-slate-400 border-slate-600 hover:border-amber-500/40 hover:text-amber-300 transition-colors cursor-pointer ${className}`}
        title="Click to view pending reputation rules"
      >
        {badgeContent}
        <svg className="w-3 h-3 ml-0.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Pending Reputation Rules
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Your <strong className="text-white">{label.toLowerCase()} reputation</strong> is pending until you complete 5
              items (two of the same craft on one deal counts as two). During this period, some limits apply to protect the community:
            </p>

            <div className="space-y-3 mb-4">
              {type === 'buyer' ? (
                <ul className="text-sm text-slate-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Maximum <strong>2 active orders</strong> at a time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Total active buyer-side value capped at <strong>1,000,000 aUEC</strong> (site limit while reputation is pending)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Minimum order value: <strong>10,000 aUEC</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Cannot create duplicate orders for the same blueprint</span>
                  </li>
                </ul>
              ) : (
                <ul className="text-sm text-slate-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Can only accept <strong>1 order</strong> at a time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Complete your current order before accepting another</span>
                  </li>
                </ul>
              )}
              <div className="pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-500">
                  Progress: <span className="text-slate-300">{reputation.completedCount}/5</span> completed
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href="/archive#pending-rep"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowRulesModal(false)}
                className="flex-1 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-sm text-center transition-colors"
              >
                Full Rules in Archive
              </a>
              <button
                onClick={() => setShowRulesModal(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
