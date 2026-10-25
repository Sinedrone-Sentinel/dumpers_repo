// Supabase Edge Function: send-discord
// Processes Discord message queue and sends to webhooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ORE_COLORS } from './oreColors.ts'

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
  my_order_deal_message: 0x38bdf8,
  my_support_reply: 0x8b5cf6,
  my_support_resolved: 0x22c55e,
  my_friend_request: 0x3b82f6,
  my_friend_accepted: 0x22c55e,
  support: 0x8b5cf6,
  admin: 0xef4444,
  partnership_application: 0x8b5cf6,
  contributor_application: 0x3498db,
  blueprints: 0x5865f2,
}

const LOGO_URL = 'https://dumpers-repo.com/ORG_LOGO.png'

const CATEGORY_COLOR: Record<string, number> = {
  admin: 0x22c55e,
  orders: 0x3b82f6,
  deal: 0x22c55e,
  negative: 0xef4444,
  support: 0x8b5cf6,
  gold: 0xf59e0b,
}

function categoryOf(eventType: string, title: string): { color: number; footer: string } {
  if (eventType === 'hangar_30' || eventType === 'hangar_5') return { color: CATEGORY_COLOR.gold, footer: 'Executive Hangar' }
  if (eventType === 'franken_new' || eventType === 'franken_updated') return { color: CATEGORY_COLOR.gold, footer: 'Ship Shop' }
  if (eventType.startsWith('my_support') || eventType === 'support') return { color: CATEGORY_COLOR.support, footer: 'Support' }
  if (
    ['my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute', 'market_cancelled', 'market_wtb_cancelled', 'market_wts_cancelled'].includes(eventType)
  ) return { color: CATEGORY_COLOR.negative, footer: eventType.startsWith('my_') ? 'Your deals' : 'Orders' }
  if (eventType.startsWith('my_order') || eventType.startsWith('my_friend')) return { color: CATEGORY_COLOR.deal, footer: eventType.startsWith('my_friend') ? 'Friends' : 'Your deals' }
  if (eventType.startsWith('market_') || eventType.startsWith('order_')) return { color: CATEGORY_COLOR.orders, footer: 'Orders' }
  if (title.includes('Officer Demoted') || title.includes('Abuse')) return { color: CATEGORY_COLOR.negative, footer: 'Admin' }
  return { color: CATEGORY_COLOR.admin, footer: 'Admin' }
}

function paintLine(line: string): string {
  let body = line
  for (const [name, code] of ORE_COLORS) {
    if (!body.includes(name)) continue
    body = body.split(name).join(`\u001b[${code}m${name}\u001b[0m`)
  }
  if (/Added|\+/i.test(line) && /Added/i.test(line)) {
    return body.replace(/Added/i, '\u001b[32mAdded\u001b[0m')
  }
  if (/Removed/i.test(line)) {
    return body.replace(/Removed/i, '\u001b[31mRemoved\u001b[0m')
  }
  if (/aUEC|DFP/i.test(line)) return `\u001b[33m${body}\u001b[0m`
  return body
}

function styleFieldValue(value: string): string {
  const lines = value.split('\n')
  const painted = lines.map(paintLine)
  if (painted.join('\n') === value) return value
  return '```ansi\n' + painted.join('\n') + '\n```'
}

function styleEmbed(embed: DiscordEmbed, eventType: string, title: string): DiscordEmbed {
  const category = categoryOf(eventType, title)
  return {
    ...embed,
    color: category.color,
    thumbnail: { url: LOGO_URL },
    footer: { text: `Dumper's Repo · ${category.footer}` },
    fields: embed.fields?.map((field) => ({
      ...field,
      value: styleFieldValue(field.value),
    })),
  }
}

