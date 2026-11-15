import React, { useEffect, useState } from 'react'
import {
  STARORG_STRINGS_DISPLAY_NAME,
  STARORG_STRINGS_PRODUCT_NAME,
  STARORG_STRINGS_RELEASES_PAGE,
} from '../../config/dumperApps'
import {
  fetchStarOrgStringsRelease,
  type StarOrgStringsRelease,
} from '../../lib/starOrgStringsRelease'
import AppDownloadCard from './AppDownloadCard'

const POLL_MS = 10 * 60 * 1000

export default function StarOrgStringsPanel() {
  const [release, setRelease] = useState<StarOrgStringsRelease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const load = async () => {
      try {
        const next = await fetchStarOrgStringsRelease()
        if (cancelled) return
        setRelease(next)
        setError(null)
      } catch {
        if (cancelled) return
        setError('Could not load the latest GitHub release. Open the releases page instead.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    timer = window.setInterval(() => {
      void load()
    }, POLL_MS)

    return () => {
      cancelled = true
      if (timer != null) window.clearInterval(timer)
    }
  }, [])

  const published =
    release?.publishedAt && !Number.isNaN(Date.parse(release.publishedAt))
      ? new Date(release.publishedAt).toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">What it is</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          <strong className="text-slate-300">{STARORG_STRINGS_PRODUCT_NAME}</strong> ({STARORG_STRINGS_DISPLAY_NAME})
          is Zedwil&apos;s Star Citizen localization helper — clearer component tags, ship/weapon stats
          blocks, and mission facts in your local <span className="font-mono text-slate-300">global.ini</span>,
          built from your own install and removable in one click. Desktop app for Windows and Linux, plus
          a CLI. No account. Offline by default.
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Unofficial fan tool — not affiliated with Cloud Imperium / RSI. Downloads below always track
          the latest GitHub release.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Downloads</h3>
          {release ? (
            <p className="text-xs text-slate-400">
              Latest{' '}
              <span className="font-medium text-amber-300">v{release.version}</span>
              {published ? <> · {published}</> : null}
            </p>
          ) : null}
        </div>

        {loading && !release ? (
          <p className="text-sm text-slate-500">Loading latest release…</p>
        ) : null}

        {error ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-200/90" role="alert">
              {error}
            </p>
            <AppDownloadCard
              href={STARORG_STRINGS_RELEASES_PAGE}
              label="Open GitHub Releases"
              description="Browse every build and checksum on GitHub."
              recommended
            />
          </div>
        ) : null}

        {release?.assets?.length ? (
          <div className="space-y-2">
            {release.assets.map((asset) => (
              <AppDownloadCard
                key={asset.id}
                href={asset.url}
                label={asset.label}
                description={asset.description}
                recommended={asset.recommended}
                versionLabel={`v${release.version}`}
                meta={[asset.name, asset.sizeLabel].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        ) : null}

        <a
          href={release?.htmlUrl || STARORG_STRINGS_RELEASES_PAGE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-sm text-orange-300 underline hover:text-orange-200"
        >
          All releases on GitHub
        </a>
      </section>
    </div>
  )
}
