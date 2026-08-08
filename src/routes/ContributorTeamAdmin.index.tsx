import { useCallback, useEffect, useState } from 'react'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import SiteTooltip from '../components/SiteTooltip'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useAuth } from '../contexts/AuthContext'
import {
  adminBuildContributorEvaluationBrief,
  adminGrantNextSeat,
  adminListActiveContributors,
  adminListContributorApplications,
  adminListUpgradeRequests,
  adminReviewContributorApplication,
  adminReviewUpgradeRequest,
  adminRevokeContributor,
  adminUpdateContributorProgramConfig,
  getContributorProgramConfig,
  seatLabel,
  syncContributorGithub,
  type ContributorApplication,
  type ContributorProfileSnippet,
  type ContributorProgramConfig,
  type ContributorUpgradeRequest,
  type EntrySeat,
} from '../lib/contributorTeam'

type TabId = 'applications' | 'upgrades' | 'active' | 'config'

type AppRow = { application: ContributorApplication; profile: ContributorProfileSnippet }
type UpgradeRow = {
  upgradeRequest: ContributorUpgradeRequest
  application: ContributorApplication
  profile: ContributorProfileSnippet
}

export default function ContributorTeamAdminPage() {
  const { isSuperAdmin } = useAuth()
  const [tab, setTab] = useState<TabId>('applications')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [apps, setApps] = useState<AppRow[]>([])
  const [upgrades, setUpgrades] = useState<UpgradeRow[]>([])
  const [active, setActive] = useState<AppRow[]>([])
  const [config, setConfig] = useState<ContributorProgramConfig | null>(null)

  const [cfgEnabled, setCfgEnabled] = useState(true)
  const [cfgOwner, setCfgOwner] = useState('')
  const [cfgRepo, setCfgRepo] = useState('')
  const [cfgCodeowners, setCfgCodeowners] = useState('')

  const [confirm, setConfirm] = useState<null | {
    kind: 'revoke' | 'maintainer'
    title: string
    body: string
    expect: string
    onConfirm: () => Promise<void>
  }>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [a, u, t, c] = await Promise.all([
        adminListContributorApplications('pending'),
        adminListUpgradeRequests('pending'),
        adminListActiveContributors(),
        getContributorProgramConfig(),
      ])
      setApps(a)
      setUpgrades(u)
      setActive(t)
      setConfig(c)
      setCfgEnabled(c.enabled !== false)
      setCfgOwner(c.githubOwner || '')
      setCfgRepo(c.githubRepo || '')
      setCfgCodeowners(c.githubCodeownersHandle || '')
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) return
    void refresh()
  }, [isSuperAdmin, refresh])

  const afterGithubTouch = async (applicationId: string | undefined, okMsg: string) => {
    if (!applicationId) {
      setMessage({ type: 'success', text: okMsg })
      await refresh()
      return
    }
    const sync = await syncContributorGithub(applicationId)
    if (!sync.success) {
      setMessage({
        type: 'error',
        text: `${okMsg} GitHub sync failed: ${sync.error || 'unknown'}. Use Retry sync.`,
      })
    } else {
      setMessage({ type: 'success', text: `${okMsg} GitHub sync OK.` })
    }
    await refresh()
  }

  const copyBrief = async (userId: string) => {
    setBusy(true)
    setMessage(null)
    const result = await adminBuildContributorEvaluationBrief(userId)
    setBusy(false)
    if (!result.success || !result.markdown) {
      setMessage({ type: 'error', text: result.error || 'Brief failed' })
      return
    }
    try {
      await navigator.clipboard.writeText(result.markdown)
      setMessage({ type: 'success', text: 'Evaluation brief copied to clipboard.' })
    } catch {
      setMessage({ type: 'error', text: 'Clipboard write failed — brief was generated but not copied.' })
    }
  }

  const saveConfig = async () => {
    setBusy(true)
    setMessage(null)
    const result = await adminUpdateContributorProgramConfig({
      enabled: cfgEnabled,
      githubOwner: cfgOwner.trim() || null,
      githubRepo: cfgRepo.trim() || null,
      githubCodeownersHandle: cfgCodeowners.trim() || null,
    })
    setBusy(false)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Save failed' })
      return
    }
    setMessage({ type: 'success', text: 'Config saved.' })
    if (result.config) setConfig(result.config)
    await refresh()
  }

  if (!isSuperAdmin) {
    return (
      <FeaturePageLayout title="Contributor Team" subtitle="Super-admin only">
        <p className="text-slate-400 text-sm">Not authorized.</p>
      </FeaturePageLayout>
    )
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'applications', label: `Applications (${apps.length})` },
    { id: 'upgrades', label: `Upgrades (${upgrades.length})` },
    { id: 'active', label: `Active team (${active.length})` },
    { id: 'config', label: 'Config' },
  ]

  return (
    <FeaturePageLayout
      title="Contributor Team"
      subtitle="Review applications · upgrades · GitHub collaborator sync"
    >
      {message && (
        <div
          className={`mb-4 text-sm rounded-lg px-3 py-2 border ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
              : 'border-red-500/30 bg-red-950/20 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="site-chip-strip mb-4">
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

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : tab === 'applications' ? (
        <div className="space-y-4">
          {apps.length === 0 && <p className="site-empty">No pending applications.</p>}
          {apps.map((row) => (
            <ApplicationCard
              key={row.application.id}
              row={row}
              busy={busy}
              onCopyBrief={() => void copyBrief(row.application.userId)}
              onReview={async (approve, notes, grantSeat) => {
                setBusy(true)
                setMessage(null)
                const result = await adminReviewContributorApplication({
                  id: row.application.id,
                  approve,
                  reviewNotes: notes,
                  grantSeat,
                })
                setBusy(false)
                if (!result.success) {
                  setMessage({ type: 'error', text: result.error || 'Review failed' })
                  return
                }
                if (approve) {
                  await afterGithubTouch(result.application?.id || row.application.id, 'Approved.')
                } else {
                  setMessage({ type: 'success', text: 'Application denied.' })
                  await refresh()
                }
              }}
            />
          ))}
        </div>
      ) : tab === 'upgrades' ? (
        <div className="space-y-4">
          {upgrades.length === 0 && <p className="site-empty">No pending upgrades.</p>}
          {upgrades.map((row) => (
            <UpgradeCard
              key={row.upgradeRequest.id}
              row={row}
              busy={busy}
              onCopyBrief={() => void copyBrief(row.application.userId)}
              onAskMaintainerConfirm={(run) =>
                setConfirm({
                  kind: 'maintainer',
                  title: 'Grant Maintainer seat',
                  body: 'Type MAINTAINER to confirm promoting this member to the top of the ladder.',
                  expect: 'MAINTAINER',
                  onConfirm: run,
                })
              }
              onReview={async (approve, notes) => {
                const run = async () => {
                  setBusy(true)
                  setMessage(null)
                  const result = await adminReviewUpgradeRequest({
                    id: row.upgradeRequest.id,
                    approve,
                    reviewNotes: notes,
                  })
                  setBusy(false)
                  if (!result.success) {
                    setMessage({ type: 'error', text: result.error || 'Review failed' })
                    return
                  }
                  if (approve) {
                    await afterGithubTouch(
                      result.application?.id || row.application.id,
                      'Upgrade approved.'
                    )
                  } else {
                    setMessage({ type: 'success', text: 'Upgrade denied.' })
                    await refresh()
                  }
                }
                if (approve && row.upgradeRequest.toSeat === 'maintainer') {
                  setConfirm({
                    kind: 'maintainer',
                    title: 'Approve Maintainer upgrade',
                    body: 'Type MAINTAINER to confirm.',
                    expect: 'MAINTAINER',
                    onConfirm: run,
                  })
                  return
                }
                await run()
              }}
            />
          ))}
        </div>
      ) : tab === 'active' ? (
        <div className="space-y-4">
          {active.length === 0 && <p className="site-empty">No active contributors.</p>}
          {active.map((row) => (
            <ActiveCard
              key={row.application.id}
              row={row}
              busy={busy}
              onCopyBrief={() => void copyBrief(row.application.userId)}
              onRetrySync={async () => {
                setBusy(true)
                await afterGithubTouch(row.application.id, 'Retry sync.')
                setBusy(false)
              }}
              onGrantNext={async (notes) => {
                const run = async () => {
                  setBusy(true)
                  setMessage(null)
                  const result = await adminGrantNextSeat({
                    applicationId: row.application.id,
                    notes,
                  })
                  setBusy(false)
                  if (!result.success) {
                    setMessage({ type: 'error', text: result.error || 'Grant failed' })
                    return
                  }
                  await afterGithubTouch(result.application?.id || row.application.id, 'Seat advanced.')
                }
                if (row.application.seat === 'reviewer') {
                  setConfirm({
                    kind: 'maintainer',
                    title: 'Advance to Maintainer',
                    body: 'Type MAINTAINER to confirm granting the top seat without an upgrade request.',
                    expect: 'MAINTAINER',
                    onConfirm: run,
                  })
                  return
                }
                await run()
              }}
              onRevoke={(notes) => {
                setConfirm({
                  kind: 'revoke',
                  title: 'Revoke contributor',
                  body: 'Type REVOKE to remove this member from the team and GitHub collaborators.',
                  expect: 'REVOKE',
                  onConfirm: async () => {
                    setBusy(true)
                    setMessage(null)
                    const result = await adminRevokeContributor({
                      applicationId: row.application.id,
                      notes,
                    })
                    setBusy(false)
                    if (!result.success) {
                      setMessage({ type: 'error', text: result.error || 'Revoke failed' })
                      return
                    }
                    await afterGithubTouch(
                      result.application?.id || row.application.id,
                      'Revoked.'
                    )
                  },
                })
              }}
            />
          ))}
        </div>
      ) : (
        <div className="site-section max-w-xl">
          <div className="site-section-header flex items-center gap-1">
            Program config
            <SiteTooltip content="Owner/repo drive GitHub API collaborator URLs. CODEOWNERS handle is shown for docs alignment — edit .github/CODEOWNERS in git separately.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
          </div>
          <div className="site-section-body space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <button
                type="button"
                className="site-toggle"
                data-on={cfgEnabled ? 'true' : 'false'}
                onClick={() => setCfgEnabled((v) => !v)}
                aria-pressed={cfgEnabled}
              />
              Program enabled (accept applications / upgrades)
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">GitHub owner</span>
              <input
                className="site-input w-full px-3 py-2"
                value={cfgOwner}
                onChange={(e) => setCfgOwner(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">GitHub repo</span>
              <input
                className="site-input w-full px-3 py-2"
                value={cfgRepo}
                onChange={(e) => setCfgRepo(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0 flex items-center gap-1">
                CODEOWNERS lead handle
                <SiteTooltip content="Without leading @. Used for admin display; keep in sync with .github/CODEOWNERS.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
              </span>
              <input
                className="site-input w-full px-3 py-2"
                value={cfgCodeowners}
                onChange={(e) => setCfgCodeowners(e.target.value)}
              />
            </label>
            {config?.repoUrl && (
              <p className="site-hint">
                Repo URL:{' '}
                <a href={config.repoUrl} className="text-sky-400" target="_blank" rel="noreferrer">
                  {config.repoUrl}
                </a>
              </p>
            )}
            <button type="button" className="site-btn-primary" disabled={busy} onClick={() => void saveConfig()}>
              Save config
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          body={confirm.body}
          expect={confirm.expect}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const fn = confirm.onConfirm
            setConfirm(null)
            await fn()
          }}
        />
      )}
    </FeaturePageLayout>
  )
}

function ApplicationCard({
  row,
  busy,
  onReview,
  onCopyBrief,
}: {
  row: AppRow
  busy: boolean
  onReview: (approve: boolean, notes: string, grantSeat: EntrySeat) => Promise<void>
  onCopyBrief: () => void
}) {
  const app = row.application
  const [notes, setNotes] = useState('')
  const [grantSeat, setGrantSeat] = useState<EntrySeat>(app.requestedEntrySeat)

  return (
    <div className="site-card p-4 space-y-3">
      <Header profile={row.profile} github={app.githubLogin} seat={`requested ${app.requestedEntrySeat}`} />
      <p className="text-sm text-slate-300 whitespace-pre-wrap">{app.oneFixOrFeature}</p>
      {app.motivation && <p className="text-xs text-slate-500 whitespace-pre-wrap">{app.motivation}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="site-btn-secondary text-xs" disabled={busy} onClick={onCopyBrief}>
          Copy evaluation brief
        </button>
      </div>
      <label className="block space-y-1">
        <span className="site-label !mb-0 flex items-center gap-1">
          Grant seat
          <SiteTooltip content="Usually match their request. You may grant Triage even if they asked Contributor.">
                  <span className="ml-1 text-slate-500 cursor-help text-xs border-b border-dotted border-slate-600">?</span>
                </SiteTooltip>
        </span>
        <select
          className="site-input px-3 py-2"
          value={grantSeat}
          onChange={(e) => setGrantSeat(e.target.value as EntrySeat)}
        >
          <option value="triage">Triage</option>
          <option value="contributor">Contributor</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="site-label !mb-0">Notes / deny reason</span>
        <textarea
          className="site-textarea w-full px-3 py-2"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="site-btn-success"
          disabled={busy}
          onClick={() => void onReview(true, notes, grantSeat)}
        >
          Approve + sync GitHub
        </button>
        <button
          type="button"
          className="site-btn-danger"
          disabled={busy}
          onClick={() => void onReview(false, notes, grantSeat)}
        >
          Deny
        </button>
      </div>
    </div>
  )
}

function UpgradeCard({
  row,
  busy,
  onReview,
  onCopyBrief,
  onAskMaintainerConfirm,
}: {
  row: UpgradeRow
  busy: boolean
  onReview: (approve: boolean, notes: string) => Promise<void>
  onCopyBrief: () => void
  onAskMaintainerConfirm: (run: () => Promise<void>) => void
}) {
  const u = row.upgradeRequest
  const [notes, setNotes] = useState('')
  void onAskMaintainerConfirm

  return (
    <div className="site-card p-4 space-y-3">
      <Header
        profile={row.profile}
        github={row.application.githubLogin}
        seat={`${u.fromSeat} → ${u.toSeat}`}
      />
      <p className="text-sm text-slate-300 whitespace-pre-wrap">{u.justification}</p>
      <Evidence links={u.evidenceLinks} />
      <button type="button" className="site-btn-secondary text-xs" disabled={busy} onClick={onCopyBrief}>
        Copy evaluation brief
      </button>
      <label className="block space-y-1">
        <span className="site-label !mb-0">Review notes</span>
        <textarea
          className="site-textarea w-full px-3 py-2"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="site-btn-success"
          disabled={busy}
          onClick={() => void onReview(true, notes)}
        >
          Approve + sync
        </button>
        <button
          type="button"
          className="site-btn-danger"
          disabled={busy}
          onClick={() => void onReview(false, notes)}
        >
          Deny
        </button>
      </div>
    </div>
  )
}

function ActiveCard({
  row,
  busy,
  onCopyBrief,
  onRetrySync,
  onGrantNext,
  onRevoke,
}: {
  row: AppRow
  busy: boolean
  onCopyBrief: () => void
  onRetrySync: () => Promise<void>
  onGrantNext: (notes: string) => Promise<void>
  onRevoke: (notes: string) => void
}) {
  const app = row.application
  const [notes, setNotes] = useState('')

  return (
    <div className="site-card p-4 space-y-3">
      <Header profile={row.profile} github={app.githubLogin} seat={seatLabel(app.seat)} />
      <div className="text-xs text-slate-500 space-y-1">
        <p>
          Sync: {app.githubSyncStatus}
          {app.githubPendingAction ? ` · pending ${app.githubPendingAction}` : ''}
        </p>
        {app.githubSyncError && <p className="text-red-300">{app.githubSyncError}</p>}
      </div>
      <label className="block space-y-1">
        <span className="site-label !mb-0">Admin notes</span>
        <textarea
          className="site-textarea w-full px-3 py-2"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="site-btn-secondary text-xs" disabled={busy} onClick={onCopyBrief}>
          Copy brief
        </button>
        <button
          type="button"
          className="site-btn-secondary text-xs"
          disabled={busy}
          onClick={() => void onRetrySync()}
        >
          Retry GitHub sync
        </button>
        {app.seat !== 'maintainer' && (
          <button
            type="button"
            className="site-btn-accent text-xs"
            disabled={busy}
            onClick={() => void onGrantNext(notes)}
          >
            Grant next seat
          </button>
        )}
        <button
          type="button"
          className="site-btn-danger text-xs"
          disabled={busy}
          onClick={() => onRevoke(notes)}
        >
          Revoke…
        </button>
      </div>
    </div>
  )
}

function Header({
  profile,
  github,
  seat,
}: {
  profile: ContributorProfileSnippet
  github: string
  seat: string
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-slate-100 text-sm font-medium">
          {profile.displayName || 'Member'}{' '}
          <span className="text-slate-500 font-normal">
            {profile.rsiHandle ? `(${profile.rsiHandle})` : ''}
          </span>
        </p>
        <p className="text-xs text-slate-500">
          @{github} · {seat}
          {profile.rsiHandleVerified ? ' · RSI verified' : ''}
        </p>
      </div>
    </div>
  )
}

function Evidence({ links }: { links: unknown }) {
  const arr = Array.isArray(links) ? links.map(String).filter(Boolean) : []
  if (arr.length === 0) return null
  return (
    <ul className="text-xs text-sky-400 space-y-1 list-disc pl-4">
      {arr.map((href) => (
        <li key={href}>
          <a href={href} target="_blank" rel="noreferrer" className="break-all hover:text-sky-300">
            {href}
          </a>
        </li>
      ))}
    </ul>
  )
}

function ConfirmModal({
  title,
  body,
  expect,
  onClose,
  onConfirm,
}: {
  title: string
  body: string
  expect: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  useBodyScrollLock(true)
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const ok = typed.trim().toUpperCase() === expect.toUpperCase()

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="site-modal-backdrop absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="site-modal-shell relative w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg text-slate-100 font-semibold">{title}</h2>
        <p className="text-sm text-slate-400">{body}</p>
        <input
          className="site-input w-full px-3 py-2"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={expect}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button type="button" className="site-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="site-btn-danger"
            disabled={!ok || working}
            onClick={() => {
              setWorking(true)
              void onConfirm().finally(() => setWorking(false))
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
