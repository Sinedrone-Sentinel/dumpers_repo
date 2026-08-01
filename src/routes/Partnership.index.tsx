import React, { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { useAuth } from '../contexts/AuthContext'
import { setAnalyticsSubTool } from '../lib/analytics'
import {
  fetchDumperServicesBotInviteUrl,
  listMyPartnerApplications,
  listMyPartnerOrgs,
  listPendingPartnerApplications,
  listServiceTypes,
  reviewPartnerApplication,
  submitPartnerApplication,
  upsertPartnerOrgService,
  type PartnerApplication,
  type PartnerOrg,
  type ServiceType,
} from '../lib/partnership'

type TabId = 'apply' | 'applications' | 'manage' | 'officer'

export default function PartnershipPage() {
  const { profile, isOfficerOrAbove, isApproved } = useAuth()
  const isRsiVerified = Boolean(profile?.rsi_handle_verified)
  const [tab, setTab] = useState<TabId>('apply')
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [myApps, setMyApps] = useState<PartnerApplication[]>([])
  const [myOrgs, setMyOrgs] = useState<PartnerOrg[]>([])
  const [pending, setPending] = useState<PartnerApplication[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [orgSid, setOrgSid] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgUrl, setOrgUrl] = useState('')
  const [roleClaim, setRoleClaim] = useState('')
  const [notes, setNotes] = useState('')
  const [pledgeAccepted, setPledgeAccepted] = useState(false)

  const hasApps = myApps.length > 0
  const hasManageableOrg = myOrgs.some((o) => o.active)

  useEffect(() => {
    setAnalyticsSubTool(tab === 'officer' ? 'officer_pending' : tab)
  }, [tab])

  useEffect(() => {
    if (!isRsiVerified) {
      setLoading(false)
      return
    }
    void refreshAll()
  }, [isRsiVerified, isOfficerOrAbove])

  const refreshAll = async () => {
    setLoading(true)
    const [types, apps, orgs] = await Promise.all([
      listServiceTypes(),
      listMyPartnerApplications(),
      listMyPartnerOrgs(),
    ])
    setServiceTypes(types)
    setMyApps(apps)
    setMyOrgs(orgs)
    if (isOfficerOrAbove) {
      const pend = await listPendingPartnerApplications()
      if (pend.success) setPending(pend.applications)
    }
    setLoading(false)
  }

  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: 'apply', label: 'Apply', show: isRsiVerified && !hasManageableOrg },
    { id: 'applications', label: 'Applications', show: isRsiVerified && hasApps },
    { id: 'manage', label: 'Manage services', show: isRsiVerified && hasManageableOrg },
    { id: 'officer', label: 'Pending review', show: isOfficerOrAbove },
  ]

  const visibleTabs = tabs.filter((t) => t.show)

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pledgeAccepted) {
      setMessage({
        type: 'error',
        text: 'Confirm the transparency pledge before submitting.',
      })
      return
    }
    setSubmitting(true)
    setMessage(null)
    const result = await submitPartnerApplication({
      orgSid,
      orgName,
      orgUrl,
      roleClaim,
      notes,
    })
    setSubmitting(false)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Submit failed' })
      return
    }
    setMessage({
      type: 'success',
      text: 'Application submitted. Staff will review it via Support.',
    })
    setOrgSid('')
    setOrgName('')
    setOrgUrl('')
    setRoleClaim('')
    setNotes('')
    setPledgeAccepted(false)
    await refreshAll()
    setTab('applications')
  }

  if (!isApproved) {
    return (
      <FeaturePageLayout title="Partnership" subtitle="Org services partnership">
        <p className="text-slate-400 text-sm">Your account must be approved to apply.</p>
      </FeaturePageLayout>
    )
  }

  if (!isRsiVerified) {
    return (
      <FeaturePageLayout
        title="Partnership"
        subtitle="Org services for members · transparent pricing · staff-reviewed"
      >
        <PartnershipExplainer />
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-3 max-w-xl">
          <p className="text-amber-200 text-sm font-medium">Verified RSI Handle required</p>
          <p className="text-slate-400 text-sm leading-relaxed">
            Partnership is only available after you verify your RSI Handle (bio code in Settings).
          </p>
          <p className="text-slate-500 text-xs">
            Open <strong className="text-slate-400">Settings</strong> from your avatar menu → get a
            code → paste into your public RSI Bio → Verify.
          </p>
        </div>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="Partnership"
      subtitle="Org services for members · transparent pricing · staff-reviewed"
    >
      {message && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'border-green-500/30 bg-green-950/30 text-green-300'
              : 'border-red-500/30 bg-red-950/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <PartnershipExplainer />

      {visibleTabs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {t.label}
              {t.id === 'officer' && pending.length > 0 ? ` (${pending.length})` : ''}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <>
          {tab === 'apply' && (
            <div className="max-w-xl space-y-4">
              <form onSubmit={handleApply} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                <h3 className="text-white font-medium text-sm">Apply Now</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Applications are checked against your RSI org page / Spectrum presence before
                  approval. Only apply if you can speak for the org on services and pricing.
                </p>
                <Field label="Org SID" required>
                  <input
                    value={orgSid}
                    onChange={(e) => setOrgSid(e.target.value)}
                    placeholder="e.g. dumpers"
                    required
                    className="site-input w-full px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Organization name" required>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    className="site-input w-full px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="RSI org page URL">
                  <input
                    value={orgUrl}
                    onChange={(e) => setOrgUrl(e.target.value)}
                    placeholder="https://robertsspaceindustries.com/orgs/..."
                    className="site-input w-full px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Your role in the org">
                  <input
                    value={roleClaim}
                    onChange={(e) => setRoleClaim(e.target.value)}
                    placeholder="e.g. Founder, Director, Fleet Commander"
                    className="site-input w-full px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Additional notes (optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Links or context that help verify you speak for the org"
                    className="site-input w-full px-3 py-2 text-sm"
                  />
                </Field>
                <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pledgeAccepted}
                    onChange={(e) => setPledgeAccepted(e.target.checked)}
                    required
                    className="mt-0.5"
                  />
                  <span className="text-xs text-amber-100/90 leading-relaxed">
                    I confirm that any services we list, and the pricing shown for each, will be{' '}
                    <strong className="text-amber-50">transparent, honest, and upheld</strong> when
                    members request help. Bait pricing or refusing the listed terms can get the
                    partnership revoked.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={submitting || !pledgeAccepted}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit application'}
                </button>
              </form>
            </div>
          )}

          {tab === 'applications' && (
            <div className="space-y-3 max-w-2xl">
              {myApps.length === 0 ? (
                <p className="text-slate-500 text-sm">No applications yet.</p>
              ) : (
                myApps.map((app) => (
                  <div
                    key={app.id}
                    className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-white font-medium text-sm">
                          {app.org_name}{' '}
                          <span className="text-slate-500 font-normal">({app.org_sid})</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Submitted {new Date(app.created_at).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                    {app.review_notes && (
                      <p className="text-xs text-slate-400 mt-2">Review: {app.review_notes}</p>
                    )}
                    {app.status === 'approved' && (
                      <div className="mt-3">
                        <BotInvitePanel />
                      </div>
                    )}
                  </div>
                ))
              )}
              {!hasManageableOrg && (
                <button
                  type="button"
                  onClick={() => setTab('apply')}
                  className="text-sm text-orange-400 hover:text-orange-300"
                >
                  + Apply for another org
                </button>
              )}
            </div>
          )}

          {tab === 'manage' && (
            <ManageServices
              orgs={myOrgs}
              serviceTypes={serviceTypes}
              onSaved={async () => {
                setMessage({ type: 'success', text: 'Service saved.' })
                await refreshAll()
              }}
              onError={(text) => setMessage({ type: 'error', text })}
            />
          )}

          {tab === 'officer' && isOfficerOrAbove && (
            <div className="space-y-3 max-w-2xl">
              <p className="text-slate-400 text-sm">
                Pending applications also appear as Support tickets (Partnership Application) and
                ping the staff Discord support webhook.
              </p>
              {pending.length === 0 ? (
                <p className="text-slate-500 text-sm">No pending applications.</p>
              ) : (
                pending.map((app) => (
                  <OfficerAppCard
                    key={app.id}
                    app={app}
                    onDone={async () => {
                      await refreshAll()
                      setMessage({ type: 'success', text: 'Application updated.' })
                    }}
                    onError={(text) => setMessage({ type: 'error', text })}
                  />
                ))
              )}
              <Link to="/support-dashboard" className="text-sm text-blue-400 hover:text-blue-300">
                Open Support Dashboard →
              </Link>
            </div>
          )}
        </>
      )}
    </FeaturePageLayout>
  )
}

