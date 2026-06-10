// Supabase Edge Function: sync-blueprints
// Fetches latest Blueprints.json from sccrafter.com and updates Supabase tables

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BLUEPRINTS_URL = 'https://www.sccrafter.com/Blueprints.json'

interface BlueprintSlotOption {
  resourceName?: string
  entityName?: string
  quantity?: number
}

interface BlueprintSlot {
  slotName?: string
  options?: BlueprintSlotOption[]
}

interface RewardMission {
  mission: string
  chance: number
  locations: string[]
}

interface RawBlueprint {
  file: string
  recordName: string
  blueprintName?: string
  isReward?: boolean
  slots?: BlueprintSlot[]
  rewardMissions?: RewardMission[]
}

interface BlueprintPayload {
  version: string
  blueprints: RawBlueprint[]
}

function validatePayload(data: unknown): data is BlueprintPayload {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  if (typeof obj.version !== 'string' || !obj.version.trim()) return false
  if (!Array.isArray(obj.blueprints) || obj.blueprints.length === 0) return false
  const sample = obj.blueprints[0] as Record<string, unknown>
  if (!sample?.file || !sample?.recordName) return false
  return true
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user is super-admin
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is super-admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'super-admin') {
      return new Response(
        JSON.stringify({ error: 'Super-admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update sync status to 'syncing'
    await supabase
      .from('blueprints_sync_meta')
      .update({ sync_status: 'syncing', sync_error: null, updated_at: new Date().toISOString() })
      .eq('id', 1)

    // Fetch Blueprints.json from sccrafter.com
    console.log(`Fetching ${BLUEPRINTS_URL}...`)
    const response = await fetch(BLUEPRINTS_URL, {
      headers: { 'User-Agent': 'DumpersRepo-Sync/1.0' }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch blueprints: HTTP ${response.status}`)
    }

    const raw = await response.text()
    if (raw.length < 100_000) {
      throw new Error(`Download looks truncated (${raw.length} bytes)`)
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`)
    }

    if (!validatePayload(data)) {
      throw new Error('Invalid blueprint payload structure')
    }

    const payload = data as BlueprintPayload
    const version = payload.version
    const blueprints = payload.blueprints

    console.log(`Parsed ${blueprints.length} blueprints, version ${version}`)

    // Clear existing data
    await supabase.from('synced_blueprints').delete().neq('id', 0)

    // Insert blueprints in batches
    const batchSize = 50
    let inserted = 0

    for (let i = 0; i < blueprints.length; i += batchSize) {
      const batch = blueprints.slice(i, i + batchSize).map(bp => ({
        file: bp.file,
        record_name: bp.recordName,
        blueprint_name: bp.blueprintName || bp.recordName.split('.').pop() || bp.recordName,
        is_reward: bp.isReward || false,
        slots: bp.slots || [],
        reward_missions: bp.rewardMissions || [],
        updated_at: new Date().toISOString()
      }))

      const { error: insertError } = await supabase.from('synced_blueprints').insert(batch)
      if (insertError) {
        console.error(`Batch insert error at ${i}:`, insertError)
        throw new Error(`Failed to insert batch at ${i}: ${insertError.message}`)
      }
      inserted += batch.length
    }

    // Update sync status to success
    await supabase
      .from('blueprints_sync_meta')
      .update({
        sync_status: 'success',
        last_synced_at: new Date().toISOString(),
        source_url: BLUEPRINTS_URL,
        source_version: version,
        blueprint_count: inserted,
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)

    return new Response(
      JSON.stringify({
        success: true,
        version,
        count: inserted
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync error:', error)

    // Try to update sync status to error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      await supabase
        .from('blueprints_sync_meta')
        .update({
          sync_status: 'error',
          sync_error: (error as Error).message,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
    } catch (_) {
      // Ignore error update failure
    }

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
