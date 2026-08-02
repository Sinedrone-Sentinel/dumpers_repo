// Supabase Edge Function: send-discord
// Processes Discord message queue and sends to webhooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COLORS: Record<string, number> = {
  orders: 0x22c55e,
  order_new: 0x22c55e,
  order_fulfilled: 0x3b82f6,
  order_cancelled: 0xef4444,
  market_wtb_new: 0x22c55e,
  market_wts_new: 0x10b981,
  market_accepted: 0x3b82f6,
  market_cancelled: 0xef4444,
  market_coalesced: 0xf59e0b,
  my_order_accepted: 0x3b82f6,
  my_order_in_progress: 0x6366f1,
  my_order_ready: 0xf59e0b,
  my_order_completed: 0x22c55e,
  my_order_cancelled: 0xef4444,
  my_order_released: 0xef4444,
  my_order_timeout: 0xef4444,
  my_order_noshow: 0xef4444,
  my_order_dispute: 0xef4444,
  my_support_reply: 0x8b5cf6,
  my_support_resolved: 0x22c55e,
  support: 0x8b5cf6,
  admin: 0xef4444,
  blueprints: 0x5865f2,
}

const DISCORD_EMBED_CHAR_LIMIT = 5800
const DISCORD_FIELD_VALUE_LIMIT = 1024
const DISCORD_FIELD_NAME_LIMIT = 256
const DISCORD_TITLE_LIMIT = 256
const DISCORD_DESCRIPTION_LIMIT = 4096
const DISCORD_MAX_FIELDS = 25

/** Decode JWT payload without verifying — used only to avoid calling Auth getUser with API keys. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** True only when the bearer looks like a signed-in user access token (has sub). */
function isUserAccessToken(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload) return false
  const role = typeof payload.role === 'string' ? payload.role : ''
  if (role === 'anon' || role === 'service_role') return false
  return typeof payload.sub === 'string' && payload.sub.length > 0
}

interface DiscordSettings {
  enabled: boolean
  orders_enabled: boolean
  order_new_enabled: boolean
  order_fulfilled_enabled: boolean
  order_cancelled_enabled: boolean
  blueprints_enabled: boolean
  support_enabled: boolean
  admin_enabled: boolean
  personal_discord_enabled: boolean
  market_coalesce_enabled: boolean
  market_coalesce_minutes: number
  official_webhook_url: string | null
  official_webhook_name: string | null
}

interface QueuedMessage {
  id: string
  event_type: string
  title: string
  description: string | null
  color: number
  fields: Array<{ name: string; value: string; inline?: boolean }>
  target_user_id: string | null
  actor_user_id: string | null
  created_at: string
}

interface Webhook {
  id: string
  webhook_url: string
  webhook_name: string
}

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  footer?: { text: string }
  timestamp?: string
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)) + '…'
}

function embedCharCount(embed: DiscordEmbed): number {
  let total = embed.title.length
  if (embed.description) total += embed.description.length
  if (embed.footer?.text) total += embed.footer.text.length
  for (const field of embed.fields ?? []) {
    total += field.name.length + field.value.length
  }
  return total
}

function sanitizeEmbed(embed: DiscordEmbed): DiscordEmbed {
  const next: DiscordEmbed = {
    ...embed,
    title: truncate(embed.title, DISCORD_TITLE_LIMIT),
    description: embed.description
      ? truncate(embed.description, DISCORD_DESCRIPTION_LIMIT)
      : undefined,
    fields: (embed.fields ?? [])
      .slice(0, DISCORD_MAX_FIELDS)
      .map((field) => ({
        name: truncate(field.name, DISCORD_FIELD_NAME_LIMIT),
        value: truncate(field.value, DISCORD_FIELD_VALUE_LIMIT),
        inline: field.inline,
      })),
  }

  while (embedCharCount(next) > DISCORD_EMBED_CHAR_LIMIT && (next.fields?.length ?? 0) > 0) {
    next.fields = next.fields!.slice(0, -1)
  }

  if (embedCharCount(next) > DISCORD_EMBED_CHAR_LIMIT && next.description) {
    next.description = truncate(next.description, 512)
  }

  return next
}

function isStaffEvent(eventType: string): boolean {
  return eventType === 'support' || eventType === 'admin'
}

function isPersonalEvent(eventType: string): boolean {
  return eventType.startsWith('my_')
}

function isMarketEvent(eventType: string): boolean {
  return eventType.startsWith('market_')
}

function marketSubscribeHint(eventType: string): string {
  if (eventType === 'market_coalesced') {
    return 'market_wtb_new, market_wts_new, or market_cancelled'
  }
  return eventType
}

