import React, { useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { useAuth } from '../contexts/AuthContext'
import type { FeatureId } from '../lib/featureAccess'
import { getGuestFeatureCopy, GUEST_MEMBERSHIP_PITCH } from '../lib/guestFeatureCopy'

interface GuestLockedSearch {
  feature?: FeatureId
}

export default function GuestLockedRoute() {
  const { feature = 'custom_orders' } = useSearch({ strict: false }) as GuestLockedSearch
  const { signInWithGoogle } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const copy = getGuestFeatureCopy(feature)

  const handleSignIn = async () => {
    setSigningIn(true)
    try {
      await signInWithGoogle()
    } catch {
      setSigningIn(false)
    }
  }

  return (
    <FeaturePageLayout
      title={copy.title}
      subtitle="Free member account · full access"
      badge="Sign in required"
    >
      <div className="max-w-2xl space-y-6">
        <div className="p-4 bg-emerald-950/40 rounded-xl border border-emerald-500/30">
          <h2 className="text-sm font-semibold text-emerald-300 mb-1">
            {GUEST_MEMBERSHIP_PITCH.headline}
          </h2>
          <p className="text-sm text-emerald-200/90 mb-3">{GUEST_MEMBERSHIP_PITCH.subhead}</p>
          <ul className="text-sm text-emerald-200/80 space-y-1.5">
            {GUEST_MEMBERSHIP_PITCH.bullets.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-emerald-400 shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-slate-300 leading-relaxed">{copy.description}</p>

        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/80">
          <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wide mb-3">
            Included with your free member account
          </h2>
          <ul className="text-sm text-slate-400 space-y-2">
            {copy.details.map((detail) => (
              <li key={detail} className="flex gap-2">
                <span className="text-orange-500 shrink-0">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 bg-amber-950/40 rounded-xl border border-amber-500/30 text-sm text-amber-200/90">
          <strong className="text-amber-100">Offline Mode</strong> — Sign in with Google for a <strong className="text-amber-100 font-medium">free member account</strong> with{' '}
          <strong className="text-amber-100 font-medium">full access</strong> — no subscriptions, no
          paid tiers. New accounts may need a quick officer approval before community tools unlock.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={signingIn}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
          <Link
            to="/"
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 text-sm transition-colors"
          >
            Back to Blueprints
          </Link>
        </div>
      </div>
    </FeaturePageLayout>
  )
}

export type { GuestLockedSearch }
