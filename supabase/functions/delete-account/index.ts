import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Remove leftover private screenshots under `{userId}/` (DB rows cascade; storage does not). */
async function purgeServiceRequestScreenshots(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const bucket = 'service-request-screenshots'
  try {
    const { data: entries, error } = await adminClient.storage.from(bucket).list(userId, {
      limit: 1000,
    })
    if (error || !entries?.length) return

    const paths = entries
      .filter((entry) => entry.name && !entry.name.endsWith('/'))
      .map((entry) => `${userId}/${entry.name}`)

    if (paths.length > 0) {
      await adminClient.storage.from(bucket).remove(paths)
    }
  } catch {
    // Best-effort: never fail account deletion on storage cleanup
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: caller }, error: userError } = await userClient.auth.getUser()
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: rpcError } = await userClient.rpc('delete_own_account')

    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    await purgeServiceRequestScreenshots(adminClient, caller.id)

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(caller.id)

    if (deleteError) {
      return new Response(JSON.stringify({ error: `Auth deletion failed: ${deleteError.message}` }), {
        status: 500,
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