function personalSubscribeHint(eventType: string): string {
  return `${eventType} on your personal webhook at /discord-subscribe`
}

function isLegacyPublicEvent(eventType: string): boolean {
  return ['orders', 'order_new', 'order_fulfilled', 'order_cancelled', 'blueprints'].includes(
    eventType
  )
}

async function sendToWebhook(
  webhookUrl: string,
  embed: DiscordEmbed,
  webhookName: string
): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: "Dumper's Repo",
        embeds: [embed],
      }),
    })

    if (response.status === 204 || response.ok) {
      console.log(`Successfully sent to ${webhookName}`)
      return { ok: true, status: response.status }
    }

    const body = await response.text()
    console.error(`Failed to send to ${webhookName}: ${response.status} ${body}`)
    return { ok: false, status: response.status, body }
  } catch (error) {
    console.error(`Error sending to ${webhookName}:`, error)
    return { ok: false, body: (error as Error).message }
  }
}

/** One POST per unique webhook URL (per-event rows often share a channel URL). */
function uniqueWebhooksByUrl(webhooks: Webhook[]): Webhook[] {
  const seen = new Set<string>()
  const unique: Webhook[] = []
  for (const webhook of webhooks) {
    if (seen.has(webhook.webhook_url)) continue
    seen.add(webhook.webhook_url)
    unique.push(webhook)
  }
  return unique
}

