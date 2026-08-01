// Super-admin / service_role: post N Accept-button test messages for one request.
// Proves fan-out + first-wins against the Interactions bot.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildAcceptMessagePayload,
  discordBotFetch,
  jsonResponse,
} from '../_shared/discordServicesBot.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST required' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const botToken = Deno.env.get('DISCORD_SERVICES_BOT_TOKEN') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (!botToken) {
      return new Response(JSON.stringify({ error: 'DISCORD_SERVICES_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = token.length > 0 && token === supabaseServiceKey
    let createdBy: string | null = null

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role !== 'super-admin') {
        return new Response(JSON.stringify({ error: 'Super-admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      createdBy = user.id
    }

    const body = await req.json().catch(() => ({}))
    const channelId = String(body.channel_id || '').trim()
    const copyCount = Math.min(5, Math.max(1, Number(body.copy_count) || 2))
    const serviceLabel = String(body.service_label || 'Medical').trim() || 'Medical'
    const requesterLabel = String(body.requester_label || 'sinedrone_sentinel').trim() || 'sinedrone_sentinel'

    if (!/^\d{5,30}$/.test(channelId)) {
      return new Response(
        JSON.stringify({
          error: 'channel_id required (Discord channel snowflake). Enable Developer Mode → Copy Channel ID.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: created, error: createError } = await supabase.rpc(
      'create_dumper_services_bot_test_request',
      {
        p_service_label: serviceLabel,
        p_requester_label: requesterLabel,
        p_created_by: createdBy,
      }
    )

    if (createError || !created?.success || !created.request_id) {
      return new Response(
        JSON.stringify({ error: createError?.message || created?.error || 'Failed to create test request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const requestId = String(created.request_id)
    const payload = buildAcceptMessagePayload({
      requestId,
      serviceLabel,
      requesterLabel,
    })

    const posted: Array<{ channel_id: string; message_id: string }> = []
    const errors: string[] = []

    for (let i = 0; i < copyCount; i++) {
      const copyPayload = {
        ...payload,
        embeds: [
          {
            ...(payload.embeds as Array<Record<string, unknown>>)[0],
            footer: {
              text: `Dumper's Repo · Partnership bot test · copy ${i + 1}/${copyCount}`,
            },
          },
        ],
      }

      const res = await discordBotFetch(`/channels/${channelId}/messages`, botToken, {
        method: 'POST',
        body: JSON.stringify(copyPayload),
      })
      const msg = await res.json().catch(() => ({}))
      if (!res.ok) {
        errors.push(`copy ${i + 1}: ${msg.message || res.status}`)
        continue
      }

      const messageId = String(msg.id || '')
      const guildId = msg.guild_id ? String(msg.guild_id) : null
      if (!messageId) {
        errors.push(`copy ${i + 1}: no message id`)
        continue
      }

      await supabase.rpc('register_dumper_services_bot_test_message', {
        p_request_id: requestId,
        p_channel_id: channelId,
        p_message_id: messageId,
        p_guild_id: guildId,
      })

      posted.push({ channel_id: channelId, message_id: messageId })
    }

    return new Response(
      JSON.stringify({
        success: posted.length > 0,
        request_id: requestId,
        posted_count: posted.length,
        posted,
        errors: errors.length ? errors : undefined,
        next: 'Click Accept on ONE message. That copy should flip to Accepted; the other(s) to Taken. A second Accept should say too late.',
      }),
      { status: posted.length > 0 ? 200 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
