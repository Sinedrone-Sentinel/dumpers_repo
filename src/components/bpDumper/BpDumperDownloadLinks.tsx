import React from 'react'
import { GITHUB_RELEASES_PAGE } from '../../config/bpDumper'
import { BP_DUMPER_DOWNLOADS } from '../../lib/bpDumperRelease'
import { useBpDumperRelease } from '../../hooks/useBpDumperRelease'

const WINDOWS_INSTALLER = BP_DUMPER_DOWNLOADS[0]

export default function BpDumperDownloadLinks() {
  const { release, loading, error } = useBpDumperRelease()
  const downloadUrl = release.downloadUrlFor(WINDOWS_INSTALLER.filename)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-300">
          Latest release:{' '}
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
          View all releases
        </a>
      </div>

      {error && (
        <p className="text-xs text-slate-500">
          {error}. Showing bundled version; download link still points at GitHub.
        </p>
      )}

      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col gap-0.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 transition-colors hover:border-amber-400/70 hover:bg-amber-500/15"
      >
        <span className="text-sm font-medium text-white">
          {WINDOWS_INSTALLER.label}
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Start here
          </span>
        </span>
        <span className="text-xs text-slate-400 leading-relaxed">{WINDOWS_INSTALLER.description}</span>
        <span className="text-[11px] text-slate-500 font-mono truncate">{WINDOWS_INSTALLER.filename}</span>
      </a>

      <p className="text-xs text-slate-500 leading-relaxed">
        Windows only today. Blueprint sync and Live Mission Tracker run from the installed desktop app.
      </p>
    </div>
  )
}
