import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import {
  syncMyDiscordEventWebhooks,
  getDiscordPublicEventTypes,
  getMyDiscordWebhooks,
  UserWebhook,
  DiscordPublicEventType,
  DiscordEventCategory,
} from '../lib/discord'
import { useAuth } from '../contexts/AuthContext'

const CATEGORY_LABELS: Record<DiscordEventCategory, { title: string; description: string }> = {
  personal: {
    title: 'My activity',
    description:
      'Alerts when someone else moves your deal forward or sends/accepts a friend request — not when you click it yourself.',
  },
  marketplace: {
    title: 'Marketplace activity',
    description:
      'Opt-in feed when other members post or change listings. Repeated post/cancel bursts from the same member may be grouped into one ping.',
  },
  support: {
    title: 'Support',
    description: 'Updates on your support tickets.',
  },
}

const CATEGORY_ORDER: DiscordEventCategory[] = ['personal', 'marketplace', 'support']

const WEBHOOK_URL_REGEX =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/

type EventFormEntry = {
  channelName: string
  webhookUrl: string
}

function buildEventFormState(
  events: DiscordPublicEventType[],
  webhooks: UserWebhook[]
): Record<string, EventFormEntry> {
  const state: Record<string, EventFormEntry> = {}

  for (const event of events) {
    const exactMatch = webhooks.find(
      (webhook) =>
        webhook.subscribed_events.length === 1 &&
        webhook.subscribed_events[0] === event.event_type
    )
    const sharedMatch = webhooks.find((webhook) =>
      webhook.subscribed_events.includes(event.event_type)
    )
    const match = exactMatch ?? sharedMatch

    state[event.event_type] = {
      channelName: match?.webhook_name ?? '',
      webhookUrl: match?.webhook_url ?? '',
    }
  }

  return state
}

function isActiveEntry(entry: EventFormEntry): boolean {
  return entry.webhookUrl.trim().length > 0
}