function staffRoute(eventType: string, title: string): string | null {
  if (eventType === 'partnership_application' || eventType === 'contributor_application' || eventType === 'support') {
    return eventType
  }
  if (eventType !== 'admin') return null
  if (title.includes('Officer Demoted')) return 'admin_officer_demoted'
  if (title.includes('RSI Handle Verified')) return 'admin_rsi_verified'
  if (title.includes('Member Left')) return 'admin_member_left'
  if (title.includes('Abuse')) return 'admin_edge_abuse'
  if (title.includes('New User Joined')) return 'admin_member_joined'
  return 'admin'
}

function isBroadcastEvent(eventType: string): boolean {
  return eventType === 'hangar_30' || eventType === 'hangar_5' || eventType === 'franken_new' || eventType === 'franken_updated'
}

function msUntilAllGreen(nowMs: number, openAt: number, openMs: number, closeMs: number): { remaining: number; cycleKey: string } {
  const cycleMs = openMs + closeMs
  const elapsed = nowMs - openAt
  const timeInCycle = ((elapsed % cycleMs) + cycleMs) % cycleMs
  const remaining = timeInCycle === 0 ? 0 : cycleMs - timeInCycle
  const cycleStart = nowMs - timeInCycle
  const nextOpen = timeInCycle === 0 ? cycleStart : cycleStart + cycleMs
  return { remaining, cycleKey: String(nextOpen) }
}

