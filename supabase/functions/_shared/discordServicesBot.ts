/** Shared helpers for the Partnership-only Dumper Services Discord bot. */

export const DISCORD_API = 'https://discord.com/api/v10'
export const ACCEPT_CUSTOM_ID_PREFIX = 'ds_accept:'

/** Send Messages + Embed Links + Attach Files */
export const BOT_INVITE_PERMISSIONS = 51200

export function buildBotInviteUrl(applicationId: string): string {
  const clientId = applicationId.trim()
  return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${BOT_INVITE_PERMISSIONS}&scope=bot`
}

export function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.trim()
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length')
  const arr = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    arr[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return arr
}

/** Discord Interactions ed25519 verify via Web Crypto (no CDN import). */
export async function verifyDiscordSignature(
  request: Request,
  publicKeyHex: string
): Promise<{ valid: boolean; body: string }> {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  const body = await request.text()

  if (!signature || !timestamp || !publicKeyHex) {
    return { valid: false, body }
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToUint8Array(publicKeyHex),
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToUint8Array(signature),
      new TextEncoder().encode(timestamp + body)
    )
    return { valid: Boolean(valid), body }
  } catch {
    return { valid: false, body }
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function parseAcceptCustomId(customId: string | undefined | null): string | null {
  if (!customId?.startsWith(ACCEPT_CUSTOM_ID_PREFIX)) return null
  const id = customId.slice(ACCEPT_CUSTOM_ID_PREFIX.length).trim()
  // UUID v4-ish
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null
  }
  return id
}

export function pricingTierFromLabel(pricingLabel?: string | null): 'FREE' | 'FEE' {
  const normalized = (pricingLabel || 'FREE').trim().toUpperCase()
  return normalized === 'FREE' || normalized === '' ? 'FREE' : 'FEE'
}

export function buildAcceptMessagePayload(opts: {
  requestId: string
  serviceLabel: string
  requesterLabel: string
  pricingLabel?: string
  /** Member-selected tier (FREE vs FEE). Derived from pricingLabel when omitted. */
  pricingTier?: 'FREE' | 'FEE'
  orgName?: string
  details?: string
  footerNote?: string
}): Record<string, unknown> {
  const tier = opts.pricingTier || pricingTierFromLabel(opts.pricingLabel)
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Service', value: opts.serviceLabel, inline: true },
    { name: 'Request type', value: tier, inline: true },
    { name: 'Requester RSI', value: opts.requesterLabel, inline: true },
  ]
  if (opts.pricingLabel) {
    fields.push({ name: 'Your listed pricing', value: opts.pricingLabel, inline: true })
  }
  if (opts.orgName) {
    fields.push({ name: 'Partner org', value: opts.orgName, inline: true })
  }
  if (opts.details) {
    fields.push({ name: 'Details', value: opts.details.slice(0, 1024), inline: false })
  }
  fields.push({ name: 'Request ID', value: `\`${opts.requestId}\``, inline: false })

  return {
    content: null,
    embeds: [
      {
        title: `Dumper Services — Service Request · ${tier}`,
        description:
          tier === 'FREE'
            ? 'A member requested **FREE** help. First org to **Accept** wins.'
            : 'A member requested **FEE**-based help. First org to **Accept** wins.',
        color: tier === 'FREE' ? 0x22c55e : 0xf97316,
        fields,
        footer: {
          text: opts.footerNote || "Dumper's Repo · Partnership bot",
        },
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3, // Success / green
            label: 'Accept',
            custom_id: `${ACCEPT_CUSTOM_ID_PREFIX}${opts.requestId}`,
          },
        ],
      },
    ],
  }
}

/** Resolve channel_id from a Discord incoming webhook URL. */
export async function resolveWebhookChannel(
  webhookUrl: string
): Promise<{ channel_id: string; guild_id: string | null } | { error: string }> {
  try {
    const res = await fetch(webhookUrl)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { error: data.message || `Webhook lookup failed (${res.status})` }
    }
    const channelId = String(data.channel_id || '')
    if (!/^\d{5,30}$/.test(channelId)) {
      return { error: 'Webhook has no channel_id' }
    }
    return {
      channel_id: channelId,
      guild_id: data.guild_id ? String(data.guild_id) : null,
    }
  } catch (err) {
    return { error: (err as Error).message || 'Webhook lookup failed' }
  }
}

export async function discordBotFetch(
  path: string,
  botToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bot ${botToken}`)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${DISCORD_API}${path}`, { ...init, headers })
}

export type TestMessageRef = {
  channel_id: string
  message_id: string
  guild_id?: string | null
}

function acceptedEmbed(acceptedByUsername: string, serviceLabel: string, requesterLabel: string) {
  return {
    title: 'Dumper Services — Accepted',
    description: `**${acceptedByUsername}** accepted this request.`,
    color: 0x22c55e,
    fields: [
      { name: 'Service', value: serviceLabel, inline: true },
      { name: 'Requester RSI', value: requesterLabel, inline: true },
    ],
    footer: { text: "Dumper's Repo · Partnership bot" },
    timestamp: new Date().toISOString(),
  }
}

