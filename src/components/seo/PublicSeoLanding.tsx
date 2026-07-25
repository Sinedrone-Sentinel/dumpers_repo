import React, { useEffect, useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import SiteBrandTitle from '../SiteBrandTitle'
import OAuthSignInButtons from '../auth/OAuthSignInButtons'
import { SITE_COPYRIGHT, SITE_SLOGAN } from '../../config/site'
import { buildJsonLdGraph } from '../../config/seo'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

type FeatureCard = {
  title: string
  body: string
  href?: string
  /** Offline tools vs sign-in for member-only features like the marketplace */
  action: 'offline' | 'signin'
  cta: string
}

const FEATURES: FeatureCard[] = [
  {
    title: 'Crafting blueprints',
    body: "Browse Star Citizen craftable items, materials, quality bands, and Dumper's Fair-Value Price (DFP) estimates — filter by type, manufacturer, and acquisition.",
    href: '/',
    action: 'offline',
    cta: 'Open in Offline Mode →',
  },
  {
    title: 'Blueprint missions',
    body: 'Look up which reputation contracts reward crafting blueprints, build a wishlist, and sync unlocks with BP Dumper watch mode.',
    href: '/targets',
    action: 'offline',
    cta: 'Open in Offline Mode →',
  },
  {
    title: 'Wikelo Emporium',
    body: 'Every Wikelo barter trade in one place — hand-ins, rewards, customer rank, and blueprint tags.',
    href: '/wikelo',
    action: 'offline',
    cta: 'Open in Offline Mode →',
  },
  {
    title: 'Mining & resources',
    body: 'Ore guidance, RS tracking, crew mining ledgers, and a personal resource stock tracker for fabricator planning.',
    href: '/mining-tracker',
    action: 'offline',
    cta: 'Open in Offline Mode →',
  },
  {
    title: 'Commodity lookup',
    body: 'Quick commodity reference with DFP bases for trading and crafting cost context.',
    href: '/commodity-lookup',
    action: 'offline',
    cta: 'Open in Offline Mode →',
  },
  {
    title: 'Community marketplace',
    body: 'Member WTB/WTS listings and The Bazaar — craft, list, and fulfill with your community after you sign in.',
    action: 'signin',
    cta: 'Sign in to use the marketplace →',
  },
]

const FAQS = [
  {
    q: 'Do I need an account to use Star Citizen tools here?',
    a: 'No. Choose Browse tools offline to explore blueprints, missions, mining, resources, Wikelo, and the archive in this browser. Sign in when you want cloud sync, the community marketplace, and BP Dumper.',
  },
  {
    q: "What is Dumper's Fair-Value Price (DFP)?",
    a: "DFP is a proprietary fair-value estimate for crafted gear and materials so members can price WTB/WTS listings consistently. It is shown on blueprint and resource tools when enabled on this site.",
  },
  {
    q: 'How do crafting blueprints unlock in Star Citizen?',
    a: 'Many blueprints drop from reputation missions, faction progression, or related activities. Use Mission Tracker and blueprint detail views here to see which contracts reward each recipe.',
  },
  {
    q: 'What is BP Dumper?',
    a: 'BP Dumper is a desktop Game.log watcher that syncs newly acquired blueprints to your account and powers the Live Mission Tracker while you play.',
  },
  {
    q: 'Who is this site for?',
    a: "Anyone can browse the tools in Offline Mode. Signed-in members get sync, BP Dumper, and the community marketplace on this deployment.",
  },
] as const

type PublicSeoLandingProps = {
  onBrowseOffline: () => void
}

export default function PublicSeoLanding({ onBrowseOffline }: PublicSeoLandingProps) {
  const { loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [autoApproveEnabled, setAutoApproveEnabled] = useState<boolean | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const jsonLdId = useId()

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
    goOffline(feature.href ?? '/')
  }

  return (
    <div className="site-page-bg min-h-screen text-slate-200">
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(249, 115, 22, 0.35), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 20%, rgba(250, 204, 21, 0.12), transparent 50%)',
          }}
          aria-hidden
        />

        <header className="relative mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
          <SiteBrandTitle size="hero" layout="stacked" slogan={SITE_SLOGAN} titleAs="p" />
          <h1 className="mx-auto mt-8 max-w-3xl text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            Star Citizen tools for blueprints, crafting missions, mining, and community trade
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-slate-300 sm:text-lg">
            Browse craftable items, track blueprint unlocks, plan resources, and use a member
            marketplace — with Offline Mode for instant access and sign-in when you want sync.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => goOffline('/')}
              className="w-full max-w-xs rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/30 transition hover:from-orange-500 hover:to-amber-400 sm:w-auto"
            >
              Browse tools offline
            </button>
            <a
              href="#sign-in"
              className="w-full max-w-xs rounded-xl border border-slate-600 bg-slate-900/60 px-6 py-3 text-center text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80 sm:w-auto"
            >
              Sign in for sync & marketplace
            </a>
          </div>
        </header>

        <section className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-center text-xl font-semibold text-white sm:text-2xl">
            Some of what you can do
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400">
            Practical tools for crafting, mining, missions, and community trade — ready when you are.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <button
                  type="button"
                  onClick={() => onFeatureClick(feature)}
                  className="flex h-full w-full flex-col rounded-2xl border border-slate-700/80 bg-slate-900/50 p-5 text-left transition hover:border-orange-500/40 hover:bg-slate-900/80"
                >
                  <span className="text-base font-semibold text-white">{feature.title}</span>
                  <span className="mt-2 text-sm leading-relaxed text-slate-400">{feature.body}</span>
                  <span className="mt-4 text-xs font-medium text-orange-400">{feature.cta}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="sign-in"
          className="relative mx-auto max-w-md px-4 py-10 sm:px-6"
          aria-labelledby="signin-heading"
        >
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-8 shadow-2xl">
            <h2 id="signin-heading" className="text-center text-xl font-semibold text-white">
              Sign in
            </h2>
            <p className="mt-2 text-center text-sm text-slate-400">
              Google or Discord — sync blueprints, listings, and BP Dumper across devices.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/50 bg-red-900/50 p-3 text-sm text-red-400">
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
                <span className="bg-slate-900/80 px-2 text-slate-500">or</span>
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

        <section className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-center text-xl font-semibold text-white sm:text-2xl">
            Common questions
          </h2>
          <div className="mt-6 space-y-2">
            {FAQS.map((faq, index) => {
              const open = openFaq === index
              return (
                <div
                  key={faq.q}
                  className="rounded-xl border border-slate-700/80 bg-slate-900/40"
                >
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

        <footer className="relative border-t border-slate-800/80 px-4 py-8 text-center text-sm text-slate-500">
          {SITE_COPYRIGHT}
        </footer>
      </div>
    </div>
  )
}
