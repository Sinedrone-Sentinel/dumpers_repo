import React from 'react'

export type AppDownloadCardProps = {
  href: string
  label: string
  description?: string
  versionLabel?: string | null
  recommended?: boolean
  meta?: string | null
}

/** Shared download / install card — same chrome as BP Dumper downloads. */
export default function AppDownloadCard({
  href,
  label,
  description,
  versionLabel,
  recommended = false,
  meta,
}: AppDownloadCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        recommended
          ? 'flex flex-col gap-0.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 transition-colors hover:border-amber-400/70 hover:bg-amber-500/15'
          : 'flex flex-col gap-0.5 rounded-lg border border-orange-500/25 bg-slate-950/40 px-4 py-3 transition-colors hover:border-orange-400/40 hover:bg-slate-900/50'
      }
    >
      <span className="text-sm font-medium text-white">
        {label}
        {recommended ? (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Recommended
          </span>
        ) : null}
      </span>
      {versionLabel ? (
        <span className="text-xs text-slate-300">
          Current app version: <span className="font-medium text-amber-300">{versionLabel}</span>
        </span>
      ) : null}
      {meta ? <span className="text-[11px] text-slate-500">{meta}</span> : null}
      {description ? (
        <span className="text-xs text-slate-400 leading-relaxed">{description}</span>
      ) : null}
    </a>
  )
}
