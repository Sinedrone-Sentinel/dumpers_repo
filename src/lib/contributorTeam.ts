import { supabase } from './supabase'

export type ContributorSeat =
  | 'pending'
  | 'denied'
  | 'triage'
  | 'contributor'
  | 'reviewer'
  | 'maintainer'
  | 'left'
  | 'revoked'

export type EntrySeat = 'triage' | 'contributor'
export type ActiveSeat = 'triage' | 'contributor' | 'reviewer' | 'maintainer'
export type GithubPermission = 'triage' | 'push' | 'maintain'
export type GithubSyncStatus = 'none' | 'pending' | 'ok' | 'error'
export type GithubPendingAction = 'invite' | 'update' | 'remove'

export const SEATS: ActiveSeat[] = ['triage', 'contributor', 'reviewer', 'maintainer']
export const ENTRY_SEATS: EntrySeat[] = ['triage', 'contributor']


export const GUIDELINES: Record<string, string> = {
  'triage->contributor':
    'Active on the team ~2+ weeks; helpful triage/comments; ready for local tooling (Node/Git; StarBreaker if doing data); clear intent to ship PRs; ideally comfortable with GitHub PRs elsewhere.',
  'contributor->reviewer':
    "Several meaningful merged PRs (~3+ over time, quality over spam); DCO/CI clean habits; useful review comments on others' PRs; trustworthy tone with members and project values.",
  'reviewer->maintainer':
    'Sustained helpful reviews and solid PRs over months; judgment you would trust near merge/process; rare — lead discretion.',
}

export const TOOLING_ITEMS: string[] = [
  'Node 22+ and npm 11+ (see .nvmrc)',
  'Git with DCO sign-off (`git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -s`)',
  'Star Citizen + StarBreaker for game-data / parse work',
  'Python for BP Dumper / desktop tooling changes',
]

export const SEAT_DEFINITIONS: {
  id: EntrySeat
  label: string
  githubPermission: GithubPermission
  summary: string
  warning?: string
}[] = [
  {
    id: 'triage',
    label: 'Triage',
    githubPermission: 'triage',
    summary:
      'Start by triaging issues and discussing PRs. No push access yet — good if you want to learn the repo before shipping code.',
    warning:
      'If you already plan to open PRs soon, prefer Contributor. Upgrading from Triage later still requires a review and wait after a denial.',
  },
  {
    id: 'contributor',
    label: 'Contributor',
    githubPermission: 'push',
    summary:
      'Write access to open pull requests. Expected to have (or quickly set up) local tooling and ship focused changes with DCO.',
  },
]

export const INTEREST_AREA_OPTIONS = [
  { id: 'frontend', label: 'Frontend / UI' },
  { id: 'game_data', label: 'Game data / parse pipeline' },
  { id: 'mining', label: 'Mining tools' },
  { id: 'marketplace', label: 'Marketplace / orders' },
  { id: 'dumper', label: 'Dumper Apps / desktop' },
  { id: 'docs', label: 'Docs / Archive' },
  { id: 'infra', label: 'Infra / Supabase / CI' },
  { id: 'other', label: 'Other' },
] as const

