import React from 'react'
import { BP_DUMPER_DOWNLOADS, BP_DUMPER_VERSION } from '../../config/bpDumper'

export default function BpDumperDownloadLinks() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Current app version:{' '}
        <span className="text-amber-300 font-medium">v{BP_DUMPER_VERSION}</span>
      </p>

      <div className="space-y-2">
        {BP_DUMPER_DOWNLOADS.map((opt) => {
          const isPrimary = opt.id === 'windows-store'
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
                    Windows
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-400 leading-relaxed">{opt.description}</span>
            </a>
          )
        })}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Windows Store: pick your Star Citizen LIVE folder when the app asks (it does not scan your
        drives). macOS / Linux: use the Python scripts (Python 3 +{' '}
        <span className="font-mono">requirements.txt</span>).
      </p>
    </div>
  )
}
