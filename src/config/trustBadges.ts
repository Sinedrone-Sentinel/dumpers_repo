/**
 * Third-party trust links / badge images for Dumper Apps and Archive trust UI.
 * Do not claim SignPath signing until SIGNPATH_SIGNING_LIVE.
 * OpenSSF Best Practices Passing + Baseline-1 earned (project 13989).
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

/**
 * Set true only after SignPath has signed a published Windows release.
 * Credit text is always shown; this flag controls the “builds are signed” claim only.
 *
 * When approved: see docs/TRUST_AND_SIGNING.md → “SignPath — YOUR next steps after approval”
 * (or tell the agent “SignPath is approved”).
 */
export const SIGNPATH_SIGNING_LIVE = false as const

export const SIGNPATH_ABOUT_URL = 'https://signpath.io/' as const

/** Exact credit required by SignPath Foundation conditions. */
export const SIGNPATH_CREDIT_TEXT =
  'Free code signing provided by SignPath.io, certificate by SignPath Foundation' as const

export const CODE_SIGNING_POLICY_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/blob/main/docs/CODE_SIGNING_POLICY.md' as const

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
      id: 'best-practices',
      label: 'OpenSSF Best Practices',
      href: OPENSSF_BEST_PRACTICES_URL,
      summary: 'OpenSSF Best Practices Passing badge for this repository (project 13989).',
    },
    {
      id: 'baseline',
      label: 'OpenSSF Baseline',
      href: OPENSSF_BEST_PRACTICES_URL,
      summary: 'Open Source Project Security Baseline Level 1 for this repository.',
    },
  ]
  links.push({
    id: 'signpath',
    label: SIGNPATH_SIGNING_LIVE ? 'SignPath code signing' : 'SignPath Foundation',
    href: SIGNPATH_ABOUT_URL,
    summary: SIGNPATH_SIGNING_LIVE
      ? 'Windows builds are Authenticode-signed via SignPath Foundation.'
      : `${SIGNPATH_CREDIT_TEXT}. See Code signing policy for roles and release flow.`,
  })
  links.push({
    id: 'code-signing-policy',
    label: 'Code signing policy',
    href: CODE_SIGNING_POLICY_URL,
    summary: 'Roles, privacy statement, and what SignPath signs for Dumper Apps.',
  })
  return links
}
