import React, { useEffect, useState } from 'react'
import { BP_DUMPER_DOWNLOADS, BP_DUMPER_VERSION } from '../../config/bpDumper'
import {
  CODE_SIGNING_POLICY_URL,
  SIGNPATH_ABOUT_URL,
  SIGNPATH_SIGNING_LIVE,
  VIRUSTOTAL_HOME_URL,
  getDumperTrustLinks,
} from '../../config/trustBadges'
import { fetchBpDumperRelease, type BpDumperReleaseInfo } from '../../lib/bpDumperRelease'

export default function BpDumperDownloadLinks() {
  const trustLinks = getDumperTrustLinks()
  const [release, setRelease] = useState<BpDumperReleaseInfo | null>(null)

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
        On first run, point Dumper Apps at your Star Citizen <strong className="text-slate-400">LIVE</strong>{' '}
        folder (the folder that contains Game.log). When a new Windows build is required, download{' '}
        <strong className="text-slate-400">DumperApps.exe</strong> from GitHub Releases and replace the old
        file yourself. New Windows builds only go live after a clean VirusTotal gate in CI.
      </p>

      {release?.virusTotalUrl && (
        <div className="site-surface space-y-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">VirusTotal</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Latest published <strong className="text-slate-300">DumperApps.exe</strong> was scanned on{' '}
            <a
              href={VIRUSTOTAL_HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-300 hover:text-orange-200 underline"
            >
              VirusTotal
            </a>{' '}
            before members could download it.
          </p>
          <a
            href={release.virusTotalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm text-orange-300 hover:text-orange-200 underline"
          >
            Open VirusTotal report for v{release.version}
          </a>
        </div>
      )}

      <div className="site-surface space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Code signing policy
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Free code signing provided by{' '}
          <a
            href={SIGNPATH_ABOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-300 hover:text-orange-200 underline"
          >
            SignPath.io
          </a>
          , certificate by SignPath Foundation.
          {SIGNPATH_SIGNING_LIVE
            ? ' Published Windows builds are Authenticode-signed.'
            : ' Signing activates after SignPath approval and CI secrets are configured.'}{' '}
          <a
            href={CODE_SIGNING_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-300 hover:text-orange-200 underline"
          >
            Full code signing policy
          </a>
          .
        </p>
      </div>

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
