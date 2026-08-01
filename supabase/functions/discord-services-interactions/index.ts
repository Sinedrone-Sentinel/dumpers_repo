// Dumper Services Discord bot — Interactions endpoint (Partnership only).
// Deploy with verify_jwt = false. Auth = Discord ed25519 signature.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  jsonResponse,
  markAllTestMessagesTaken,
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

  // Discord portal URL validation + health pings
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

  const { data: acceptResult, error: acceptError } = await supabase.rpc(
    'accept_dumper_services_bot_test',
    {
      p_request_id: requestId,
      p_discord_user_id: discordUserId,
      p_discord_username: discordUsername,
    }
  )

  if (acceptError) {
    console.error('accept_dumper_services_bot_test failed', acceptError)
    return jsonResponse({
      type: RESPONSE_CHANNEL_MESSAGE,
      data: {
        content: 'Accept failed (server error). Try again or contact staff.',
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

  const message = interaction.message as Record<string, unknown> | undefined
  const channelId = String(interaction.channel_id || message?.channel_id || '')
  const messageId = String(message?.id || '')
  const botToken = Deno.env.get('DISCORD_SERVICES_BOT_TOKEN') || ''

  if (!acceptResult.won) {
    const takenBy =
      acceptResult.accepted_by_discord_username ||
      acceptResult.accepted_by_discord_user_id ||
      'another org'
    const messages = (acceptResult.messages as Array<Record<string, string>> | undefined) || []
    if (botToken && messages.length > 0) {
      void markAllTestMessagesTaken({
        botToken,
        acceptedByUsername: String(takenBy),
        serviceLabel: String(acceptResult.service_label || 'Service'),
        requesterLabel: String(acceptResult.requester_label || 'Requester'),
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

  // Winner: update this message immediately via interaction response, then patch siblings.
  const serviceLabel = String(acceptResult.service_label || 'Service')
  const requesterLabel = String(acceptResult.requester_label || 'Requester')
  const messages = (acceptResult.messages as Array<Record<string, string>> | undefined) || []

  if (botToken && messages.length > 0) {
    void reconcileTestMessagesAfterAccept({
      botToken,
      winnerChannelId: channelId,
      winnerMessageId: messageId,
      acceptedByUsername: discordUsername,
      serviceLabel,
      requesterLabel,
      messages: messages.map((m) => ({
        channel_id: m.channel_id,
        message_id: m.message_id,
        guild_id: m.guild_id,
      })),
    }).catch((err) => console.error('winner reconcile failed', err))
  }

  return jsonResponse({
    type: RESPONSE_UPDATE_MESSAGE,
    data: {
      content: null,
      embeds: [
        {
          title: 'Dumper Services — Accepted',
          description: `**${discordUsername}** accepted this request.`,
          color: 0x22c55e,
          fields: [
            { name: 'Service', value: serviceLabel, inline: true },
            { name: 'Requester RSI', value: requesterLabel, inline: true },
          ],
          footer: { text: "Dumper's Repo · Partnership bot" },
        },
      ],
      components: [],
    },
  })
})
