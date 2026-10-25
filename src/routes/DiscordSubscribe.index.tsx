import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import SiteTooltip from '../components/SiteTooltip'
import {
  syncMyDiscordEventWebhooks,
  getMyDiscordWebhooks,
  UserWebhook,
} from '../lib/discord'
import { DISCORD_COLLECTIONS } from '../lib/discordCollections'
import { useAuth } from '../contexts/AuthContext'

const WEBHOOK_URL_REGEX =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/

type CollectionForm = {
  channelName: string
  webhookUrl: string
  checked: Record<string, boolean>
}

function emptyForm(events: { type: string }[]): CollectionForm {
  const checked: Record<string, boolean> = {}
  for (const event of events) checked[event.type] = false
  return { channelName: '', webhookUrl: '', checked }
}

function buildForms(webhooks: UserWebhook[]): Record<string, CollectionForm> {
  const forms: Record<string, CollectionForm> = {}
  for (const collection of DISCORD_COLLECTIONS) {
    const form = emptyForm(collection.events)
    const matches = webhooks.filter((webhook) =>
      webhook.subscribed_events.some((event) => collection.events.some((item) => item.type === event))
    )
    const url = matches[0]?.webhook_url ?? ''
    const name = matches.find((webhook) => webhook.webhook_url === url)?.webhook_name ?? ''
    form.webhookUrl = url
    form.channelName = name
    for (const event of collection.events) {
      form.checked[event.type] = matches.some((webhook) => webhook.subscribed_events.includes(event.type))
    }
    forms[collection.id] = form
  }
  return forms
}

