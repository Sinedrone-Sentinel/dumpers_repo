import React, { useEffect, useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import SiteBrandTitle from '../SiteBrandTitle'
import OAuthSignInButtons from '../auth/OAuthSignInButtons'
import { SITE_COPYRIGHT, SITE_SLOGAN } from '../../config/site'
import { buildJsonLdGraph } from '../../config/seo'
import { SEO_LANDING_FAQS } from '../../config/seoFaqs'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import SiteSupportLink from '../layout/SiteSupportLink'
import SitePrivacyLink from '../layout/SitePrivacyLink'
import TrustBadgeStrip from '../TrustBadgeStrip'

type FeatureCard = {
  title: string
  body: string
  href?: string
  /** Offline tools, public SEO page, or sign-in for member-only features */
  action: 'offline' | 'public' | 'signin'
  cta: string
  featured?: boolean
}

const FEATURES: FeatureCard[] = [
  {
    title: 'Crafting blueprints',
    body: "Browse Star Citizen craftable items, materials, quality bands, and Dumper's Fair-Value Price (DFP) estimates — filter by type, manufacturer, and acquisition.",
    href: '/blueprints',
    action: 'public',
    cta: 'View blueprint database →',
    featured: true,
  },
  {
    title: 'Blueprint missions',
    body: 'Look up which reputation contracts reward crafting blueprints, build a wishlist, and sync unlocks with BP Dumper watch mode.',
    href: '/targets',
    action: 'offline',
    cta: 'Open in Offline Mode →',
  },
  {
    title: 'Wikelo favors & barter',
    body: 'Every Wikelo Emporium trade — favors, reputation, hand-ins, rewards, customer rank, ships, armor, weapons, and gear.',
    href: '/wikelo',
    action: 'offline',
    cta: 'Open Wikelo guide offline →',
  },
  {
    title: 'Mining tracker',
    body: 'Ore guide, cluster RS reference, spawn chances, and crew mining ledgers — plus a personal resource stock tracker.',
    href: '/mining-tracker',
    action: 'offline',
    cta: 'Open mining tracker offline →',
  },
  {
    title: 'Commodity lookup',
    body: 'Where to buy and sell commodities, UEX per-SCU prices, box sizes, and DFP bases for trade planning.',
    href: '/commodity-lookup',
    action: 'offline',
    cta: 'Open commodity lookup offline →',
  },
  {
    title: 'Community marketplace',
    body: 'Member WTB/WTS listings and The Bazaar — craft, list, and fulfill with your community after you sign in.',
    action: 'signin',
    cta: 'Sign in to use the marketplace →',
  },
]

type PublicSeoLandingProps = {
  onBrowseOffline: () => void
}

export default function PublicSeoLanding({ onBrowseOffline }: PublicSeoLandingProps) {
  const { loading, oauthReturnError } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [autoApproveEnabled, setAutoApproveEnabled] = useState<boolean | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const jsonLdId = useId()

  useEffect(() => {
    if (!oauthReturnError) return
    setError(oauthReturnError)
    document.getElementById('sign-in')?.scrollIntoView({ behavior: 'smooth' })
  }, [oauthReturnError])

  useEffect(() => {
    const fetchAutoApprove = async () => {
      const { data, error: rpcError } = await supabase.rpc('get_auto_approve_enabled')
      if (!rpcError && data !== null) setAutoApproveEnabled(data)
      else setAutoApproveEnabled(false)
    }
    void fetchAutoApprove()
  }, [])

  useEffect(() => {
    const scriptId = `seo-jsonld-${jsonLdId}`
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(buildJsonLdGraph())
    return () => {
      script?.remove()
    }
  }, [jsonLdId])

  const goOffline = (path: string = '/') => {
    onBrowseOffline()
    // Dynamic deep-links from feature cards (typed routes are a closed union).
    void navigate({ to: path as never })
  }

  const onFeatureClick = (feature: FeatureCard) => {
    if (feature.action === 'signin') {
      document.getElementById('sign-in')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if (feature.action === 'public') {
      void navigate({ to: (feature.href ?? '/blueprints') as never })
      return
    }
    goOffline(feature.href ?? '/')
  }

  return (
    <div className="site-page-bg min-h-screen text-slate-200">
      <div className="relative z-10">
        <header className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
          <SiteBrandTitle size="hero" layout="stacked" slogan={SITE_SLOGAN} titleAs="p" />
          <h1 className="mx-auto mt-10 max-w-3xl text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl md:leading-[1.15]">
            Star Citizen <span className="site-emphasis">blueprint</span> tracker, Wikelo guide,
            mining tools, and community trade
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base text-slate-300 sm:text-lg">
            Free crafting blueprint database, mission reward tracker, Wikelo favors and barter
            trades, mining RS reference, and a member marketplace — Offline Mode for instant access,
            sign-in when you want sync.
          </p>
          {error && (
            <div className="site-banner-error mx-auto mt-6 max-w-xl" role="alert">
              {error}
            </div>
          )}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => goOffline('/')}
              className="site-btn-primary w-full max-w-xs sm:w-auto"
            >
              Browse tools offline
            </button>
            <a
              href="#sign-in"
              className="w-full max-w-xs rounded-xl border border-orange-500/30 bg-black/40 px-6 py-3 text-center text-sm font-medium text-slate-100 backdrop-blur-sm transition hover:border-orange-400/50 hover:bg-slate-900/60 sm:w-auto"
            >
              Sign in for sync & marketplace
            </a>
          </div>

          <div className="site-stat-strip mx-auto mt-12 max-w-3xl flex-col gap-5">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              <div>
                <span className="site-stat-value">Offline</span>
                <span className="site-stat-label">No account needed</span>
              </div>
              <div>
                <span className="site-stat-value">DFP</span>
                <span className="site-stat-label">Fair-value pricing</span>
              </div>
              <div>
                <span className="site-stat-value">Live</span>
                <span className="site-stat-label">Org ticker</span>
              </div>
            </div>
            <TrustBadgeStrip size="xs" className="opacity-80" />
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-center text-xl font-semibold text-white sm:text-2xl">
            Some of what you can do
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400">
            Practical tools for crafting, mining, missions, and community trade — ready when you are.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className={feature.featured ? 'sm:col-span-2' : undefined}
              >
                <button
                  type="button"
                  onClick={() => onFeatureClick(feature)}
                  className={
                    feature.featured
                      ? 'site-panel-lead flex h-full w-full flex-col pl-6'
                      : 'site-panel flex h-full w-full flex-col pl-6'
                  }
                >
                  <span
                    className={
                      feature.featured
                        ? 'font-[Orbitron,sans-serif] text-lg font-black uppercase tracking-wide text-white'
                        : 'text-base font-semibold text-white'
                    }
                  >
                    {feature.title}
                  </span>
                  <span
                    className={
                      feature.featured
                        ? 'mt-3 max-w-2xl text-sm leading-relaxed text-slate-300'
                        : 'mt-2 text-sm leading-relaxed text-slate-400'
                    }
                  >
                    {feature.body}
                  </span>
                  <span className="mt-4 text-xs font-semibold text-orange-300">{feature.cta}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="sign-in"
          className="mx-auto max-w-md px-4 py-10 sm:px-6"
          aria-labelledby="signin-heading"
        >
          <div className="site-panel p-8 pl-8 shadow-2xl">
            <h2 id="signin-heading" className="text-center text-xl font-semibold text-white">
              Sign in
            </h2>
            <p className="mt-2 text-center text-sm text-slate-400">
              Google or Discord — sync blueprints, listings, and BP Dumper across devices.
            </p>

            {error && (
              <div className="site-banner-error mt-4" role="alert">
                {error}
              </div>
            )}

            <div className="mt-6">
              <OAuthSignInButtons disabled={loading} onError={setError} />
            </div>

            {autoApproveEnabled === false && (
              <p className="mt-4 text-center text-xs text-slate-500">
                New accounts require approval from an officer.
              </p>
            )}

            <div className="relative py-5">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-950/80 px-2 text-slate-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => goOffline('/')}
              className="w-full rounded-xl border border-slate-600 px-6 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/60 hover:text-white"
            >
              Continue in Offline Mode
            </button>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-center text-xl font-semibold text-white sm:text-2xl">
            Common questions
          </h2>
          <div className="mt-6 space-y-2">
            {SEO_LANDING_FAQS.map((faq, index) => {
              const open = openFaq === index
              return (
                <div key={faq.q} className="site-panel !p-0 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : index)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-100"
                  >
                    {faq.q}
                    <span className="text-slate-500" aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open && (
                    <p className="border-t border-slate-700/60 px-4 py-3 text-sm leading-relaxed text-slate-400">
                      {faq.a}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Prefer a printable guide?{' '}
            <a
              href="/archive-guide.html"
              className="text-orange-400 underline-offset-2 hover:underline"
            >
              Information Archive (offline HTML)
            </a>
          </p>
        </section>

        <footer className="space-y-2 border-t border-slate-800/80 px-4 py-8 text-center text-sm text-slate-500">
          <p>{SITE_COPYRIGHT}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <SitePrivacyLink />
            <span className="text-slate-600" aria-hidden>
              ·
            </span>
            <SiteSupportLink />
          </div>
        </footer>
      </div>
    </div>
  )
}
