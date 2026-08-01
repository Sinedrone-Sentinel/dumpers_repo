/** Shared helpers for the Partnership-only Dumper Services Discord bot. */

export const DISCORD_API = 'https://discord.com/api/v10'
export const ACCEPT_CUSTOM_ID_PREFIX = 'ds_accept:'

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

export function buildAcceptMessagePayload(opts: {
  requestId: string
  serviceLabel: string
  requesterLabel: string
}): Record<string, unknown> {
  return {
    content: null,
    embeds: [
      {
        title: 'Dumper Services — Service Request',
        description: 'A member needs help. First org to **Accept** wins.',
        color: 0xf97316,
        fields: [
          { name: 'Service', value: opts.serviceLabel, inline: true },
          { name: 'Requester RSI', value: opts.requesterLabel, inline: true },
          { name: 'Request ID', value: `\`${opts.requestId}\``, inline: false },
        ],
        footer: { text: "Dumper's Repo · Partnership bot test" },
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
