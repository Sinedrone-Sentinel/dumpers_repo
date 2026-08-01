// Returns the Partnership Dumper Services bot OAuth invite URL.
// Uses Edge secret DISCORD_SERVICES_APPLICATION_ID (already set for the bot).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildBotInviteUrl } from '../_shared/discordServicesBot.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'GET or POST required' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const applicationId = (Deno.env.get('DISCORD_SERVICES_APPLICATION_ID') || '').trim()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Authorization required' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Invalid authorization' }, 401)
    }

    if (!applicationId) {
      return json({ error: 'DISCORD_SERVICES_APPLICATION_ID not configured' }, 500)
    }

    return json({
      invite_url: buildBotInviteUrl(applicationId),
      application_id: applicationId,
    })
  } catch (err) {
    return json({ error: (err as Error).message || 'Invite failed' }, 500)
  }
})