async function deliverToWebhooks(
  supabase: ReturnType<typeof createClient>,
  webhooks: Webhook[],
  embed: DiscordEmbed
): Promise<{ sent: number; attempted: number; lastError?: string }> {
  let sent = 0
  let lastError: string | undefined
  const safeEmbed = sanitizeEmbed(embed)
  const targets = uniqueWebhooksByUrl(webhooks)

  for (const webhook of targets) {
    const result = await sendToWebhook(webhook.webhook_url, safeEmbed, webhook.webhook_name)

    await supabase.rpc('record_discord_webhook_result', {
      p_webhook_id: webhook.id,
      p_success: result.ok,
    })

    if (result.ok) {
      sent++
    } else {
      lastError = result.body || `HTTP ${result.status ?? 'error'}`
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return { sent, attempted: targets.length, lastError }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let includeHeld = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        includeHeld = body?.include_held === true
      } catch {
        // Empty or non-JSON body — cron/default behavior.
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Cron uses Bearer service_role; Discord settings modal uses a super-admin user JWT.
    // Reject anon / member / missing auth — do not fall through into queue processing.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = token.length > 0 && token === supabaseServiceKey

    if (!isServiceRole) {
      // Cron / misconfigured app_config often sends anon or service_role JWTs.
      // Those have no `sub` — calling auth.getUser() spams Auth logs every minute with
      // "403: invalid claim: missing sub claim". Reject locally instead.
      if (!isUserAccessToken(token)) {
        return new Response(
          JSON.stringify({
            error:
              'Invalid authorization — expected service_role Bearer (cron) or a super-admin user JWT. Check app_config.supabase_service_key matches the Edge service_role secret.',
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'super-admin') {
        return new Response(
          JSON.stringify({ error: 'Super-admin access required for manual trigger' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const { data: settingsData, error: settingsError } = await supabase.rpc('get_discord_settings')

    if (settingsError || !settingsData || settingsData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Discord settings', details: settingsError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const settings = settingsData[0] as DiscordSettings

    if (!settings.enabled) {
      return new Response(
        JSON.stringify({ message: 'Discord integration is disabled', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: messages, error: msgError } = await supabase.rpc('get_pending_discord_messages', {
      p_limit: 50,
      p_include_held: includeHeld,
    })

    if (msgError) {
      return new Response(
        JSON.stringify({ error: 'Failed to get pending messages', details: msgError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending messages', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${messages.length} pending messages`)

    let processed = 0
    let sent = 0
    const errors: string[] = []
    const notices: string[] = []

    for (const msg of messages as QueuedMessage[]) {
      const rawFields = Array.isArray(msg.fields)
        ? msg.fields
        : msg.fields
          ? (Object.values(msg.fields) as Array<{ name: string; value: string; inline?: boolean }>)
          : undefined

      const embed: DiscordEmbed = {
        title: msg.title,
        description: msg.description || undefined,
        color: msg.color || COLORS[msg.event_type] || 0x5865f2,
        fields: rawFields,
        footer: { text: `Dumper's Repo • ${msg.event_type}` },
        timestamp: msg.created_at,
      }

      let deliverySent = 0
      let shouldMarkProcessed = true

      if (isStaffEvent(msg.event_type)) {
        if (settings.official_webhook_url) {
          const result = await sendToWebhook(
            settings.official_webhook_url,
            sanitizeEmbed(embed),
            settings.official_webhook_name || 'Official'
          )
          if (result.ok) {
            deliverySent++
          } else {
            shouldMarkProcessed = false
            errors.push(`Staff ${msg.event_type}: ${result.body ?? result.status}`)
          }
        } else {
          console.log(`Skipping staff message (${msg.event_type}): No official webhook configured`)
        }
      } else if (isPersonalEvent(msg.event_type)) {
        if (!msg.target_user_id) {
          console.log(`Skipping personal message (${msg.event_type}): missing target_user_id`)
        } else {
          const { data: webhooks, error: webhookError } = await supabase.rpc(
            'get_discord_webhooks_for_personal_event',
            { p_event_type: msg.event_type, p_target_user_id: msg.target_user_id }
          )

          if (webhookError) {
            shouldMarkProcessed = false
            errors.push(`Failed to get personal webhooks for ${msg.event_type}: ${webhookError.message}`)
          } else if ((webhooks || []).length === 0) {
            notices.push(
              `${msg.event_type} (“${msg.title.slice(0, 60)}”): no personal webhook subscribed — enable ${personalSubscribeHint(msg.event_type)}`
            )
          } else {
            const result = await deliverToWebhooks(supabase, (webhooks || []) as Webhook[], embed)
            deliverySent += result.sent
            if (result.attempted > 0 && result.sent === 0) {
              shouldMarkProcessed = false
              errors.push(
                `Personal ${msg.event_type} delivery failed: ${result.lastError ?? 'all webhooks failed'}`
              )
            }
          }
        }
      } else if (isMarketEvent(msg.event_type)) {
        const { data: webhooks, error: webhookError } = await supabase.rpc(
          'get_discord_webhooks_for_market_event',
          { p_event_type: msg.event_type, p_exclude_user_id: msg.actor_user_id }
        )

        if (webhookError) {
          shouldMarkProcessed = false
          errors.push(`Failed to get market webhooks for ${msg.event_type}: ${webhookError.message}`)
        } else if ((webhooks || []).length === 0) {
          const { data: includingActor } = await supabase.rpc(
            'get_discord_webhooks_for_market_event',
            { p_event_type: msg.event_type, p_exclude_user_id: null }
          )
          const hint = marketSubscribeHint(msg.event_type)
          if ((includingActor || []).length === 0) {
            notices.push(
              `${msg.event_type} (“${msg.title.slice(0, 60)}”): no webhooks subscribed — add ${hint} on /discord-subscribe`
            )
          } else if (msg.actor_user_id) {
            notices.push(
              `${msg.event_type} (“${msg.title.slice(0, 60)}”): skipped your webhook(s) — marketplace alerts never echo your own posts/actions`
            )
          } else {
            notices.push(`${msg.event_type}: no matching active webhooks`)
          }
        } else {
          const result = await deliverToWebhooks(supabase, (webhooks || []) as Webhook[], embed)
          deliverySent += result.sent
          if (result.attempted > 0 && result.sent === 0) {
            shouldMarkProcessed = false
            errors.push(
              `Market ${msg.event_type} delivery failed: ${result.lastError ?? 'all webhooks failed'}`
            )
          }
        }
      } else if (isLegacyPublicEvent(msg.event_type)) {
        const { data: webhooks, error: webhookError } = await supabase.rpc(
          'get_discord_webhooks_for_event',
          { p_event_type: msg.event_type }
        )

        if (webhookError) {
          shouldMarkProcessed = false
          errors.push(`Failed to get webhooks for ${msg.event_type}: ${webhookError.message}`)
        } else if ((webhooks || []).length === 0) {
          notices.push(
            `${msg.event_type} (“${msg.title.slice(0, 60)}”): no legacy webhooks subscribed`
          )
        } else {
          const result = await deliverToWebhooks(supabase, (webhooks || []) as Webhook[], embed)
          deliverySent += result.sent
          if (result.attempted > 0 && result.sent === 0) {
            shouldMarkProcessed = false
            errors.push(
              `Legacy ${msg.event_type} delivery failed: ${result.lastError ?? 'all webhooks failed'}`
            )
          }
        }
      } else {
        console.log(`Skipping unknown event type: ${msg.event_type}`)
      }

      sent += deliverySent

      if (shouldMarkProcessed) {
        await supabase.rpc('mark_discord_message_processed', { p_message_id: msg.id })
        processed++
      } else {
        console.log(`Leaving message ${msg.id} queued for retry (${msg.event_type})`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        sent,
        errors: errors.length > 0 ? errors : undefined,
        notices: notices.length > 0 ? notices : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Send Discord error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
