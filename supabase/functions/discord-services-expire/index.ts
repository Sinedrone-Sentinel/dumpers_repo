// Mark open actionable requests past 30m as expired; red Timed out Discord patches.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, markMessagesTimedOut } from '../_shared/discordServicesBot.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'POST or GET required' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const botToken = Deno.env.get('DISCORD_SERVICES_BOT_TOKEN') || ''
  const admin = createClient(supabaseUrl, supabaseServiceKey)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (token !== supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'service_role required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await admin.rpc('expire_open_service_requests')
  if (error || !data?.success) {
    return new Response(
      JSON.stringify({ error: error?.message || data?.error || 'Expire failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const messages = (data.messages as Array<Record<string, string>>) || []
  if (botToken && messages.length > 0) {
    // Group by request so we can patch with correct labels
    const byRequest = new Map<string, Array<Record<string, string>>>()
    for (const m of messages) {
      const rid = String(m.request_id || '')
      if (!byRequest.has(rid)) byRequest.set(rid, [])
      byRequest.get(rid)!.push(m)
    }
    for (const group of byRequest.values()) {
      const first = group[0]
      await markMessagesTimedOut({
        botToken,
        serviceLabel: String(first.service_label || 'Service'),
        requesterLabel: String(first.requester_label || 'Requester'),
        messages: group.map((m) => ({
          channel_id: m.channel_id,
          message_id: m.message_id,
          guild_id: m.guild_id,
        })),
      })
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      expired_count: data.expired_count ?? 0,
      messages_patched: messages.length,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
