import { useMemo } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import SiteBrandTitle from '../components/SiteBrandTitle'
import { SITE_COPYRIGHT, SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import {
  blueprintSeoDescription,
  buildBlueprintBreadcrumbJsonLd,
  buildBlueprintHowToJsonLd,
  formatCraftTime,
  getBlueprintBySeoSlug,
  listSeoMaterials,
  listSeoRewardMissions,
} from '../lib/blueprintSeoContent'
import { blueprintDisplayName, blueprintSeoPath } from '../lib/blueprintSeoSlug'
import { absoluteUrl } from '../config/seo'
import SiteSupportLink from '../components/layout/SiteSupportLink'
import SitePrivacyLink from '../components/layout/SitePrivacyLink'

export default function PublicBlueprintPage() {
  const { slug: rawSlug } = useParams({ strict: false }) as { slug?: string }
  const slug = (rawSlug || '').replace(/\/+$/, '')
  const bp = useMemo(() => (slug ? getBlueprintBySeoSlug(slug) : null), [slug])
  const { enterGuestPreview, user, isGuestPreview } = useAuth()
  const navigate = useNavigate()

  const name = bp ? blueprintDisplayName(bp) : ''
  const materials = bp ? listSeoMaterials(bp) : []
  const missions = bp ? listSeoRewardMissions(bp) : []
  const category = bp ? (bp.categoryName || bp.category || 'General').trim() : ''
  const craftTime = bp ? formatCraftTime(bp) : '—'
  const pageUrl = absoluteUrl(blueprintSeoPath(slug))
  const catalogUrl = absoluteUrl('/blueprints/')

  const jsonLd = useMemo(() => {
    if (!bp) return null
    return [buildBlueprintBreadcrumbJsonLd(bp, pageUrl, catalogUrl), buildBlueprintHowToJsonLd(bp, pageUrl)]
  }, [bp, pageUrl, catalogUrl])

  const openLiveTracker = () => {
    if (!user && !isGuestPreview) enterGuestPreview()
    void navigate({ to: '/', search: { q: name || undefined } })
  }

  const openMissions = () => {
    if (!user && !isGuestPreview) enterGuestPreview()
    void navigate({ to: '/targets' })
  }

  if (!bp) {
    return (
      <div className="site-page-bg min-h-screen text-slate-200" data-seo="blueprint-missing">
        <header className="border-b border-slate-800/80 bg-slate-950/80">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <Link to="/blueprints" className="min-w-0">
              <SiteBrandTitle size="compact" layout="inline" align="left" subtle />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-2xl font-semibold text-white">Blueprint not found</h1>
          <p className="mt-3 text-slate-400">
            This crafting blueprint is not in the public catalog.
          </p>
          <Link
            to="/blueprints"
            className="mt-6 inline-block text-sm font-medium text-orange-400 hover:text-orange-300"
          >
            ← All blueprints
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="site-page-bg min-h-screen text-slate-200" data-seo="blueprint-page">
      {jsonLd?.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}

      <header className="border-b border-slate-800/80 bg-slate-950/80">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/blueprints" className="min-w-0">
            <SiteBrandTitle size="compact" layout="inline" align="left" subtle />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openLiveTracker}
              className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-xs"
            >
              Open in live tracker
            </button>
            {!user ? (
              <a
                href="/#sign-in"
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-800/80"
              >
                Sign in
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-400/90">
          Star Citizen crafting blueprint
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {name} Blueprint
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{blueprintSeoDescription(bp)}</p>
        <p className="mt-2 text-sm text-slate-500">
          {category}
          {craftTime !== '—' ? ` · Craft time ${craftTime}` : ''}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openLiveTracker}
            className="site-btn-primary !px-5 !py-2.5"
          >
            Open in live blueprint tracker
          </button>
          <button
            type="button"
            onClick={openMissions}
            className="rounded-xl border border-slate-600 bg-slate-900/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500"
          >
            Open Mission Tracker
          </button>
          <Link
            to="/blueprints"
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            All blueprints
          </Link>
        </div>

        <section className="mt-10">
          <h2 className="border-b border-slate-800 pb-2 text-lg font-semibold text-white">
            Materials
          </h2>
          {materials.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No material inputs listed.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {materials.map((m) => (
                <li key={`${m.slot}-${m.label}`} className="flex flex-wrap gap-x-2">
                  <span className="text-slate-500">{m.slot}:</span>
                  <span className="text-white">{m.label}</span>
                  <span className="text-slate-400">{m.amountText}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="border-b border-slate-800 pb-2 text-lg font-semibold text-white">
            Reward missions
          </h2>
          {missions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No reputation mission rewards listed (may be a default / starter blueprint).
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {missions.map((m) => (
                <li
                  key={m.title}
                  className="rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-3 text-sm"
                >
                  <div className="font-medium text-white">{m.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    {m.metaText ? <span>{m.metaText}</span> : null}
                    {m.standingText ? <span>{m.standingText}</span> : null}
                    {m.repText ? <span className="text-emerald-400/90">{m.repText}</span> : null}
                    {m.dropText ? <span className="text-amber-300/90">{m.dropText}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>

      <footer className="mx-auto max-w-3xl space-y-1 px-4 py-8 text-xs text-slate-600 sm:px-6">
        <p>{SITE_COPYRIGHT}</p>
        <p>{SITE_SLOGAN}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <SitePrivacyLink />
          <span className="text-slate-500" aria-hidden>
            ·
          </span>
          <SiteSupportLink />
        </div>
      </footer>
    </div>
  )
}
