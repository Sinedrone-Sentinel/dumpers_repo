/**
 * Third-party trust links for Dumper Apps / BP Dumper UI.
 * Do not claim SignPath signing or OpenSSF Best Practices Passing/Gold until earned.
 */

export const GITHUB_REPO_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo' as const

export const OPENSSF_SCORECARD_URL =
  'https://scorecard.dev/viewer/?uri=github.com/Sinedrone-Sentinel/dumpers_repo' as const

export const OPENSSF_SCORECARD_BADGE_URL =
  'https://api.scorecard.dev/projects/github.com/Sinedrone-Sentinel/dumpers_repo/badge' as const

/** Display score for landing / trust UI — bump when Scorecard overall changes. */
export const OPENSSF_SCORECARD_SCORE = '6.5' as const

/** Set true only after SignPath has signed a published Windows release. */
export const SIGNPATH_SIGNING_LIVE = false as const

export const SIGNPATH_ABOUT_URL = 'https://signpath.io/' as const

export type TrustLink = {
  id: string
  label: string
  href: string
  summary: string
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
      label: `OpenSSF Scorecard ${OPENSSF_SCORECARD_SCORE}`,
      href: OPENSSF_SCORECARD_URL,
      summary: `Automated security posture score (${OPENSSF_SCORECARD_SCORE}/10) for this GitHub project.`,
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
