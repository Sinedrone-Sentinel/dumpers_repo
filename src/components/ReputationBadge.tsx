import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { formatReputationLabel, type MemberReputation } from '../lib/reputation'

interface ReputationBadgeProps {
  label: string
  reputation: MemberReputation
  className?: string
  type?: 'buyer' | 'fulfiller'
}

export default function ReputationBadge({ label, reputation, className = '', type = 'buyer' }: ReputationBadgeProps) {
  const pending = reputation.isPending || reputation.score == null
  const [showRulesModal, setShowRulesModal] = useState(false)

  const badgeContent = (
    <>
      <span className="text-slate-500">{label}:</span>
      <span className={pending ? 'italic' : 'font-medium'}>{formatReputationLabel(reputation)}</span>
      {!pending && <span className="text-amber-400/80">★</span>}
    </>
  )

  if (!pending) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border bg-amber-950/40 text-amber-200 border-amber-500/30 ${className}`}
        title={`Average star rating (${reputation.ratingCount} rating${reputation.ratingCount === 1 ? '' : 's'})`}
      >
        {badgeContent}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowRulesModal(true)}
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
              orders. During this period, some limits apply to protect the community:
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
                    <span>Total order value capped at <strong>1,000,000 aUEC</strong></span>
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
              <Link
                to="/archive"
                onClick={() => setShowRulesModal(false)}
                className="flex-1 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-sm text-center transition-colors"
              >
                Full Rules in Archive
              </Link>
              <button
                onClick={() => setShowRulesModal(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
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
