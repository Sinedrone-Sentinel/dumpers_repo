import React from 'react'
import { GITHUB_RELEASES_PAGE } from '../../config/bpDumper'
import { BP_DUMPER_DOWNLOADS } from '../../lib/bpDumperRelease'
import { useBpDumperRelease } from '../../hooks/useBpDumperRelease'

export default function BpDumperDownloadLinks() {
  const { release, loading, error } = useBpDumperRelease()
  const { name: downloadFilename, url: exeDownloadUrl } = release.primaryDownload

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-300">
          Latest portable release:{' '}
          <span className="text-amber-300 font-medium">
            {loading ? 'Checking GitHub…' : `v${release.version}`}
          </span>
        </p>
        <a
          href={GITHUB_RELEASES_PAGE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-amber-300 underline underline-offset-2"
        >
          View GitHub releases
        </a>
      </div>

      {error && (
        <p className="text-xs text-slate-500">
          {error}. Showing bundled version; portable exe link still points at GitHub.
        </p>
      )}

      <div className="space-y-2">
        {BP_DUMPER_DOWNLOADS.map((opt) => {
          const href =
            opt.kind === 'release-asset' ? exeDownloadUrl : (opt.url ?? GITHUB_RELEASES_PAGE)
          const isPrimary = opt.id === 'windows-store'
          return (
            <a
              key={opt.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={
                isPrimary
                  ? 'flex flex-col gap-0.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 transition-colors hover:border-amber-400/70 hover:bg-amber-500/15'
                  : 'flex flex-col gap-0.5 rounded-lg border border-orange-500/25 bg-slate-950/40 px-4 py-3 transition-colors hover:border-orange-400/40 hover:bg-slate-900/50'
              }
            >
              <span className="text-sm font-medium text-white">
                {opt.label}
                {isPrimary && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    Recommended
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-400 leading-relaxed">{opt.description}</span>
              {opt.kind === 'release-asset' && (
                <span className="text-[11px] text-slate-500 font-mono truncate">{downloadFilename}</span>
              )}
            </a>
          )
        })}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Windows: install from the Microsoft Store when you can. Portable exe is optional. macOS /
        Linux: use the Python scripts (Python 3 + <span className="font-mono">requirements.txt</span>
        ).
      </p>
    </div>
  )
}
