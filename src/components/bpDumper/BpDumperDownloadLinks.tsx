import React, { useEffect, useState } from 'react'
import { BP_DUMPER_DOWNLOADS, BP_DUMPER_VERSION } from '../../config/bpDumper'
import { getDumperTrustLinks } from '../../config/trustBadges'
import { fetchBpDumperRelease, type BpDumperReleaseInfo } from '../../lib/bpDumperRelease'

function formatGatedAt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function EngineList({ title, engines, empty }: { title: string; engines: string[]; empty: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {engines.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-300">
          {engines.map((engine) => (
            <li key={engine} className="break-words">
              {engine}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function BpDumperDownloadLinks() {
  const trustLinks = getDumperTrustLinks()
  const [release, setRelease] = useState<BpDumperReleaseInfo | null>(null)
  const [vtOpen, setVtOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchBpDumperRelease()
      .then((info) => {
        if (!cancelled) setRelease(info)
      })
      .catch(() => {
        /* keep static trust links */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const vtReport = release?.virusTotalReport ?? null
  const vtUrl = release?.virusTotalUrl ?? null
  const gatedLabel = formatGatedAt(vtReport?.gatedAt ?? null)

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
        Windows exe and Python scripts <strong className="text-slate-400">auto-detect</strong> your Star
        Citizen install (searches for LIVE / Game.log). You can also paste a path if you prefer. When a
        new Windows build is required, download <strong className="text-slate-400">DumperApps.exe</strong>{' '}
        from GitHub Releases and replace the old file yourself. New Windows builds only go live after the
        VirusTotal CI gate: <strong className="text-slate-400">named malware-family</strong> hits block
        publish; common <strong className="text-slate-400">generic/ML heuristic</strong> labels (e.g.
        Wacatac) are ignored — you may still see those on the VirusTotal report.
      </p>

      {trustLinks.length > 0 && (
        <div className="site-surface space-y-3 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Trust & transparency
          </p>
          <ul className="space-y-3">
            {trustLinks.map((link) => {
              if (link.id === 'virustotal') {
                return (
                  <li key={link.id} id="virustotal-findings" className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setVtOpen((open) => !open)}
                      className="flex w-full items-start gap-3 rounded-md text-left transition-colors hover:bg-slate-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400/70"
                      aria-expanded={vtOpen}
                    >
                      <span className="mt-0.5 inline-flex h-5 min-w-[4.5rem] items-center justify-center rounded bg-sky-500/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                        VT
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm text-orange-300 underline">
                          {link.label}
                          <span className="ml-1 text-xs text-slate-500 no-underline">
                            {vtOpen ? '(hide findings)' : '(show findings)'}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 leading-relaxed">
                          {link.summary}
                        </span>
                      </span>
                    </button>

                    {vtOpen && (
                      <div className="ml-0 space-y-3 rounded-md border border-slate-700/70 bg-slate-950/50 p-3 sm:ml-[4.5rem]">
                        {!release ? (
                          <p className="text-xs text-slate-500">Loading latest VirusTotal gate report…</p>
                        ) : vtReport ? (
                          <>
                            <div className="flex flex-wrap gap-2 text-[11px]">
                              <span className="site-badge-slate">
                                malicious {vtReport.stats.malicious}
                              </span>
                              <span className="site-badge-slate">
                                suspicious {vtReport.stats.suspicious}
                              </span>
                              <span className="site-badge-slate">
                                undetected {vtReport.stats.undetected}
                              </span>
                              <span className="site-badge-slate">
                                gate {vtReport.gateMode}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              Latest published <strong className="text-slate-300">DumperApps.exe</strong>{' '}
                              (v{release.version})
                              {gatedLabel ? <> · scanned {gatedLabel}</> : null}. Named-family hits:{' '}
                              <strong className="text-slate-300">
                                {vtReport.namedMaliciousEngines.length}
                              </strong>
                              ; generic/ML hits shown below do not block publish.
                            </p>
                            <EngineList
                              title="Named malware-family (blocks publish)"
                              engines={vtReport.namedMaliciousEngines}
                              empty="None — gate passed."
                            />
                            <EngineList
                              title="Generic / ML heuristic (allowed)"
                              engines={vtReport.genericMaliciousEngines}
                              empty="None reported."
                            />
                            {vtReport.suspiciousEngines.length > 0 && (
                              <EngineList
                                title="Suspicious"
                                engines={vtReport.suspiciousEngines}
                                empty="None reported."
                              />
                            )}
                            {vtReport.sha256 ? (
                              <p className="break-all text-[11px] text-slate-500">
                                SHA-256: {vtReport.sha256}
                              </p>
                            ) : null}
                            <a
                              href={vtReport.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-sm text-orange-300 hover:text-orange-200 underline"
                            >
                              Open full VirusTotal report
                            </a>
                          </>
                        ) : vtUrl ? (
                          <>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              Findings summary is unavailable, but a VirusTotal report link was published
                              for v{release.version}.
                            </p>
                            <a
                              href={vtUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-sm text-orange-300 hover:text-orange-200 underline"
                            >
                              Open VirusTotal report for v{release.version}
                            </a>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500 leading-relaxed">
                            No VirusTotal gate report found on the latest GitHub Release yet.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              }

              return (
                <li key={link.id}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-md transition-colors hover:bg-slate-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400/70"
                  >
                    {link.badgeSrc ? (
                      <img
                        src={link.badgeSrc}
                        alt=""
                        className="mt-0.5 h-5 w-auto max-w-[9rem] shrink-0 opacity-95"
                        loading="lazy"
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="text-sm text-orange-300 underline">{link.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500 leading-relaxed">
                        {link.summary}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
