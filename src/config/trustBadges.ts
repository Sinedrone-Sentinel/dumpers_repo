/**
 * Third-party trust links / badge images for Dumper Apps and Archive trust UI.
 * Do not claim SignPath signing or OpenSSF Best Practices Passing/Gold until earned.
 * OpenSSF Baseline-1 is earned (project 13989).
 */

export const GITHUB_REPO_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo' as const

export const OPENSSF_SCORECARD_URL =
  'https://scorecard.dev/viewer/?uri=github.com/Sinedrone-Sentinel/dumpers_repo' as const

export const OPENSSF_SCORECARD_BADGE_URL =
  'https://api.scorecard.dev/projects/github.com/Sinedrone-Sentinel/dumpers_repo/badge' as const

export const OPENSSF_BEST_PRACTICES_URL =
  'https://www.bestpractices.dev/projects/13989' as const

export const OPENSSF_BASELINE_BADGE_URL =
  'https://www.bestpractices.dev/projects/13989/baseline' as const

/** Set true only after SignPath has signed a published Windows release. */
export const SIGNPATH_SIGNING_LIVE = false as const

export const SIGNPATH_ABOUT_URL = 'https://signpath.io/' as const

export type TrustLink = {
  id: string
  label: string
  href: string
  summary: string
}

export type TrustBadgeImage = {
  id: string
  alt: string
  href: string
  src: string
}

/** Image badges for Archive / public trust strips (Scorecard + Baseline). */
export function getPublicTrustBadgeImages(): TrustBadgeImage[] {
  return [
    {
      id: 'scorecard',
      alt: 'OpenSSF Scorecard',
      href: OPENSSF_SCORECARD_URL,
      src: OPENSSF_SCORECARD_BADGE_URL,
    },
    {
      id: 'baseline',
      alt: 'OpenSSF Baseline',
      href: OPENSSF_BEST_PRACTICES_URL,
      src: OPENSSF_BASELINE_BADGE_URL,
    },
  ]
}

/** Member-facing trust links (omit SignPath until SIGNPATH_SIGNING_LIVE). */
export function getDumperTrustLinks(): TrustLink[] {
  const links: TrustLink[] = [
    {
      id: 'source',
      label: 'Source on GitHub',
      href: GITHUB_REPO_URL,
      summary: 'BP Dumper is built from the public Python watcher in this repository.',
    },
    {
      id: 'scorecard',
      label: 'OpenSSF Scorecard',
      href: OPENSSF_SCORECARD_URL,
      summary: 'Live OpenSSF Scorecard for this GitHub project (score updates with each scan).',
    },
    {
      id: 'baseline',
      label: 'OpenSSF Baseline',
      href: OPENSSF_BEST_PRACTICES_URL,
      summary: 'Open Source Project Security Baseline Level 1 for this repository.',
    },
  ]
  if (SIGNPATH_SIGNING_LIVE) {
    links.push({
      id: 'signpath',
      label: 'SignPath code signing',
      href: SIGNPATH_ABOUT_URL,
      summary: 'Windows builds are Authenticode-signed via SignPath Foundation.',
    })
  }
  return links
}
