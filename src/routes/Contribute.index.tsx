import React, { useEffect, useMemo, useState } from 'react'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import SiteTooltip from '../components/SiteTooltip'
import { useAuth } from '../contexts/AuthContext'
import { setAnalyticsSubTool } from '../lib/analytics'
import {
  ENTRY_SEATS,
  INTEREST_AREA_OPTIONS,
  SEAT_DEFINITIONS,
  TOOLING_ITEMS,
  cancelMyUpgradeRequest,
  getContributorProgramConfig,
  isActiveSeat,
  leaveContributorTeam,
  listMyContributorApplication,
  requestContributorUpgrade,
  seatLabel,
  submitContributorApplication,
  syncContributorGithub,
  verifyGithubUserExists,
  type ContributorApplication,
  type ContributorProgramConfig,
  type ContributorUpgradeRequest,
  type EntrySeat,
} from '../lib/contributorTeam'

type TabId = 'apply' | 'status' | 'manage'

export default function ContributePage() {
  const { user, isApproved, isPending, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<TabId>('apply')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [config, setConfig] = useState<ContributorProgramConfig | null>(null)
  const [application, setApplication] = useState<ContributorApplication | null>(null)
  const [nextSeat, setNextSeat] = useState<string | null>(null)
  const [nextGuidelines, setNextGuidelines] = useState<string | null>(null)
  const [pendingUpgrade, setPendingUpgrade] = useState<ContributorUpgradeRequest | null>(null)

  const [githubLogin, setGithubLogin] = useState('')
  const [entrySeat, setEntrySeat] = useState<EntrySeat>('contributor')
  const [discordHandle, setDiscordHandle] = useState('')
  const [playActivity, setPlayActivity] = useState('')
  const [interestAreas, setInterestAreas] = useState<string[]>([])
  const [motivation, setMotivation] = useState('')
  const [oneFix, setOneFix] = useState('')
  const [skills, setSkills] = useState('')
  const [experienceLink, setExperienceLink] = useState('')
  const [pledgeFair, setPledgeFair] = useState(false)
  const [pledgeEase, setPledgeEase] = useState(false)
  const [pledgeNoSabotage, setPledgeNoSabotage] = useState(false)
  const [pledgeTools, setPledgeTools] = useState(false)
  const [pledgeNoHandholding, setPledgeNoHandholding] = useState(false)
  const [githubCheck, setGithubCheck] = useState<string | null>(null)

  const [upgradeJustification, setUpgradeJustification] = useState('')
  const [evidenceText, setEvidenceText] = useState('')
  const [leaveConfirm, setLeaveConfirm] = useState('')

  const active = isActiveSeat(application?.seat)
  const canReapply =
    !application || application.seat === 'denied' || application.seat === 'left' || application.seat === 'revoked'

  useEffect(() => {
    setAnalyticsSubTool(tab)
  }, [tab])

  useEffect(() => {
    if (authLoading) return
    if (!user || !isApproved) {
      setLoading(false)
      return
    }
    void refresh()
  }, [authLoading, user, isApproved])

  useEffect(() => {
    if (active) setTab('manage')
    else if (application?.seat === 'pending') setTab('status')
    else if (canReapply) setTab('apply')
  }, [application?.seat, active, canReapply])

  const refresh = async () => {
    setLoading(true)
    const [cfg, mine] = await Promise.all([
      getContributorProgramConfig(),
      listMyContributorApplication(),
    ])
    setConfig(cfg)
    if (mine.success) {
      setApplication(mine.application ?? null)
      setNextSeat(mine.nextSeat ?? null)
      setNextGuidelines(mine.nextSeatGuidelines ?? null)
      setPendingUpgrade(mine.pendingUpgrade ?? null)
      if (mine.config) setConfig(mine.config)
    }
    setLoading(false)
  }

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string; show: boolean }[] = [
      { id: 'apply', label: 'Apply', show: isApproved && canReapply },
      {
        id: 'status',
        label: 'Status',
        show: isApproved && (!!application && (application.seat === 'pending' || !canReapply || !!application.denyReason)),
      },
      { id: 'manage', label: 'Manage', show: isApproved && active },
    ]
    return list.filter((t) => t.show)
  }, [isApproved, canReapply, application, active])

  const toggleInterest = (id: string) => {
    setInterestAreas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleVerifyGithub = async () => {
    setGithubCheck(null)
    const result = await verifyGithubUserExists(githubLogin)
    if (!result.exists) {
      setGithubCheck(result.error || 'User not found')
      return
    }
    setGithubCheck(`Found @${result.login}`)
    if (result.login) setGithubLogin(result.login)
  }

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (!pledgeFair || !pledgeEase || !pledgeNoSabotage || !pledgeTools || !pledgeNoHandholding) {
      setMessage({ type: 'error', text: 'All pledge checkboxes are required.' })
      return
    }
    setSubmitting(true)
    const verify = await verifyGithubUserExists(githubLogin)
    if (!verify.exists) {
      setSubmitting(false)
      setMessage({ type: 'error', text: verify.error || 'GitHub username not found' })
      return
    }
    const result = await submitContributorApplication({
      githubLogin: verify.login || githubLogin,
      requestedEntrySeat: entrySeat,
      oneFixOrFeature: oneFix,
      pledgeFairPricing: pledgeFair,
      pledgeEaseOfUse: pledgeEase,
      pledgeNoSabotage: pledgeNoSabotage,
      pledgeToolsReadiness: pledgeTools,
      pledgeNoHandholding: pledgeNoHandholding,
      discordHandle,
      playActivity,
      interestAreas,
      motivation,
      skills,
      experienceLink,
    })
    setSubmitting(false)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Submit failed' })
      return
    }
    setMessage({ type: 'success', text: 'Application submitted. Staff will review it.' })
    await refresh()
    setTab('status')
  }

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    const links = evidenceText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const result = await requestContributorUpgrade({
      justification: upgradeJustification,
      evidenceLinks: links,
    })
    setSubmitting(false)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Upgrade request failed' })
      return
    }
    setMessage({ type: 'success', text: 'Upgrade request submitted.' })
    setUpgradeJustification('')
    setEvidenceText('')
    await refresh()
  }

  const handleCancelUpgrade = async () => {
    setSubmitting(true)
    setMessage(null)
    const result = await cancelMyUpgradeRequest()
    setSubmitting(false)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Cancel failed' })
      return
    }
    setMessage({ type: 'success', text: 'Upgrade request cancelled.' })
    await refresh()
  }

  const handleLeave = async () => {
    if (leaveConfirm.trim().toUpperCase() !== 'LEAVE') {
      setMessage({ type: 'error', text: 'Type LEAVE to confirm.' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    const result = await leaveContributorTeam()
    if (!result.success) {
      setSubmitting(false)
      setMessage({ type: 'error', text: result.error || 'Leave failed' })
      return
    }
    if (result.application?.id) {
      const sync = await syncContributorGithub(result.application.id)
      if (!sync.success) {
        setMessage({
          type: 'error',
          text: `Left the team, but GitHub sync failed: ${sync.error || 'unknown'}. Staff can retry.`,
        })
      } else {
        setMessage({ type: 'success', text: 'You left the contributor team. GitHub access was removed.' })
      }
    } else {
      setMessage({ type: 'success', text: 'You left the contributor team.' })
    }
    setLeaveConfirm('')
    setSubmitting(false)
    await refresh()
  }

  if (authLoading || loading) {
    return (
      <FeaturePageLayout title="Contribute" subtitle="Join the contributor team">
        <p className="text-slate-400 text-sm">Loading…</p>
      </FeaturePageLayout>
    )
  }

  if (!user) {
    return (
      <FeaturePageLayout title="Contribute" subtitle="Help build Dumper's Repo on GitHub">
        <ContributeExplainer config={config} />
        <div className="site-card p-5 space-y-3 max-w-xl mt-4">
          <p className="text-slate-200 text-sm font-medium">Sign in to apply</p>
          <p className="text-slate-400 text-sm">
            Approved members can request a GitHub collaborator seat from the avatar menu → Contribute.
          </p>
          <a href="/" className="site-btn-primary inline-flex site-btn-shimmer">
            Back to home to sign in
          </a>
        </div>
      </FeaturePageLayout>
    )
  }

  if (isPending || !isApproved) {
    return (
      <FeaturePageLayout title="Contribute" subtitle="Join the contributor team">
        <ContributeExplainer config={config} />
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-2 max-w-xl mt-4">
          <p className="text-amber-200 text-sm font-medium">Member approval required</p>
          <p className="text-slate-400 text-sm">
            Your account is still pending officer approval. Once you are an approved member, you can
            apply for the contributor team here.
          </p>
        </div>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="Contribute"
      subtitle="Apply for a GitHub collaborator seat · linear ladder · lead-reviewed"
      seoIntro="Approved members can apply to join the public GitHub contributor team for Dumper's Repo — triage issues, open pull requests, and grow toward reviewer/maintainer seats."
    >
      <ContributeExplainer config={config} />

      {config && !config.enabled && (
        <div className="site-banner-warning mt-4 mb-2">
          The contributor program is not accepting new applications right now.
        </div>
      )}

      {message && (
        <div
          className={`mt-4 mb-2 text-sm rounded-lg px-3 py-2 border ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
              : 'border-red-500/30 bg-red-950/20 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {tabs.length > 1 && (
        <div className="site-chip-strip mt-4 mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={tab === t.id ? 'site-filter-selected-amber' : 'site-filter-idle'}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'apply' && canReapply && (
        <form onSubmit={handleApply} className="site-section mt-2 max-w-2xl">
          <div className="site-section-header">Application</div>
          <div className="site-section-body space-y-4">
            {application?.seat === 'denied' && application.denyReason && (
              <div className="site-banner-warning text-sm">
                Previous application denied: {application.denyReason}
              </div>
            )}

            <label className="block space-y-1">
              <span className="site-label !mb-0 flex items-center gap-1">
                GitHub username
                <SiteTooltip content="Must match an existing public GitHub account. Collaborator invites go to this login.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
              </span>
              <div className="flex gap-2 flex-wrap">
                <input
                  className="site-input flex-1 min-w-[12rem] px-3 py-2"
                  value={githubLogin}
                  onChange={(e) => setGithubLogin(e.target.value)}
                  placeholder="your-github-login"
                  required
                />
                <button type="button" className="site-btn-secondary" onClick={() => void handleVerifyGithub()}>
                  Check user
                </button>
              </div>
              {githubCheck && <p className="site-hint">{githubCheck}</p>}
            </label>

            <fieldset className="space-y-2">
              <legend className="site-label flex items-center gap-1">
                Entry seat
                <SiteTooltip content="Triage = discuss/triage only. Contributor = push to open PRs. You can request upgrades later.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
              </legend>
              <div className="space-y-2">
                {SEAT_DEFINITIONS.map((seat) => (
                  <label
                    key={seat.id}
                    className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${
                      entrySeat === seat.id
                        ? 'border-orange-500/40 bg-orange-950/20'
                        : 'border-slate-700/60 bg-slate-950/40'
                    }`}
                  >
                    <input
                      type="radio"
                      className="site-radio mt-1"
                      name="entrySeat"
                      checked={entrySeat === seat.id}
                      onChange={() => setEntrySeat(seat.id)}
                      disabled={!ENTRY_SEATS.includes(seat.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-100 font-medium">
                        {seat.label}{' '}
                        <span className="text-slate-500 font-normal">
                          (GitHub: {seat.githubPermission})
                        </span>
                      </span>
                      <span className="block text-xs text-slate-400 mt-1">{seat.summary}</span>
                      {seat.warning && entrySeat === seat.id && (
                        <span className="block text-xs text-amber-300/90 mt-1">{seat.warning}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1">
              <span className="site-label !mb-0">Discord handle (optional)</span>
              <input
                className="site-input w-full px-3 py-2"
                value={discordHandle}
                onChange={(e) => setDiscordHandle(e.target.value)}
              />
            </label>

            <label className="block space-y-1">
              <span className="site-label !mb-0">How often do you play / hang in the community?</span>
              <input
                className="site-input w-full px-3 py-2"
                value={playActivity}
                onChange={(e) => setPlayActivity(e.target.value)}
              />
            </label>

            <div className="space-y-2">
              <span className="site-label flex items-center gap-1">
                Interest areas
                <SiteTooltip content="Helps reviewers route you — not a hard filter.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
              </span>
              <div className="flex flex-wrap gap-2">
                {INTEREST_AREA_OPTIONS.map((opt) => {
                  const on = interestAreas.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleInterest(opt.id)}
                      className={on ? 'site-filter-selected-sky' : 'site-filter-idle'}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="block space-y-1">
              <span className="site-label !mb-0">Why do you want to contribute?</span>
              <textarea
                className="site-textarea w-full px-3 py-2"
                rows={3}
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
              />
            </label>

            <label className="block space-y-1">
              <span className="site-label !mb-0 flex items-center gap-1">
                One fix or feature you would work on first
                <SiteTooltip content="20–500 characters. Be concrete — a bug, UX snag, or small feature.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
              </span>
              <textarea
                className="site-textarea w-full px-3 py-2"
                rows={4}
                value={oneFix}
                onChange={(e) => setOneFix(e.target.value)}
                required
                minLength={20}
                maxLength={500}
              />
              <span className="site-hint">{oneFix.trim().length}/500</span>
            </label>

            <label className="block space-y-1">
              <span className="site-label !mb-0">Skills (optional)</span>
              <textarea
                className="site-textarea w-full px-3 py-2"
                rows={2}
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
              />
            </label>

            <label className="block space-y-1">
              <span className="site-label !mb-0">Portfolio / PR link (optional)</span>
              <input
                className="site-input w-full px-3 py-2"
                value={experienceLink}
                onChange={(e) => setExperienceLink(e.target.value)}
                placeholder="https://github.com/…"
              />
            </label>

            <div className="site-card p-4 space-y-2">
              <p className="text-sm text-slate-200 font-medium">Tooling readiness</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
                {TOOLING_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="site-label">Pledges (all required)</p>
              <Pledge
                checked={pledgeFair}
                onChange={setPledgeFair}
                label="I support fair-value pricing and will not push predatory marketplace behavior."
              />
              <Pledge
                checked={pledgeEase}
                onChange={setPledgeEase}
                label="I will prioritize member ease-of-use over clever-but-confusing UX."
              />
              <Pledge
                checked={pledgeNoSabotage}
                onChange={setPledgeNoSabotage}
                label="I will not sabotage the project, leak secrets, or abuse collaborator access."
              />
              <Pledge
                checked={pledgeTools}
                onChange={setPledgeTools}
                label="I can set up (or already have) the tooling listed above for the work I plan to do."
              />
              <Pledge
                checked={pledgeNoHandholding}
                onChange={setPledgeNoHandholding}
                label="I understand this is not a mentorship program — PRs should be review-ready."
              />
            </div>

            <button
              type="submit"
              className="site-btn-primary site-btn-shimmer"
              disabled={submitting || config?.enabled === false}
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </form>
      )}

      {tab === 'status' && application && (
        <div className="site-section mt-2 max-w-2xl">
          <div className="site-section-header">Application status</div>
          <div className="site-section-body space-y-3 text-sm">
            <StatusRow label="Seat" value={seatLabel(application.seat)} />
            <StatusRow label="GitHub" value={`@${application.githubLogin}`} />
            <StatusRow label="Requested entry" value={seatLabel(application.requestedEntrySeat)} />
            <StatusRow label="Submitted" value={new Date(application.createdAt).toLocaleString()} />
            {application.denyReason && (
              <StatusRow label="Deny reason" value={application.denyReason} />
            )}
            {application.seat === 'pending' && (
              <p className="text-slate-400">
                Staff review applications manually. You will see Manage once a seat is granted.
              </p>
            )}
            {canReapply && application.seat !== 'pending' && (
              <button type="button" className="site-btn-secondary" onClick={() => setTab('apply')}>
                Apply again
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'manage' && active && application && (
        <div className="space-y-4 mt-2 max-w-2xl">
          <div className="site-section">
            <div className="site-section-header">Your seat</div>
            <div className="site-section-body space-y-2 text-sm">
              <StatusRow label="Current seat" value={seatLabel(application.seat)} />
              <StatusRow
                label="GitHub permission"
                value={application.githubPermission || '—'}
              />
              <StatusRow
                label="GitHub sync"
                value={
                  application.githubSyncStatus +
                  (application.githubSyncError ? ` — ${application.githubSyncError}` : '')
                }
              />
              {config?.repoUrl && (
                <a
                  href={config.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:text-sky-300 text-sm"
                >
                  Open repository
                </a>
              )}
            </div>
          </div>

          {nextSeat && (
            <div className="site-section">
              <div className="site-section-header flex items-center gap-1">
                Next upgrade: {seatLabel(application.seat)} → {seatLabel(nextSeat)}
                <SiteTooltip content="Upgrades are linear and lead-reviewed. Meet the guidelines before requesting.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
              </div>
              <div className="site-section-body space-y-3">
                <p className="text-sm text-slate-400">{nextGuidelines}</p>
                {pendingUpgrade ? (
                  <div className="space-y-2">
                    <p className="text-sm text-amber-200">
                      Pending upgrade request ({seatLabel(pendingUpgrade.fromSeat)} →{' '}
                      {seatLabel(pendingUpgrade.toSeat)})
                    </p>
                    <button
                      type="button"
                      className="site-btn-secondary"
                      disabled={submitting}
                      onClick={() => void handleCancelUpgrade()}
                    >
                      Cancel request
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleUpgrade} className="space-y-3">
                    <label className="block space-y-1">
                      <span className="site-label !mb-0">Justification</span>
                      <textarea
                        className="site-textarea w-full px-3 py-2"
                        rows={3}
                        value={upgradeJustification}
                        onChange={(e) => setUpgradeJustification(e.target.value)}
                        required
                        minLength={10}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="site-label !mb-0 flex items-center gap-1">
                        Evidence links (one per line)
                        <SiteTooltip content="PR URLs, issue comments, or other proof that you meet the guidelines.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
                      </span>
                      <textarea
                        className="site-textarea w-full px-3 py-2"
                        rows={3}
                        value={evidenceText}
                        onChange={(e) => setEvidenceText(e.target.value)}
                      />
                    </label>
                    <button type="submit" className="site-btn-primary" disabled={submitting}>
                      Request upgrade
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          <div className="site-section">
            <div className="site-section-header text-red-300">Leave the team</div>
            <div className="site-section-body space-y-3">
              <p className="text-sm text-slate-400">
                Removes your collaborator access on GitHub. You can re-apply later if the program is
                open.
              </p>
              <label className="block space-y-1">
                <span className="site-label !mb-0">Type LEAVE to confirm</span>
                <input
                  className="site-input w-full px-3 py-2"
                  value={leaveConfirm}
                  onChange={(e) => setLeaveConfirm(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="site-btn-danger"
                disabled={submitting}
                onClick={() => void handleLeave()}
              >
                Leave contributor team
              </button>
            </div>
          </div>
        </div>
      )}
    </FeaturePageLayout>
  )
}

function Pledge({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex gap-2 items-start text-sm text-slate-300 cursor-pointer">
      <input
        type="checkbox"
        className="site-checkbox mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <span className="text-slate-500 sm:w-40 shrink-0">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  )
}

function ContributeExplainer({ config }: { config: ContributorProgramConfig | null }) {
  return (
    <div className="site-card p-4 space-y-2 max-w-3xl">
      <p className="text-sm text-slate-300 leading-relaxed">
        The contributor team is the public GitHub collaborator ladder for this repository — not site
        officer roles and not signing/admin access. Seats advance linearly: Triage → Contributor →
        Reviewer → Maintainer.
      </p>
      <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
        <li>Applications and upgrades are reviewed by the lead maintainer.</li>
        <li>GitHub invites/removals sync automatically after approve, upgrade, leave, or revoke.</li>
        <li>
          Repo:{' '}
          {config?.repoUrl ? (
            <a href={config.repoUrl} className="text-sky-400 hover:text-sky-300" target="_blank" rel="noreferrer">
              {config.githubOwner}/{config.githubRepo}
            </a>
          ) : (
            'configured in site settings'
          )}
        </li>
      </ul>
    </div>
  )
}
