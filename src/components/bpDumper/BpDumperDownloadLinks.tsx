import React from 'react'
import { GITHUB_RELEASES_PAGE } from '../../config/bpDumper'
import { BP_DUMPER_DOWNLOADS } from '../../lib/bpDumperRelease'
import type { BpDumperDownloadOption } from '../../config/bpDumper'
import { useBpDumperRelease } from '../../hooks/useBpDumperRelease'

const DOWNLOAD_GROUPS: { id: BpDumperDownloadOption['group']; title: string; hint?: string }[] = [
  {
    id: 'windows',
    title: 'Windows',
    hint: 'Includes blueprint sync and Live Mission Tracker. Python is bundled — nothing else to install.',
  },
  {
    id: 'mac-linux',
    title: 'Mac & Linux',
    hint: 'Blueprint log sync only on these platforms today.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    hint: 'For advanced users who want to run Python manually.',
  },
]

function DownloadCard({
  option,
  downloadUrl,
  highlighted,
}: {
  option: BpDumperDownloadOption
  downloadUrl: string
  highlighted?: boolean
}) {
  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors ${
        highlighted
          ? 'border-amber-500/50 bg-amber-500/10 hover:border-amber-400/70 hover:bg-amber-500/15'
          : 'border-slate-700 bg-slate-800/50 hover:border-amber-500/40 hover:bg-slate-800'
      }`}
    >
      <span className="text-sm font-medium text-white">
        {option.label}
        {highlighted ? (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Start here
          </span>
        ) : null}
      </span>
      <span className="text-xs text-slate-400 leading-relaxed">{option.description}</span>
      <span className="text-[11px] text-slate-500 font-mono truncate">{option.filename}</span>
    </a>
  )
}

export default function BpDumperDownloadLinks() {
  const { release, loading, error } = useBpDumperRelease()

  return (
    <div className="space-y-4">
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
          {error}. Showing bundled version; download links still point at GitHub.
        </p>
      )}

      {DOWNLOAD_GROUPS.map((group) => {
        const options = BP_DUMPER_DOWNLOADS.filter((option) => option.group === group.id)
        if (options.length === 0) return null
        return (
          <div key={group.id} className="space-y-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.title}
              </h4>
              {group.hint ? (
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{group.hint}</p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <DownloadCard
                  key={option.id}
                  option={option}
                  downloadUrl={release.downloadUrlFor(option.filename)}
                  highlighted={option.id === 'windows-installer'}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