export type ContributorApplication = {
  id: string
  userId: string
  githubLogin: string
  requestedEntrySeat: EntrySeat
  seat: ContributorSeat
  githubPermission: GithubPermission | null
  discordHandle: string | null
  playActivity: string | null
  interestAreas: string[]
  motivation: string | null
  oneFixOrFeature: string
  skills: string | null
  experienceLink: string | null
  pledgeFairPricing: boolean
  pledgeEaseOfUse: boolean
  pledgeNoSabotage: boolean
  pledgeToolsReadiness: boolean
  pledgeNoHandholding: boolean
  pledgeAcceptedAt: string
  githubSyncStatus: GithubSyncStatus
  githubPendingAction: GithubPendingAction | null
  githubSyncError: string | null
  githubSyncedAt: string | null
  adminNotes: string | null
  denyReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  lastUpgradeDeniedAt: string | null
  leftAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ContributorUpgradeRequest = {
  id: string
  applicationId?: string
  userId?: string
  fromSeat: string
  toSeat: string
  justification: string
  evidenceLinks: unknown
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  adminNotes?: string | null
  evaluationBrief?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  createdAt: string
  updatedAt?: string
}

export type ContributorProgramConfig = {
  enabled: boolean
  githubOwner: string | null
  githubRepo: string | null
  githubCodeownersHandle: string | null
  repoUrl: string | null
}

export type ContributorProfileSnippet = {
  displayName?: string | null
  email?: string | null
  rsiHandle?: string | null
  rsiHandleVerified?: boolean | null
  role?: string | null
  memberSince?: string | null
}

function asRpc<T>(data: unknown, fallbackError: string): T {
  const row = (data ?? {}) as { success?: boolean; error?: string }
  if (row.success === false) {
    return { ...(row as object), success: false, error: row.error || fallbackError } as T
  }
  return { success: true, ...(row as object) } as T
}

export function nextSeat(seat: string | null | undefined): ActiveSeat | null {
  switch (seat) {
    case 'triage':
      return 'contributor'
    case 'contributor':
      return 'reviewer'
    case 'reviewer':
      return 'maintainer'
    default:
      return null
  }
}

export function guidelinesFor(fromSeat: string, toSeat: string): string | null {
  return GUIDELINES[`${fromSeat}->${toSeat}`] ?? null
}

export function isActiveSeat(seat: string | null | undefined): seat is ActiveSeat {
  return seat === 'triage' || seat === 'contributor' || seat === 'reviewer' || seat === 'maintainer'
}

export function seatLabel(seat: string | null | undefined): string {
  if (!seat) return '—'
  return seat.charAt(0).toUpperCase() + seat.slice(1)
}

export async function getContributorProgramConfig(): Promise<ContributorProgramConfig> {
  const { data, error } = await supabase.rpc('get_contributor_program_config')
  if (error || !data) {
    return {
      enabled: true,
      githubOwner: null,
      githubRepo: null,
      githubCodeownersHandle: null,
      repoUrl: null,
    }
  }
  const row = data as ContributorProgramConfig
  return {
    enabled: row.enabled !== false,
    githubOwner: row.githubOwner ?? null,
    githubRepo: row.githubRepo ?? null,
    githubCodeownersHandle: row.githubCodeownersHandle ?? null,
    repoUrl: row.repoUrl ?? null,
  }
}

export async function adminUpdateContributorProgramConfig(config: {
  enabled?: boolean
  githubOwner?: string | null
  githubRepo?: string | null
  githubCodeownersHandle?: string | null
}): Promise<{ success: boolean; error?: string; config?: ContributorProgramConfig }> {
  const { data, error } = await supabase.rpc('admin_update_contributor_program_config', {
    p_config: config,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Update failed')
}

export type SubmitContributorApplicationPayload = {
  githubLogin: string
  requestedEntrySeat: EntrySeat
  oneFixOrFeature: string
  pledgeFairPricing: boolean
  pledgeEaseOfUse: boolean
  pledgeNoSabotage: boolean
  pledgeToolsReadiness: boolean
  pledgeNoHandholding: boolean
  discordHandle?: string | null
  playActivity?: string | null
  interestAreas?: string[]
  motivation?: string | null
  skills?: string | null
  experienceLink?: string | null
}

export async function submitContributorApplication(
  payload: SubmitContributorApplicationPayload
): Promise<{ success: boolean; error?: string; application?: ContributorApplication }> {
  const { data, error } = await supabase.rpc('submit_contributor_application', {
    p_github_login: payload.githubLogin,
    p_requested_entry_seat: payload.requestedEntrySeat,
    p_one_fix_or_feature: payload.oneFixOrFeature,
    p_pledge_fair_pricing: payload.pledgeFairPricing,
    p_pledge_ease_of_use: payload.pledgeEaseOfUse,
    p_pledge_no_sabotage: payload.pledgeNoSabotage,
    p_pledge_tools_readiness: payload.pledgeToolsReadiness,
    p_pledge_no_handholding: payload.pledgeNoHandholding,
    p_discord_handle: payload.discordHandle ?? null,
    p_play_activity: payload.playActivity ?? null,
    p_interest_areas: payload.interestAreas ?? [],
    p_motivation: payload.motivation ?? null,
    p_skills: payload.skills ?? null,
    p_experience_link: payload.experienceLink ?? null,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Submit failed')
}

export async function listMyContributorApplication(): Promise<{
  success: boolean
  error?: string
  application?: ContributorApplication | null
  nextSeat?: string | null
  nextSeatGuidelines?: string | null
  pendingUpgrade?: ContributorUpgradeRequest | null
  config?: ContributorProgramConfig
}> {
  const { data, error } = await supabase.rpc('list_my_contributor_application')
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Load failed')
}

export async function requestContributorUpgrade(payload: {
  justification: string
  evidenceLinks?: unknown[]
}): Promise<{ success: boolean; error?: string; upgradeRequest?: ContributorUpgradeRequest }> {
  const { data, error } = await supabase.rpc('request_contributor_upgrade', {
    p_justification: payload.justification,
    p_evidence_links: payload.evidenceLinks ?? [],
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Request failed')
}

export async function cancelMyUpgradeRequest(): Promise<{
  success: boolean
  error?: string
  cancelledId?: string
}> {
  const { data, error } = await supabase.rpc('cancel_my_upgrade_request')
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Cancel failed')
}

export async function leaveContributorTeam(): Promise<{
  success: boolean
  error?: string
  application?: ContributorApplication
}> {
  const { data, error } = await supabase.rpc('leave_contributor_team')
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Leave failed')
}

export async function adminListContributorApplications(status?: string | null): Promise<
  {
    application: ContributorApplication
    profile: ContributorProfileSnippet
  }[]
> {
  const { data, error } = await supabase.rpc('admin_list_contributor_applications', {
    p_status: status ?? null,
  })
  if (error) throw new Error(error.message)
  return (data as { application: ContributorApplication; profile: ContributorProfileSnippet }[]) ?? []
}

export async function adminListUpgradeRequests(status?: string | null): Promise<
  {
    upgradeRequest: ContributorUpgradeRequest
    application: ContributorApplication
    profile: ContributorProfileSnippet
  }[]
> {
  const { data, error } = await supabase.rpc('admin_list_upgrade_requests', {
    p_status: status ?? null,
  })
  if (error) throw new Error(error.message)
  return (
    (data as {
      upgradeRequest: ContributorUpgradeRequest
      application: ContributorApplication
      profile: ContributorProfileSnippet
    }[]) ?? []
  )
}

export async function adminListActiveContributors(): Promise<
  {
    application: ContributorApplication
    profile: ContributorProfileSnippet
  }[]
> {
  const { data, error } = await supabase.rpc('admin_list_active_contributors')
  if (error) throw new Error(error.message)
  return (data as { application: ContributorApplication; profile: ContributorProfileSnippet }[]) ?? []
}

export async function adminReviewContributorApplication(payload: {
  id: string
  approve: boolean
  reviewNotes: string
  grantSeat?: EntrySeat | null
}): Promise<{ success: boolean; error?: string; application?: ContributorApplication }> {
  const { data, error } = await supabase.rpc('admin_review_contributor_application', {
    p_id: payload.id,
    p_approve: payload.approve,
    p_review_notes: payload.reviewNotes,
    p_grant_seat: payload.grantSeat ?? null,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Review failed')
}

export async function adminReviewUpgradeRequest(payload: {
  id: string
  approve: boolean
  reviewNotes: string
}): Promise<{
  success: boolean
  error?: string
  application?: ContributorApplication
  upgradeRequestId?: string
  status?: string
}> {
  const { data, error } = await supabase.rpc('admin_review_upgrade_request', {
    p_id: payload.id,
    p_approve: payload.approve,
    p_review_notes: payload.reviewNotes,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Review failed')
}

export async function adminGrantNextSeat(payload: {
  applicationId: string
  notes?: string | null
}): Promise<{ success: boolean; error?: string; application?: ContributorApplication }> {
  const { data, error } = await supabase.rpc('admin_grant_next_seat', {
    p_application_id: payload.applicationId,
    p_notes: payload.notes ?? null,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Grant failed')
}

export async function adminRevokeContributor(payload: {
  applicationId: string
  notes?: string | null
}): Promise<{ success: boolean; error?: string; application?: ContributorApplication }> {
  const { data, error } = await supabase.rpc('admin_revoke_contributor', {
    p_application_id: payload.applicationId,
    p_notes: payload.notes ?? null,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Revoke failed')
}

export async function adminBuildContributorEvaluationBrief(
  userId: string
): Promise<{ success: boolean; error?: string; markdown?: string }> {
  const { data, error } = await supabase.rpc('admin_build_contributor_evaluation_brief', {
    p_user_id: userId,
  })
  if (error) return { success: false, error: error.message }
  return asRpc(data, 'Brief failed')
}

export async function syncContributorGithub(
  applicationId: string
): Promise<{ success: boolean; error?: string; [key: string]: unknown }> {
  const { data, error } = await supabase.functions.invoke('manage-github-collaborator', {
    body: { applicationId },
  })
  if (error) return { success: false, error: error.message }
  if (data?.error) return { success: false, error: String(data.error), ...(data as object) }
  return { success: true, ...(data as object) }
}

export async function verifyGithubUserExists(
  login: string
): Promise<{ exists: boolean; login?: string; error?: string }> {
  const normalized = login.trim().replace(/^@/, '')
  if (!normalized) return { exists: false, error: 'GitHub username required' }
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(normalized)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dumpers-repo-contributor-verify',
      },
    })
    if (res.status === 404) return { exists: false, error: 'GitHub user not found' }
    if (!res.ok) return { exists: false, error: `GitHub lookup failed (${res.status})` }
    const body = (await res.json()) as { login?: string }
    return { exists: true, login: body.login || normalized }
  } catch (e) {
    return { exists: false, error: e instanceof Error ? e.message : 'GitHub lookup failed' }
  }
}
