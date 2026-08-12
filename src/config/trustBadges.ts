/**
 * Third-party trust links / badge images for Dumper Apps and Archive trust UI.
 * OpenSSF Best Practices Passing + Baseline-2 earned (project 13989).
 */

export const GITHUB_REPO_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo' as const

export const OPENSSF_SCORECARD_URL =
  'https://scorecard.dev/viewer/?uri=github.com/Sinedrone-Sentinel/dumpers_repo' as const

export const OPENSSF_SCORECARD_BADGE_URL =
  'https://api.scorecard.dev/projects/github.com/Sinedrone-Sentinel/dumpers_repo/badge' as const

export const OPENSSF_BEST_PRACTICES_URL =
  'https://www.bestpractices.dev/projects/13989' as const

/** Metal badge (Passing / Silver / Gold) — live image from BadgeApp. */
export const OPENSSF_BEST_PRACTICES_BADGE_URL =
  'https://www.bestpractices.dev/projects/13989/badge' as const

export const OPENSSF_BASELINE_BADGE_URL =
  'https://www.bestpractices.dev/projects/13989/baseline' as const

export const VIRUSTOTAL_HOME_URL = 'https://www.virustotal.com/' as const

export const VERIFY_RELEASE_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/blob/main/docs/VERIFY_RELEASE.md' as const

export type TrustLink = {
  id: string
  label: string
  href: string
  summary: string
  /** OpenSSF (or similar) badge image shown next to the row label. */
  badgeSrc?: string
}

export type TrustBadgeImage = {
  id: string
  alt: string
  href: string
  src: string
}

/** Image badges for Archive / public trust strips (Scorecard + Best Practices + Baseline). */
export function getPublicTrustBadgeImages(): TrustBadgeImage[] {
  return [
    {
      id: 'scorecard',
      alt: 'OpenSSF Scorecard',
      href: OPENSSF_SCORECARD_URL,
      src: OPENSSF_SCORECARD_BADGE_URL,
    },
    {
      id: 'best-practices',
      alt: 'OpenSSF Best Practices',
      href: OPENSSF_BEST_PRACTICES_URL,
      src: OPENSSF_BEST_PRACTICES_BADGE_URL,
    },
    {
      id: 'baseline',
      alt: 'OpenSSF Baseline',
      href: OPENSSF_BEST_PRACTICES_URL,
      src: OPENSSF_BASELINE_BADGE_URL,
    },
  ]
}

/** Member-facing trust links for the BP Dumper download panel. */
export function getDumperTrustLinks(): TrustLink[] {
  return [
    {
      id: 'source',
      label: 'Source on GitHub',
      href: GITHUB_REPO_URL,
      summary:
        'Windows DumperApps.exe is the public Go client; Python scripts in this repo cover macOS/Linux and the protocol reference.',
    },
    {
      id: 'scorecard',
      label: 'OpenSSF Scorecard',
      href: OPENSSF_SCORECARD_URL,
      badgeSrc: OPENSSF_SCORECARD_BADGE_URL,
      summary: 'Live OpenSSF Scorecard for this GitHub project (score updates with each scan).',
    },
    {
      id: 'best-practices',
      label: 'OpenSSF Best Practices',
      href: OPENSSF_BEST_PRACTICES_URL,
      badgeSrc: OPENSSF_BEST_PRACTICES_BADGE_URL,
      summary: 'OpenSSF Best Practices Passing badge for this repository (project 13989).',
    },
    {
      id: 'baseline',
      label: 'OpenSSF Baseline',
      href: OPENSSF_BEST_PRACTICES_URL,
      badgeSrc: OPENSSF_BASELINE_BADGE_URL,
      summary: 'Open Source Project Security Baseline Level 2 for this repository.',
    },
    {
      id: 'virustotal',
      label: 'VirusTotal gate',
      href: '#virustotal-findings',
      summary:
        'Windows builds stay draft until the VirusTotal CI gate passes. Click to expand the latest scan findings (named malware-family hits block publish; generic/ML heuristics may still appear).',
    },
    {
      id: 'verify-release',
      label: 'Verify release checksums',
      href: VERIFY_RELEASE_URL,
      summary:
        'Each GitHub Release includes SHA256SUMS and a cosign-signed manifest so you can verify DumperApps.exe integrity. Builds are not Authenticode-signed.',
    },
  ]
}