function takenEmbed(acceptedByUsername: string, serviceLabel: string, requesterLabel: string) {
  return {
    title: 'Dumper Services — Taken',
    description: `Already accepted by **${acceptedByUsername}**.`,
    color: 0xef4444,
    fields: [
      { name: 'Service', value: serviceLabel, inline: true },
      { name: 'Requester RSI', value: requesterLabel, inline: true },
    ],
    footer: { text: "Dumper's Repo · Partnership bot" },
  }
}

export function timedOutEmbed(serviceLabel: string, requesterLabel: string) {
  return {
    title: 'Dumper Services — Timed out',
    description: 'This request expired with **no Accept** (30 minutes).',
    color: 0xef4444,
    fields: [
      { name: 'Service', value: serviceLabel, inline: true },
      { name: 'Requester RSI', value: requesterLabel, inline: true },
    ],
    footer: { text: "Dumper's Repo · Partnership bot" },
  }
}

/** Informative tip embed (no Accept button). */
export function buildTipMessagePayload(opts: {
  serviceLabel: string
  requesterLabel: string
  details: string
  orgName?: string
  pricingLabel?: string
  pricingTier?: 'FREE' | 'FEE'
}): Record<string, unknown> {
  const tier = opts.pricingTier || pricingTierFromLabel(opts.pricingLabel)
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Tip type', value: opts.serviceLabel, inline: true },
    { name: 'Request type', value: tier, inline: true },
    { name: 'Reporter RSI', value: opts.requesterLabel, inline: true },
  ]
  if (opts.orgName) {
    fields.push({ name: 'Partner org', value: opts.orgName, inline: true })
  }
  fields.push({
    name: 'Details',
    value: opts.details.slice(0, 1024) || '—',
    inline: false,
  })
  return {
    content: null,
    embeds: [
      {
        title: `Dumper Services — Intel tip · ${tier}`,
        description:
          'Informational tip — **no Accept**. Use the screenshot (starmap + `r_DisplayInfo 3`) for shard/location.',
        color: tier === 'FREE' ? 0x22c55e : 0x38bdf8,
        fields,
        footer: { text: "Dumper's Repo · Partnership tip" },
        timestamp: new Date().toISOString(),
      },
    ],
    components: [],
  }
}

export async function markMessagesTimedOut(opts: {
  botToken: string
  serviceLabel: string
  requesterLabel: string
  messages: TestMessageRef[]
}): Promise<void> {
  const body = {
    content: null,
    embeds: [timedOutEmbed(opts.serviceLabel, opts.requesterLabel)],
    components: [],
  }
  for (const msg of opts.messages) {
    try {
      await discordBotFetch(`/channels/${msg.channel_id}/messages/${msg.message_id}`, opts.botToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error('Failed to patch timed-out Discord message', msg, err)
    }
  }
}

/** Post JSON or multipart (file) message to a channel. */
export async function discordBotPostMessage(
  channelId: string,
  botToken: string,
  payload: Record<string, unknown>,
  file?: { bytes: Uint8Array; filename: string; contentType: string }
): Promise<Response> {
  if (!file) {
    return discordBotFetch(`/channels/${channelId}/messages`, botToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  const form = new FormData()
  form.append('payload_json', JSON.stringify(payload))
  form.append(
    'files[0]',
    new Blob([file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength)], {
      type: file.contentType,
    }),
    file.filename
  )
  return fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  })
}

/** After first-wins: update winner message, strip/disable losers. */
export async function reconcileTestMessagesAfterAccept(opts: {
  botToken: string
  winnerChannelId: string
  winnerMessageId: string
  acceptedByUsername: string
  serviceLabel: string
  requesterLabel: string
  messages: TestMessageRef[]
}): Promise<void> {
  const winnerBody = {
    content: null,
    embeds: [
      acceptedEmbed(opts.acceptedByUsername, opts.serviceLabel, opts.requesterLabel),
    ],
    components: [],
  }

  const takenBody = {
    content: null,
    embeds: [takenEmbed(opts.acceptedByUsername, opts.serviceLabel, opts.requesterLabel)],
    components: [],
  }

  for (const msg of opts.messages) {
    const isWinner =
      msg.channel_id === opts.winnerChannelId && msg.message_id === opts.winnerMessageId
    const body = isWinner ? winnerBody : takenBody
    try {
      await discordBotFetch(`/channels/${msg.channel_id}/messages/${msg.message_id}`, opts.botToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error('Failed to patch Discord message', msg, err)
    }
  }
}

/** Late Accept: force every known message into Taken (do not promote the late clicker). */
export async function markAllTestMessagesTaken(opts: {
  botToken: string
  acceptedByUsername: string
  serviceLabel: string
  requesterLabel: string
  messages: TestMessageRef[]
}): Promise<void> {
  const takenBody = {
    content: null,
    embeds: [takenEmbed(opts.acceptedByUsername, opts.serviceLabel, opts.requesterLabel)],
    components: [],
  }
  for (const msg of opts.messages) {
    try {
      await discordBotFetch(`/channels/${msg.channel_id}/messages/${msg.message_id}`, opts.botToken, {
        method: 'PATCH',
        body: JSON.stringify(takenBody),
      })
    } catch (err) {
      console.error('Failed to patch Discord message', msg, err)
    }
  }
}