export default function DiscordSubscribeRoute() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const isRsiVerified = profile?.rsi_handle_verified ?? false

  const [availableEvents, setAvailableEvents] = useState<DiscordPublicEventType[]>([])
  const [formState, setFormState] = useState<Record<string, EventFormEntry>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const eventsByCategory = useMemo(() => {
    const grouped: Record<DiscordEventCategory, DiscordPublicEventType[]> = {
      personal: [],
      marketplace: [],
      support: [],
    }
    for (const event of availableEvents) {
      grouped[event.event_category]?.push(event)
    }
    return grouped
  }, [availableEvents])

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/' })
    }
  }, [authLoading, user, navigate])

  useEffect(() => {
    const fetchData = async () => {
      const [eventsResult, webhooksResult] = await Promise.all([
        getDiscordPublicEventTypes(),
        getMyDiscordWebhooks(),
      ])

      if (eventsResult.success && eventsResult.eventTypes) {
        setAvailableEvents(eventsResult.eventTypes)
        if (webhooksResult.success && webhooksResult.webhooks) {
          setFormState(buildEventFormState(eventsResult.eventTypes, webhooksResult.webhooks))
        }
      }

      setLoading(false)
    }

    if (user) {
      fetchData()
    }
  }, [user])

  const updateEntry = (eventType: string, patch: Partial<EventFormEntry>) => {
    setFormState((prev) => ({
      ...prev,
      [eventType]: {
        channelName: prev[eventType]?.channelName ?? '',
        webhookUrl: prev[eventType]?.webhookUrl ?? '',
        ...patch,
      },
    }))
  }

  const scrollToEvent = (eventType: string) => {
    rowRefs.current[eventType]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const syncEvents = availableEvents.filter(
      (event) => isRsiVerified || event.event_category !== 'personal'
    )

    for (const event of syncEvents) {
      const entry = formState[event.event_type] ?? { channelName: '', webhookUrl: '' }
      const url = entry.webhookUrl.trim()
      const name = entry.channelName.trim()

      if (url && !name) {
        setError(
          `Add a channel name for "${event.display_name}", or clear the webhook URL to leave it unregistered.`
        )
        scrollToEvent(event.event_type)
        return
      }

      if (url && !WEBHOOK_URL_REGEX.test(url)) {
        setError(
          `Invalid webhook URL for "${event.display_name}". It should look like: https://discord.com/api/webhooks/123456789/abcdef...`
        )
        scrollToEvent(event.event_type)
        return
      }
    }

    setSubmitting(true)

    const payload = syncEvents.map((event) => {
      const entry = formState[event.event_type] ?? { channelName: '', webhookUrl: '' }
      return {
        event_type: event.event_type,
        webhook_name: entry.channelName.trim(),
        webhook_url: entry.webhookUrl.trim(),
      }
    })

    const result = await syncMyDiscordEventWebhooks(payload)

    if (result.success) {
      setSuccessMessage('Webhooks updated.')
      const webhooksResult = await getMyDiscordWebhooks()
      if (webhooksResult.success && webhooksResult.webhooks) {
        setFormState(buildEventFormState(availableEvents, webhooksResult.webhooks))
      }
    } else {
      setError(result.error || 'Failed to update webhooks')
      if (result.eventType) {
        scrollToEvent(result.eventType)
      }
    }

    setSubmitting(false)
  }

  if (authLoading) {
    return (
      <FeaturePageLayout title="Webhooks" subtitle="Loading..." badge="Discord">
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
        </div>
      </FeaturePageLayout>
    )
  }

  if (!user) {
    return null
  }

  return (
    <FeaturePageLayout
      title="Webhooks"
      subtitle="Get Discord pings about your deals and the marketplace"
      badge="Discord"
    >
      <div className="max-w-2xl space-y-6">
        {error && (
          <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-green-950/40 border border-green-500/30 rounded-lg text-sm text-green-300">
            {successMessage}
          </div>
        )}

        <section className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20">
          <p className="text-xs text-slate-400 mb-4">
            Set a channel name and webhook URL for each alert you want. Leave the URL blank to
            unregister that alert. Highlighted rows are active.
          </p>

          <div className="mb-4 p-3 site-surface rounded-lg">
            <p className="text-xs text-slate-400 mb-2">
              <strong className="text-slate-300">To create a webhook:</strong>
            </p>
            <ol className="text-xs text-slate-500 list-decimal list-inside space-y-0.5">
              <li>Go to your Discord server settings</li>
              <li>Click Integrations → Webhooks</li>
              <li>Create a webhook and copy the URL</li>
            </ol>
          </div>

          {loading ? (
            <div className="text-center py-4">
              <div className="w-6 h-6 border-t-2 border-indigo-500 rounded-full animate-spin mx-auto"></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {CATEGORY_ORDER.map((category) => {
                const events = eventsByCategory[category]
                if (events.length === 0) return null
                const meta = CATEGORY_LABELS[category]
                const personalLocked = category === 'personal' && !isRsiVerified

                return (
                  <div key={category}>
                    <div className="mb-3">
                      <h2 className="text-sm font-semibold text-white">{meta.title}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
                    </div>

                    {personalLocked && (
                      <div className="mb-3 p-3 rounded-lg bg-amber-950/40 border border-amber-500/40">
                        <p className="text-amber-300 text-sm font-medium">
                          RSI Handle verification required
                        </p>
                        <p className="text-amber-200/70 text-xs mt-1">
                          Personal deal alerts need a verified RSI Handle — the same requirement as
                          Custom Orders and Fulfillment. Marketplace and Support webhooks below stay
                          available.
                        </p>
                        <p className="text-amber-200/70 text-xs mt-2">
                          Go to <strong className="text-amber-300">Settings → Profile</strong> and
                          get a code, paste it into your public RSI Bio, then <strong className="text-cyan-400">Verify</strong> your RSI
                          Handle.
                        </p>
                      </div>
                    )}

                    <div className={`space-y-3 ${personalLocked ? 'opacity-50' : ''}`}>
                      {events.map((event) => {
                        const entry = formState[event.event_type] ?? {
                          channelName: '',
                          webhookUrl: '',
                        }
                        const active = !personalLocked && isActiveEntry(entry)
                        const inputsDisabled = personalLocked || !event.enabled || submitting

                        return (
                          <div
                            key={event.event_type}
                            ref={(el) => {
                              rowRefs.current[event.event_type] = el
                            }}
                            className={`p-3 rounded-lg border transition-colors ${
                              active
                                ? 'border-indigo-500/50 bg-indigo-950/30'
                                : 'site-surface'
                            } ${!event.enabled ? 'opacity-50' : ''}`}
                          >
                            <div className="mb-3">
                              <h3 className="text-sm font-medium text-white">{event.display_name}</h3>
                              <p className="text-xs text-slate-500 mt-0.5">{event.description}</p>
                              {!event.enabled && (
                                <span className="text-amber-400 text-xs">Disabled site-wide</span>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div>
                                <label className="site-label mb-1">
                                  Channel name
                                </label>
                                <input
                                  type="text"
                                  value={entry.channelName}
                                  onChange={(e) =>
                                    updateEntry(event.event_type, { channelName: e.target.value })
                                  }
                                  placeholder="e.g., #my-deal-alerts"
                                  disabled={inputsDisabled}
                                  className="w-full px-3 py-2 site-input text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 text-sm disabled:opacity-60"
                                />
                              </div>
                              <div>
                                <label className="site-label mb-1">
                                  Webhook URL
                                </label>
                                <input
                                  type="text"
                                  value={entry.webhookUrl}
                                  onChange={(e) =>
                                    updateEntry(event.event_type, { webhookUrl: e.target.value })
                                  }
                                  placeholder="https://discord.com/api/webhooks/..."
                                  disabled={inputsDisabled}
                                  className="w-full px-3 py-2 site-input text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 text-sm font-mono disabled:opacity-60"
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Updating...' : 'Update Webhooks'}
              </button>
            </form>
          )}
        </section>

        <div className="pt-2">
          <Link
            to="/"
            className="site-btn-ghost text-sm"
          >
            ← Back to Blueprints
          </Link>
        </div>
      </div>
    </FeaturePageLayout>
  )
}