export default function DiscordSubscribeRoute() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const isRsiVerified = profile?.rsi_handle_verified ?? false
  const { focus } = useSearch({ strict: false }) as { focus?: string }

  const visible = useMemo(
    () => DISCORD_COLLECTIONS.filter((collection) => isRsiVerified || !collection.requiresVerified),
    [isRsiVerified]
  )

  const [forms, setForms] = useState<Record<string, CollectionForm>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: '/' })
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const webhooksResult = await getMyDiscordWebhooks()
      const next = buildForms(webhooksResult.webhooks ?? [])
      setForms(next)
      const opened: Record<string, boolean> = {}
      for (const collection of DISCORD_COLLECTIONS) {
        const form = next[collection.id]
        const filled = Boolean(form?.webhookUrl)
        opened[collection.id] = collection.id === focus || collection.id === 'my-deals' || filled
      }
      setOpen(opened)
      setLoading(false)
    }
    void load()
  }, [user, focus])

  useEffect(() => {
    if (loading || !focus) return
    const target = document.getElementById(`webhook-${focus}`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.remove('webhook-here')
    void target.offsetWidth
    target.classList.add('webhook-here')
  }, [loading, focus, open])

  const patch = (id: string, partial: Partial<CollectionForm>) => {
    setForms((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyForm([])), ...partial },
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const payload: Array<{ event_type: string; webhook_name: string; webhook_url: string }> = []
    for (const collection of visible) {
      const form = forms[collection.id] ?? emptyForm(collection.events)
      const url = form.webhookUrl.trim()
      const name = form.channelName.trim()
      const anyChecked = collection.events.some((item) => form.checked[item.type])
      if ((url || anyChecked) && !name) {
        setError(`Add a channel name for ${collection.title}, or clear the webhook.`)
        setOpen((prev) => ({ ...prev, [collection.id]: true }))
        return
      }
      if (url && !WEBHOOK_URL_REGEX.test(url)) {
        setError(`Invalid webhook URL for ${collection.title}.`)
        setOpen((prev) => ({ ...prev, [collection.id]: true }))
        return
      }
      for (const item of collection.events) {
        const on = Boolean(form.checked[item.type]) && url.length > 0
        payload.push({
          event_type: item.type,
          webhook_name: on ? name : '',
          webhook_url: on ? url : '',
        })
      }
    }

    setSubmitting(true)
    const result = await syncMyDiscordEventWebhooks(payload)
    if (result.success) {
      setSuccessMessage('Webhooks updated.')
      const refreshed = await getMyDiscordWebhooks()
      if (refreshed.webhooks) setForms(buildForms(refreshed.webhooks))
    } else {
      setError(result.error || 'Failed to update webhooks')
    }
    setSubmitting(false)
  }

  if (authLoading || !user) {
    return (
      <FeaturePageLayout title="Webhooks" subtitle="Loading..." badge="Discord">
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-indigo-500 rounded-full animate-spin" />
        </div>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="Webhooks"
      subtitle="Discord pings for your deals, the marketplace, the hangar, and Franken-Fit"
      badge="Discord"
    >
      <div className="max-w-[60rem] space-y-4">
        {error && <div className="site-banner-error text-sm">{error}</div>}
        {successMessage && <div className="site-banner-success text-sm">{successMessage}</div>}

        <SiteTooltip
          side="bottom"
          content="In Discord: Server settings, Integrations, Webhooks, New Webhook, then copy the URL."
        >
          <p className="site-hint w-fit">How to create a webhook</p>
        </SiteTooltip>

        {loading ? (
          <div className="w-6 h-6 border-t-2 border-indigo-500 rounded-full animate-spin" />
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {visible.map((collection) => {
              const form = forms[collection.id] ?? emptyForm(collection.events)
              const expanded = open[collection.id] ?? false
              return (
                <section
                  key={collection.id}
                  id={`webhook-${collection.id}`}
                  className={`site-section border ${collection.accent}`}
                >
                  <button
                    type="button"
                    className="site-section-header w-full flex items-center justify-between text-left"
                    onClick={() => setOpen((prev) => ({ ...prev, [collection.id]: !expanded }))}
                  >
                    <SiteTooltip side="top" content={collection.hint}>
                      <span className={`text-sm font-semibold ${collection.titleClass}`}>{collection.title}</span>
                    </SiteTooltip>
                    <span className="text-xs text-slate-500">{expanded ? 'Hide' : 'Show'}</span>
                  </button>
                  {expanded && (
                    <div className="site-section-body space-y-3">
                      <div>
                        <SiteTooltip side="top" content="The name Discord shows on the message.">
                          <label className="site-label mb-1">Channel name</label>
                        </SiteTooltip>
                        <input
                          type="text"
                          value={form.channelName}
                          onChange={(input) => patch(collection.id, { channelName: input.target.value })}
                          placeholder="e.g. #my-deal-alerts"
                          disabled={submitting}
                          className="site-input w-full px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <SiteTooltip side="top" content="Paste the webhook URL from Discord. Leave it blank to turn this group off.">
                          <label className="site-label mb-1">Webhook URL</label>
                        </SiteTooltip>
                        <input
                          type="text"
                          value={form.webhookUrl}
                          onChange={(input) => patch(collection.id, { webhookUrl: input.target.value })}
                          placeholder="https://discord.com/api/webhooks/..."
                          disabled={submitting}
                          className="site-input w-full px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        {collection.events.map((item) => (
                          <SiteTooltip key={item.type} side="top" content={item.hint}>
                            <label className="flex items-center gap-2 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                className="site-checkbox"
                                checked={Boolean(form.checked[item.type])}
                                disabled={submitting}
                                onChange={(input) =>
                                  patch(collection.id, {
                                    checked: { ...form.checked, [item.type]: input.target.checked },
                                  })
                                }
                              />
                              {item.label}
                            </label>
                          </SiteTooltip>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
            <div className="xl:col-span-2">
              <button type="submit" disabled={submitting} className="site-btn-primary w-full">
                {submitting ? 'Updating...' : 'Update Webhooks'}
              </button>
            </div>
          </form>
        )}

        <Link to="/" className="site-btn-ghost text-sm">
          ← Back to Blueprints
        </Link>
      </div>
    </FeaturePageLayout>
  )
}