async function queueHangarWarnings(supabase: ReturnType<typeof createClient>) {
  try {
    const response = await fetch('https://raw.githubusercontent.com/ArkanisCorporation/Exec-Hangar/main/config.json')
    if (!response.ok) return
    const body = await response.json() as { serverStartTimes?: { initialOpenTime?: string; openDurationMs?: number; closeDurationMs?: number } }
    const source = body.serverStartTimes ?? body as { initialOpenTime?: string; openDurationMs?: number; closeDurationMs?: number }
    const openAt = Date.parse(source.initialOpenTime ?? '')
    const openMs = source.openDurationMs
    const closeMs = source.closeDurationMs
    if (!Number.isFinite(openAt) || typeof openMs !== 'number' || typeof closeMs !== 'number') return
    const { remaining, cycleKey } = msUntilAllGreen(Date.now(), openAt, openMs, closeMs)
    const minute = 60_000
    if (remaining > 5 * minute && remaining <= 30 * minute) {
      await supabase.rpc('discord_enqueue_deduped', {
        p_event_type: 'hangar_30',
        p_title: 'Executive Hangar in 30 minutes',
        p_description: 'All five lights turn green in 30 minutes.',
        p_color: 16096779,
        p_dedupe_key: `hangar:${cycleKey}:30`,
      })
    }
    if (remaining > 0 && remaining <= 5 * minute) {
      await supabase.rpc('discord_enqueue_deduped', {
        p_event_type: 'hangar_5',
        p_title: 'Executive Hangar in 5 minutes',
        p_description: 'All five lights turn green in 5 minutes.',
        p_color: 16096779,
        p_dedupe_key: `hangar:${cycleKey}:5`,
      })
    }
  } catch (err) {
    console.warn('Hangar warning queue skipped', err)
  }
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

function parseKeyMap(envName: string): Record<string, string> {
  const raw = Deno.env.get(envName)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Platform admin secret for createClient + exact-match cron auth (new keys preferred). */
function getAdminSecretKey(): string {
  const secretKeys = parseKeyMap('SUPABASE_SECRET_KEYS')
  if (secretKeys.default) return secretKeys.default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

function getUserScopedApiKey(): string {
  const publishable = parseKeyMap('SUPABASE_PUBLISHABLE_KEYS')
  if (publishable.default) return publishable.default
  return Deno.env.get('SUPABASE_ANON_KEY') ?? ''
}

function keyKind(s: string): string {
  if (s.startsWith('eyJ')) return 'jwt'
  if (s.startsWith('sb_secret_')) return 'sb_secret'
  if (s.startsWith('sb_publishable_')) return 'sb_publishable'
  if (s.startsWith('sb_')) return 'sb_other'
  return 'other'
}

async function sha12(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

/**
 * Exact string match against platform secrets only.
 * Accepts new sb_secret (any named key in SUPABASE_SECRET_KEYS) or legacy service_role JWT.
 */
function isExactPlatformSecret(candidate: string): boolean {
  if (!candidate) return false
  const secretKeys = parseKeyMap('SUPABASE_SECRET_KEYS')
  for (const value of Object.values(secretKeys)) {
    if (candidate === value) return true
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return legacy.length > 0 && candidate === legacy
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
  thumbnail?: { url: string }
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
  return (
    eventType === 'support' ||
    eventType === 'admin' ||
    eventType === 'partnership_application' ||
    eventType === 'contributor_application'
  )
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
    const supabaseServiceKey = getAdminSecretKey()
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: no admin secret key in Edge env' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Cron: exact match of platform secret on `apikey` (preferred for sb_secret_*) or Bearer.
    // Manual Process Now: super-admin user JWT on Authorization (verified via Auth).
    // Never trust unverified JWT role claims.
    const authHeader = req.headers.get('Authorization')
    const apiKeyHeader = (req.headers.get('apikey') ?? '').trim()
    const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : ''
    const isCronSecret =
      isExactPlatformSecret(apiKeyHeader) || isExactPlatformSecret(bearerToken)

    if (!isCronSecret) {
      if (!authHeader || !isUserAccessToken(bearerToken)) {
        console.warn('send-discord cron auth mismatch', {
          apiKeyKind: keyKind(apiKeyHeader),
          apiKeyLen: apiKeyHeader.length,
          apiKeySha12: apiKeyHeader ? await sha12(apiKeyHeader) : null,
          bearerKind: keyKind(bearerToken),
          bearerLen: bearerToken.length,
          bearerSha12: bearerToken ? await sha12(bearerToken) : null,
          envKind: keyKind(supabaseServiceKey),
          envLen: supabaseServiceKey.length,
          envSha12: await sha12(supabaseServiceKey),
        })
        return new Response(
          JSON.stringify({
            error:
              'Invalid authorization — expected exact Edge secret on apikey (cron) or a super-admin user JWT. Set app_config.supabase_service_key to the Secret API key (sb_secret_…), not the legacy JWT.',
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const userApiKey = getUserScopedApiKey()
      const userClient = createClient(supabaseUrl, userApiKey, {
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

    if (settings.enabled) {
      await queueHangarWarnings(supabase)
    }

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

      const embed = styleEmbed({
        title: msg.title,
        description: msg.description || undefined,
        color: msg.color || COLORS[msg.event_type] || 0x5865f2,
        fields: rawFields,
        timestamp: msg.created_at,
      }, msg.event_type, msg.title)

      let deliverySent = 0
      let shouldMarkProcessed = true

      if (isBroadcastEvent(msg.event_type)) {
        const { data: webhooks, error: webhookError } = await supabase.rpc(
          'get_discord_webhooks_for_event',
          { p_event_type: msg.event_type }
        )
        if (webhookError) {
          shouldMarkProcessed = false
          errors.push(`Broadcast ${msg.event_type}: ${webhookError.message}`)
        } else {
          const result = await deliverToWebhooks(supabase, (webhooks || []) as Webhook[], embed)
          deliverySent += result.sent
        }
      } else if (isStaffEvent(msg.event_type)) {
        const route = staffRoute(msg.event_type, msg.title)
        const { data: routed } = route
          ? await supabase.rpc('get_discord_webhooks_for_event', { p_event_type: route })
          : { data: [] }
        const routedHooks = (routed || []) as Webhook[]
        if (route === 'admin_officer_demoted') {
          const result = await deliverToWebhooks(supabase, routedHooks, embed)
          deliverySent += result.sent
        } else if (routedHooks.length > 0) {
          const result = await deliverToWebhooks(supabase, routedHooks, embed)
          deliverySent += result.sent
        } else if (settings.official_webhook_url) {
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
