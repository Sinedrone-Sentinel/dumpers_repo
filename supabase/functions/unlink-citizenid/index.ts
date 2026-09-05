// Member unlink: revoke Citizen iD refresh token, then un-verify locally.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function revokeCitizenId(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return
  const clientId = Deno.env.get('CITIZENID_CLIENT_ID')
  const clientSecret = Deno.env.get('CITIZENID_CLIENT_SECRET')
  const authority = (Deno.env.get('CITIZENID_AUTHORITY') || 'https://citizenid.space').replace(/\/$/, '')
  if (!clientId || !clientSecret) return
  try {
    await fetch(`${authority}/connect/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
  } catch {
    // Best-effort: local unlink still proceeds
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: token } = await admin.rpc('take_citizenid_refresh_token', {
      p_user_id: user.id,
    })
    await revokeCitizenId(typeof token === 'string' ? token : null)

    const { data, error } = await userClient.rpc('unlink_my_citizenid')
    if (error || data?.success === false) {
      return new Response(JSON.stringify({ error: data?.error || error?.message || 'Unlink failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
