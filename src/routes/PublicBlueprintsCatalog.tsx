import { useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import SiteBrandTitle from '../components/SiteBrandTitle'
import { SITE_COPYRIGHT, SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import { useBlueprintData } from './blueprints'
import { getSeoSlugForInternalName } from '../lib/blueprintSeoContent'
import SiteSupportLink from '../components/layout/SiteSupportLink'
import SitePrivacyLink from '../components/layout/SitePrivacyLink'

type CatalogRow = {
  name: string
  category: string
  internalName: string
  slug: string | null
}

function hasEntityClass(bp: { entityClass?: string | null }): boolean {
  return Boolean(bp.entityClass && String(bp.entityClass).trim())
}

export default function PublicBlueprintsCatalog() {
  const { data: blueprints } = useBlueprintData()
  const { enterGuestPreview, user, isGuestPreview } = useAuth()
  const navigate = useNavigate()

  const rows = useMemo(() => {
    const list: CatalogRow[] = (blueprints ?? [])
      .filter(hasEntityClass)
      .map((bp) => {
        const internalName = bp.internalName || bp.file || ''
        return {
          name: (bp.blueprintName || bp.internalName || bp.file || 'Blueprint').trim(),
          category: (bp.categoryName || bp.category || 'General').trim(),
          internalName,
          slug: internalName ? getSeoSlugForInternalName(internalName) : null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return list
  }, [blueprints])

  const byCategory = useMemo(() => {
    const map = new Map<string, CatalogRow[]>()
    for (const row of rows) {
      const key = row.category || 'General'
      const bucket = map.get(key)
      if (bucket) bucket.push(row)
      else map.set(key, [row])
    }
    return [...map.entries()].sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [rows])

  const openApp = () => {
    if (!user && !isGuestPreview) enterGuestPreview()
    void navigate({ to: '/' })
  }

  return (
    <div className="site-page-bg min-h-screen text-slate-200" data-seo="blueprints-catalog">
      <header className="border-b border-slate-800/80 bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="min-w-0">
            <SiteBrandTitle size="compact" layout="inline" align="left" subtle />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openApp}
              className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-xs"
            >
              {user || isGuestPreview ? 'Open blueprint tracker' : 'Browse tools offline'}
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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-400/90">
          Free Star Citizen reference
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Star Citizen Crafting Blueprint Database &amp; Tracker
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Free Star Citizen crafting blueprint database — browse craftable blueprint names by
          category from game data. Open Offline Mode for the full blueprint tracker with materials,
          mission rewards, and Dumper&apos;s Fair-Value Price (DFP).
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {rows.length.toLocaleString()} blueprints listed
          {byCategory.length > 0 ? ` across ${byCategory.length} categories` : ''}.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openApp}
            className="site-btn-primary !px-5 !py-2.5"
          >
            Open full blueprint tracker offline
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-600 bg-slate-900/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500"
            onClick={() => {
              if (!user && !isGuestPreview) enterGuestPreview()
              void navigate({ to: '/wikelo' })
            }}
          >
            Wikelo barter guide
          </button>
        </div>

        <div className="mt-10 space-y-8">
          {byCategory.map(([category, items]) => {
            const catId = `cat-${category.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`
            return (
              <section key={category} aria-labelledby={catId}>
                <h2 id={catId} className="border-b border-slate-800 pb-2 text-lg font-semibold text-white">
                  {category}
                  <span className="ml-2 text-sm font-normal text-slate-500">({items.length})</span>
                </h2>
                <ul className="mt-3 columns-1 gap-x-8 sm:columns-2 lg:columns-3">
                  {items.map((row) => (
                    <li
                      key={row.internalName || row.name}
                      className="break-inside-avoid py-0.5 text-sm text-slate-300"
                    >
                      {row.slug ? (
                        <Link
                          to="/blueprints/$slug"
                          params={{ slug: row.slug }}
                          className="text-slate-300 hover:text-orange-300"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-slate-400">Loading blueprint catalog…</p>
        ) : null}
      </main>

      <footer className="mx-auto max-w-5xl space-y-1 px-4 py-8 text-xs text-slate-600 sm:px-6">
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
