import React from 'react'
import { BP_DUMPER_DOWNLOADS, BP_DUMPER_VERSION } from '../../config/bpDumper'
import { getDumperTrustLinks } from '../../config/trustBadges'

export default function BpDumperDownloadLinks() {
  const trustLinks = getDumperTrustLinks()

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Current app version:{' '}
        <span className="text-amber-300 font-medium">v{BP_DUMPER_VERSION}</span>
      </p>

      <div className="space-y-2">
        {BP_DUMPER_DOWNLOADS.map((opt) => {
          const isPrimary = opt.id === 'windows-exe'
          return (
            <a
              key={opt.id}
              href={opt.url}
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
            </a>
          )
        })}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Windows exe and Python scripts <strong className="text-slate-400">auto-detect</strong> your
        Star Citizen install (searches for LIVE / Game.log). You can also paste a path if you prefer.
        Updates come from GitHub Releases when “Keep App Up to Date” is on.
      </p>

      {trustLinks.length > 0 && (
        <div className="site-surface space-y-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Trust & transparency
          </p>
          <ul className="space-y-1.5">
            {trustLinks.map((link) => (
              <li key={link.id}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-orange-300 hover:text-orange-200 underline"
                >
                  {link.label}
                </a>
                <span className="block text-xs text-slate-500 leading-relaxed">{link.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