function PartnershipExplainer() {
  return (
    <div className="mb-6 max-w-2xl rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-4 space-y-3">
      <h2 className="text-white text-sm font-semibold">What Partnership means</h2>
      <p className="text-slate-400 text-sm leading-relaxed">
        Approved orgs can offer help to Dumper&apos;s Repo members — medical respawn/evac, stuck
        lifts, security escort, ship salvage, and other catalog services. Members use the header{' '}
        <strong className="text-slate-300">Request Services</strong> icon (left of the bell);
        partner Discord channels get the ping; the first org to Accept wins the job.
      </p>
      <p className="text-slate-400 text-sm leading-relaxed">
        When someone Accepts, the requester gets a site modal naming{' '}
        <strong className="text-slate-300">your org</strong> and the{' '}
        <strong className="text-slate-300">pricing you listed</strong> for that service. That is a
        commitment — not a suggestion.
      </p>
      <ul className="text-sm text-slate-400 space-y-1.5 list-disc pl-5">
        <li>
          Listed services and pricing must be{' '}
          <strong className="text-slate-200">transparent, honest, and upheld</strong>
        </li>
        <li>Default pricing is FREE unless you set a clear aUEC / materials / other terms label</li>
        <li>Misleading bait pricing or refusing listed terms can lead to partnership revocation</li>
        <li>Partnership Discord webhooks are separate from personal Webhooks</li>
      </ul>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-400">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}

function BotInvitePanel() {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const url = await fetchDumperServicesBotInviteUrl()
      if (!cancelled) {
        setInviteUrl(url)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const copyUrl = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="text-xs text-amber-200/90 leading-relaxed rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-3 space-y-2">
      <p>
        Invite the <strong className="text-amber-100">Dumper Services</strong> Discord bot into the
        same server as each webhook channel (Send Messages + Embed Links +{' '}
        <strong className="text-amber-100">Attach Files</strong>). Actionable services get Accept;
        tip services (report salvage / pirate) get a screenshot post with no Accept. A webhook alone
        is not enough.
      </p>
      {loading ? (
        <p className="text-amber-200/60">Loading invite URL…</p>
      ) : inviteUrl ? (
        <>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-300 hover:text-orange-200"
          >
            Open bot invite →
          </a>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <code className="flex-1 min-w-0 break-all rounded bg-slate-950/60 border border-slate-700/80 px-2 py-1.5 text-[11px] text-slate-300">
              {inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="shrink-0 px-2.5 py-1.5 rounded border border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              {copied ? 'Copied' : 'Copy invite URL'}
            </button>
          </div>
        </>
      ) : (
        <p className="text-amber-200/70">
          Could not load the bot invite URL. Confirm Edge secret{' '}
          <code className="text-amber-100/90">DISCORD_SERVICES_APPLICATION_ID</code> is set and{' '}
          <code className="text-amber-100/90">discord-services-bot-invite</code> is deployed.
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
    approved: 'bg-green-950/50 text-green-300 border-green-500/30',
    denied: 'bg-red-950/50 text-red-300 border-red-500/30',
    withdrawn: 'bg-slate-800 text-slate-400 border-slate-600',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${styles[status] || styles.pending}`}>
      {status}
    </span>
  )
}

function OfficerAppCard({
  app,
  onDone,
  onError,
}: {
  app: PartnerApplication
  onDone: () => void | Promise<void>
  onError: (text: string) => void
}) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const review = async (approve: boolean) => {
    setBusy(true)
    const result = await reviewPartnerApplication(app.id, approve, notes)
    setBusy(false)
    if (!result.success) {
      onError(result.error || 'Failed')
      return
    }
    await onDone()
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 space-y-3">
      <div className="flex justify-between gap-2">
        <div>
          <p className="text-white text-sm font-medium">
            {app.org_name} <span className="text-slate-500">({app.org_sid})</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Applicant: {app.applicant_rsi_handle || app.applicant_display_name || '—'}
            {app.applicant_role_claim ? ` · claims ${app.applicant_role_claim}` : ''}
          </p>
          {app.org_url && (
            <a
              href={app.org_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-400 hover:underline break-all"
            >
              {app.org_url}
            </a>
          )}
          {app.notes && <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">{app.notes}</p>}
        </div>
        <StatusBadge status={app.status} />
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Review notes (optional)"
        className="site-input w-full px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void review(true)}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void review(false)}
          className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  )
}

function ManageServices({
  orgs,
  serviceTypes,
  onSaved,
  onError,
}: {
  orgs: PartnerOrg[]
  serviceTypes: ServiceType[]
  onSaved: () => void | Promise<void>
  onError: (text: string) => void
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id || '')
  const org = orgs.find((o) => o.id === orgId) || orgs[0]

  useEffect(() => {
    if (orgs.length && !orgs.some((o) => o.id === orgId)) {
      setOrgId(orgs[0].id)
    }
  }, [orgs, orgId])

  if (!org) {
    return <p className="text-slate-500 text-sm">No approved partner orgs yet.</p>
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {orgs.length > 1 && (
        <select
          value={org.id}
          onChange={(e) => setOrgId(e.target.value)}
          className="site-input px-3 py-2 text-sm"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.org_name} ({o.org_sid})
            </option>
          ))}
        </select>
      )}
      <p className="text-slate-400 text-sm leading-relaxed">
        Enable only services your org will actually run. Pricing (default{' '}
        <strong className="text-slate-300">FREE</strong>) is shown to the member when you Accept —
        keep it accurate. Webhooks here are <strong className="text-slate-300">only</strong> for
        Partnership alerts, not the personal Webhooks page.
      </p>
      <BotInvitePanel />
      <div className="space-y-3">
        {serviceTypes.map((st) => {
          const existing = org.services.find((s) => s.service_type_id === st.id)
          return (
            <ServiceEditor
              key={st.id}
              partnerOrgId={org.id}
              serviceType={st}
              existing={existing}
              onSaved={onSaved}
              onError={onError}
            />
          )
        })}
      </div>
    </div>
  )
}

function ServiceEditor({
  partnerOrgId,
  serviceType,
  existing,
  onSaved,
  onError,
}: {
  partnerOrgId: string
  serviceType: ServiceType
  existing?: PartnerOrg['services'][0]
  onSaved: () => void | Promise<void>
  onError: (text: string) => void
}) {
  const [enabled, setEnabled] = useState(existing?.enabled ?? false)
  const [pricing, setPricing] = useState(existing?.pricing_label || 'FREE')
  const [webhook, setWebhook] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(existing?.enabled ?? false)
    setPricing(existing?.pricing_label || 'FREE')
  }, [existing?.enabled, existing?.pricing_label, existing?.id])

  const save = async () => {
    setSaving(true)
    const result = await upsertPartnerOrgService({
      partnerOrgId,
      serviceTypeId: serviceType.id,
      enabled,
      pricingLabel: pricing,
      discordWebhookUrl: webhook.trim() === '' ? (enabled ? undefined : '') : webhook.trim(),
    })
    setSaving(false)
    if (!result.success) {
      onError(result.error || 'Save failed')
      return
    }
    setWebhook('')
    await onSaved()
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white text-sm font-medium">{serviceType.label}</p>
          {serviceType.description && (
            <p className="text-xs text-slate-500 mt-0.5">{serviceType.description}</p>
          )}
          {existing?.has_webhook && (
            <p className="text-[10px] text-green-400/80 mt-1">Webhook on file</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Offer this
        </label>
      </div>
      <Field label="Pricing shown to members (default FREE)">
        <input
          value={pricing}
          onChange={(e) => setPricing(e.target.value)}
          placeholder="FREE / 50k aUEC / materials only / …"
          className="site-input w-full px-3 py-2 text-sm"
        />
      </Field>
      <p className="text-[11px] text-slate-500 leading-relaxed -mt-1">
        Members see this exact label when your org Accepts their request. Do not list a teaser price
        you will not honor.
      </p>
      <Field label={existing?.has_webhook ? 'Replace Discord webhook URL' : 'Discord webhook URL'}>
        <input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          className="site-input w-full px-3 py-2 text-sm font-mono"
        />
      </Field>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save service'}
      </button>
    </div>
  )
}
