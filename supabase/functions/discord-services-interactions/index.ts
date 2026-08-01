// Dumper Services Discord bot — Interactions endpoint (Partnership only).
// Deploy with verify_jwt = false. Auth = Discord ed25519 signature.
// Tries live accept_service_request first; falls back to harness test RPC.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  jsonResponse,
  markAllTestMessagesTaken,
  markMessagesTimedOut,
  parseAcceptCustomId,
  reconcileTestMessagesAfterAccept,
  verifyDiscordSignature,
} from '../_shared/discordServicesBot.ts'

const INTERACTION_PING = 1
const INTERACTION_MESSAGE_COMPONENT = 3
const RESPONSE_PONG = 1
const RESPONSE_CHANNEL_MESSAGE = 4
const RESPONSE_UPDATE_MESSAGE = 7
const FLAG_EPHEMERAL = 64

type AcceptResult = {
  success?: boolean
  won?: boolean
  live?: boolean
  timed_out?: boolean
  error?: string
  code?: string
  service_label?: string
  requester_label?: string
  accepted_by_discord_username?: string
  accepted_by_discord_user_id?: string
  org_name?: string
  pricing_label?: string
  messages?: Array<Record<string, string>>
}

serve(async (req) => {
  if (req.method === 'GET') {
    return jsonResponse({
      ok: true,
      service: 'discord-services-interactions',
      hint: 'Discord POSTs interactions here. Set this URL in the Discord Developer Portal.',
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const publicKey = Deno.env.get('DISCORD_SERVICES_PUBLIC_KEY') || ''
  if (!publicKey) {
    console.error('DISCORD_SERVICES_PUBLIC_KEY missing')
    return new Response('Bot not configured', { status: 500 })
  }

  const { valid, body } = await verifyDiscordSignature(req, publicKey)
  if (!valid) {
    return new Response('invalid request signature', { status: 401 })
  }

  let interaction: Record<string, unknown>
  try {
    interaction = JSON.parse(body)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const type = Number(interaction.type || 0)

  if (type === INTERACTION_PING) {
    return jsonResponse({ type: RESPONSE_PONG })
  }

  if (type !== INTERACTION_MESSAGE_COMPONENT) {
    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: 'Unsupported interaction for Dumper Services bot.',
        flags: FLAG_EPHEMERAL,
      },
    })
  }

  const data = (interaction.data || {}) as Record<string, unknown>
  const customId = String(data.custom_id || '')
  const requestId = parseAcceptCustomId(customId)

  if (!requestId) {
    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: 'Unknown button.',
        flags: FLAG_EPHEMERAL,
      },
    })
  }

  const member = interaction.member as Record<string, unknown> | undefined
  const user =
    (interaction.user as Record<string, unknown> | undefined) ||
    (member?.user as Record<string, unknown> | undefined)
  const discordUserId = String(user?.id || '')
  const discordUsername = String(user?.global_name || user?.username || 'Unknown')

  if (!discordUserId) {
    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: 'Could not identify Discord user.',
        flags: FLAG_EPHEMERAL,
      },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const message = interaction.message as Record<string, unknown> | undefined
  const channelId = String(interaction.channel_id || message?.channel_id || '')
  const messageId = String(message?.id || '')
  const botToken = Deno.env.get('DISCORD_SERVICES_BOT_TOKEN') || ''

  const { data: liveResult, error: liveError } = await supabase.rpc('accept_service_request', {
    p_request_id: requestId,
    p_discord_user_id: discordUserId,
    p_discord_username: discordUsername,
    p_channel_id: channelId || null,
    p_message_id: messageId || null,
  })

  let acceptResult: AcceptResult | null = null

  if (!liveError && liveResult?.success) {
    acceptResult = liveResult as AcceptResult
  } else if (!liveError && liveResult?.code === 'not_live') {
    const { data: testResult, error: testError } = await supabase.rpc(
      'accept_dumper_services_bot_test',
      {
        p_request_id: requestId,
        p_discord_user_id: discordUserId,
        p_discord_username: discordUsername,
      }
    )
    if (testError) {
      console.error('accept_dumper_services_bot_test failed', testError)
      return jsonResponse({
        type: RESPONSE_CHANNEL_MESSAGE,
        data: {
          content: 'Accept failed (server error). Try again or contact staff.',
          flags: FLAG_EPHEMERAL,
        },
      })
    }
    acceptResult = testResult as AcceptResult
  } else if (liveError) {
    console.error('accept_service_request failed', liveError)
    // Harness fallback if live RPC missing (migration not applied yet)
    const { data: testResult, error: testError } = await supabase.rpc(
      'accept_dumper_services_bot_test',
      {
        p_request_id: requestId,
        p_discord_user_id: discordUserId,
        p_discord_username: discordUsername,
      }
    )
    if (testError || !testResult?.success) {
      return jsonResponse({
        type: RESPONSE_CHANNEL_MESSAGE,
        data: {
          content: 'Accept failed (server error). Try again or contact staff.',
          flags: FLAG_EPHEMERAL,
        },
      })
    }
    acceptResult = testResult as AcceptResult
  } else {
    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: liveResult?.error || 'Accept failed.',
        flags: FLAG_EPHEMERAL,
      },
    })
  }

  if (!acceptResult?.success) {
    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: acceptResult?.error || 'Accept failed.',
        flags: FLAG_EPHEMERAL,
      },
    })
  }

  const serviceLabel = String(acceptResult.service_label || 'Service')
  const requesterLabel = String(acceptResult.requester_label || 'Requester')
  const messages = acceptResult.messages || []

  if (!acceptResult.won) {
    if (acceptResult.timed_out || acceptResult.error === 'Timed out') {
      if (botToken && messages.length > 0) {
        void markMessagesTimedOut({
          botToken,
          serviceLabel,
          requesterLabel,
          messages: messages.map((m) => ({
            channel_id: m.channel_id,
            message_id: m.message_id,
            guild_id: m.guild_id,
          })),
        }).catch((err) => console.error('timeout patch failed', err))
      }
      return jsonResponse({
        type: RESPONSE_CHANNEL_MESSAGE,
        data: {
          content: 'Too late — this request **timed out** (30 minutes, no Accept).',
          flags: FLAG_EPHEMERAL,
        },
      })
    }

    const takenBy =
      acceptResult.accepted_by_discord_username ||
      acceptResult.org_name ||
      acceptResult.accepted_by_discord_user_id ||
      'another org'
    if (botToken && messages.length > 0) {
      void markAllTestMessagesTaken({
        botToken,
        acceptedByUsername: String(takenBy),
        serviceLabel,
        requesterLabel,
        messages: messages.map((m) => ({
          channel_id: m.channel_id,
          message_id: m.message_id,
          guild_id: m.guild_id,
        })),
      }).catch((err) => console.error('late taken patch failed', err))
    }

    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: `Too late — already accepted by **${takenBy}**.`,
        flags: FLAG_EPHEMERAL,
      },
    })
  }

  const winnerLabel =
    acceptResult.live && acceptResult.org_name
      ? `${acceptResult.org_name} (${discordUsername})`
      : discordUsername

  if (botToken && messages.length > 0) {
    void reconcileTestMessagesAfterAccept({
      botToken,
      winnerChannelId: channelId,
      winnerMessageId: messageId,
      acceptedByUsername: winnerLabel,
      serviceLabel,
      requesterLabel,
      messages: messages.map((m) => ({
        channel_id: m.channel_id,
        message_id: m.message_id,
        guild_id: m.guild_id,
      })),
    }).catch((err) => console.error('winner reconcile failed', err))
  }

  const embedFields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Service', value: serviceLabel, inline: true },
    { name: 'Requester RSI', value: requesterLabel, inline: true },
  ]
  if (acceptResult.live && acceptResult.org_name) {
    embedFields.push({ name: 'Org', value: String(acceptResult.org_name), inline: true })
  }
  if (acceptResult.live && acceptResult.pricing_label) {
    embedFields.push({
      name: 'Listed pricing',
      value: String(acceptResult.pricing_label),
      inline: true,
    })
  }

  return jsonResponse({
    type: RESPONSE_UPDATE_MESSAGE,
    data: {
      content: null,
      embeds: [
        {
          title: 'Dumper Services — Accepted',
          description: `**${winnerLabel}** accepted this request.`,
          color: 0x22c55e,
          fields: embedFields,
          footer: { text: "Dumper's Repo · Partnership bot" },
        },
      ],
      components: [],
    },
  })
})
