// Supabase Edge Function: log-watcher-webhook
// Receives blueprint events from the BP Dumper desktop program
// Auth: Bearer API key (verify_jwt = false)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveBlueprintInput } from './resolveBlueprint.ts'
import dumperVersionData from './dumper-version.json' with { type: 'json' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-dumper-version',
}

const AMBIGUOUS_DEDUPE_HOURS = 24
const DUMPER_DOWNLOAD_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download/DumperApps.exe'

/** Issued keys are `dr_` + 24 random bytes as hex (see migration 110). */
const DUMPER_API_KEY_RE = /^dr_[0-9a-f]{48}$/i

type SupabaseAdmin = ReturnType<typeof createClient>
type BurstKind = 'ping' | 'get_sync' | 'blueprint' | 'other'

function clientIpFromRequest(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf.slice(0, 64)
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp.slice(0, 64)
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xff) return xff.slice(0, 64)
  return 'unknown'
}

function burstKindFromEventType(eventType: string): BurstKind {
  if (eventType === 'session_ping') return 'ping'
  if (eventType === 'blueprint_received') return 'blueprint'
  return 'other'
}

async function checkAuthFailGate(supabase: SupabaseAdmin, clientKey: string): Promise<Response | null> {
  const { data, error } = await supabase.rpc('dumper_check_auth_fail_gate', {
    p_client_key: clientKey,
  })
  if (error) {
    console.warn('dumper_check_auth_fail_gate failed:', error.message)
    return null
  }
  if (data?.blocked) {
    const retry = Number(data.retry_after_sec) || 60
    return new Response(JSON.stringify({ error: 'Too many failed auth attempts', retryAfterSec: retry }), {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
      },
    })
  }
  return null
}

async function noteAuthFailure(supabase: SupabaseAdmin, clientKey: string): Promise<Response | null> {
  const { data, error } = await supabase.rpc('dumper_note_auth_failure', {
    p_client_key: clientKey,
  })
  if (error) {
    console.warn('dumper_note_auth_failure failed:', error.message)
    return null
  }
  if (data?.blocked) {
    const retry = Number(data.retry_after_sec) || 60
    return new Response(JSON.stringify({ error: 'Too many failed auth attempts', retryAfterSec: retry }), {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
      },
    })
  }
  return null
}

async function noteValidInvokeBurst(
  supabase: SupabaseAdmin,
  userId: string,
  kind: BurstKind,
  clientVersion: string,
  clientIp: string
) {
  const { error } = await supabase.rpc('dumper_note_valid_invoke_burst', {
    p_user_id: userId,
    p_kind: kind,
    p_client_version: clientVersion || null,
    p_client_ip: clientIp,
  })
  if (error) {
    console.warn('dumper_note_valid_invoke_burst failed:', error.message)
  }
}

function parseSemver(version: string): number[] {
  const cleaned = version.trim().toLowerCase().replace(/^v/, '')
  const parts: number[] = []
  for (const piece of cleaned.split(/[.+_-]/)) {
    if (!piece) continue
    let digits = ''
    for (const ch of piece) {
      if (ch >= '0' && ch <= '9') digits += ch
      else break
    }
    if (!digits) break
    parts.push(Number.parseInt(digits, 10))
  }
  return parts.length ? parts : [0]
}

/** True when `a` is strictly older than `b` (semver-ish major.minor.patch). */
function isVersionLessThan(a: string, b: string): boolean {
  const left = parseSemver(a)
  const right = parseSemver(b)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l < r) return true
    if (l > r) return false
  }
  return false
}

function latestDumperVersion(): string {
  return Deno.env.get('LATEST_DUMPER_VERSION')?.trim() || dumperVersionData.version
}

/** Bump last_used_at + lifetime/daily invoke counters (Edge usage analytics). */
async function recordApiInvoke(supabase: SupabaseAdmin, apiKey: string) {
  const { error } = await supabase.rpc('record_dumper_api_invoke', { p_api_key: apiKey })
  if (error) {
    // Non-fatal — webhook should still process events if analytics RPC is missing.
    console.warn('record_dumper_api_invoke failed:', error.message)
  }
}

type DumperGameStatus =
  | 'tracking'
  | 'exit_menu'
  | 'quit_game'
  | 'crash_waiting'
  | 'reconnected'

async function clearActiveMissions(supabase: SupabaseAdmin, userId: string) {
  const { error: deleteError } = await supabase
    .from('dumper_active_missions')
    .delete()
    .eq('user_id', userId)
  if (deleteError) throw deleteError
}

async function setGameStatus(
  supabase: SupabaseAdmin,
  userId: string,
  status: DumperGameStatus,
  clearMissions: boolean
) {
  const now = new Date().toISOString()
  if (clearMissions) {
    await clearActiveMissions(supabase, userId)
  }
  const { error } = await supabase
    .from('profiles')
    .update({
      dumper_watch_active: true,
      dumper_last_ping_at: now,
      dumper_game_status: status,
      dumper_game_status_at: now,
    })
    .eq('id', userId)
  if (error) throw error
}

async function setWatchSession(
  supabase: SupabaseAdmin,
  userId: string,
  active: boolean
) {
  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    dumper_watch_active: active,
    dumper_last_ping_at: now,
  }
  if (!active) {
    update.dumper_game_status = null
    update.dumper_game_status_at = null
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', userId)
  if (error) throw error

  if (!active) {
    await clearActiveMissions(supabase, userId)
  }
}

async function touchWatchPing(supabase: SupabaseAdmin, userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ dumper_last_ping_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

async function cleanupStaleDumperSessions(supabase: SupabaseAdmin) {
  const { error } = await supabase.rpc('cleanup_stale_dumper_sessions')
  if (error) {
    console.error('Stale dumper session cleanup failed:', error.message)
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function hasRecentAmbiguousNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  displayName: string
): Promise<boolean> {
  const since = new Date(Date.now() - AMBIGUOUS_DEDUPE_HOURS * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('user_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'log_watcher_ambiguous_blueprint')
    .is('read_at', null)
    .gte('created_at', since)
    .contains('payload', { displayName })
    .limit(1)

  return (data?.length ?? 0) > 0
}

async function sendUserNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  title: string,
  body: string,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    payload,
  })
  if (error) {
    console.error('Failed to create notification:', error.message)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const clientIp = clientIpFromRequest(req)

    const blockedEarly = await checkAuthFailGate(supabase, clientIp)
    if (blockedEarly) return blockedEarly

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !/^Bearer\s+\S+/i.test(authHeader)) {
      const rateLimited = await noteAuthFailure(supabase, clientIp)
      if (rateLimited) return rateLimited
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header. Provide Bearer <your_api_key>' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim()

    // Junk keys never hit user_api_keys — format gate + fail bucket.
    if (!DUMPER_API_KEY_RE.test(apiKey)) {
      console.log('Rejected malformed API key')
      const rateLimited = await noteAuthFailure(supabase, clientIp)
      if (rateLimited) return rateLimited
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: keyData, error: keyError } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('api_key', apiKey)
      .maybeSingle()

    if (keyError || !keyData) {
      console.log('Invalid API key')
      const rateLimited = await noteAuthFailure(supabase, clientIp)
      if (rateLimited) return rateLimited
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = keyData.user_id

    const { data: banData } = await supabase
      .from('banned_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (banData) {
      console.log(`Banned user ${userId}`)
      return new Response(JSON.stringify({ error: 'User is banned' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (!profileData || profileData.role === 'pending') {
      console.log(`Pending approval user ${userId}`)
      return new Response(JSON.stringify({ error: 'Account pending approval' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const latest = latestDumperVersion()
    const clientVersion = (req.headers.get('X-Dumper-Version') ?? '').trim()
    if (!clientVersion || isVersionLessThan(clientVersion, latest)) {
      return jsonResponse(
        {
          error: 'update_required',
          latestDumperVersion: latest,
          downloadUrl: DUMPER_DOWNLOAD_URL,
        },
        426
      )
    }

    // One count per accepted request (matches Supabase Edge invocation for this key).
    await recordApiInvoke(supabase, apiKey)

    if (req.method === 'GET') {
      await noteValidInvokeBurst(supabase, userId, 'get_sync', clientVersion, clientIp)

      const { data: bpsData, error: bpsError } = await supabase
        .from('acquired_blueprints')
        .select('blueprint_id')
        .eq('user_id', userId)

      if (bpsError) {
        throw bpsError
      }

      const list = bpsData.map((row: { blueprint_id: string }) => row.blueprint_id)
      return new Response(
        JSON.stringify({
          success: true,
          blueprints: list,
          latestDumperVersion: latest,
          downloadUrl: DUMPER_DOWNLOAD_URL,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let payload
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (payload.type === 'blueprint_received' && payload.blueprint) {
      await noteValidInvokeBurst(supabase, userId, 'blueprint', clientVersion, clientIp)

      const rawBlueprint = String(payload.blueprint).trim()
      if (!rawBlueprint || rawBlueprint.length > 200) {
        return new Response(JSON.stringify({ error: 'Invalid blueprint ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const contractDefinitionId = payload.contractDefinitionId
        ? String(payload.contractDefinitionId).trim()
        : null

      const resolved = resolveBlueprintInput(rawBlueprint, { contractDefinitionId })

      if (!resolved.ok) {
        if (resolved.error === 'unknown_blueprint') {
          return new Response(JSON.stringify({ error: 'Unknown blueprint', blueprint: rawBlueprint }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const displayName = resolved.displayName ?? rawBlueprint
        const alreadyNotified = await hasRecentAmbiguousNotification(supabase, userId, displayName)
        if (!alreadyNotified) {
          await sendUserNotification(
            supabase,
            userId,
            'log_watcher_ambiguous_blueprint',
            'BP Dumper: mark blueprint manually',
            `Could not auto-mark ${displayName}. Search for that name on Blueprints and mark the correct variant yourself.`,
            {
              displayName,
              rawInput: resolved.rawInput,
              candidates: (resolved.candidates ?? []).map((c) => c.internalName),
              link_to: '/',
              link_label: 'Mark on Blueprints',
            }
          )
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: 'ambiguous_blueprint',
            displayName,
            notificationSent: !alreadyNotified,
            candidates: (resolved.candidates ?? []).map((c) => c.internalName),
          }),
          {
            status: 202,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const blueprintId = resolved.internalName
      const blueprintName = resolved.blueprintName

      const { error: insertError } = await supabase
        .from('acquired_blueprints')
        .insert({ user_id: userId, blueprint_id: blueprintId })

      if (insertError && insertError.code !== '23505') {
        throw insertError
      }

      const isDupe = insertError?.code === '23505'

      if (!isDupe) {
        await supabase
          .from('target_list_blueprints')
          .delete()
          .eq('user_id', userId)
          .eq('blueprint_id', blueprintId)

        await sendUserNotification(
          supabase,
          userId,
          'log_watcher_blueprint_acquired',
          'BP Dumper: blueprint acquired',
          `${blueprintName} was added to your acquired blueprints.`,
          {
            blueprintName,
            internalName: blueprintId,
            link_to: '/',
            link_label: 'View Blueprints',
          }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          blueprint: blueprintId,
          blueprintName,
          duplicate: isDupe,
          resolvedVia: resolved.resolvedVia,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const eventType = typeof payload.type === 'string' ? payload.type.trim() : ''
    await noteValidInvokeBurst(
      supabase,
      userId,
      burstKindFromEventType(eventType),
      clientVersion,
      clientIp
    )

    if (eventType === 'session_start') {
      await setGameStatus(supabase, userId, 'tracking', false)
      await cleanupStaleDumperSessions(supabase)
      return jsonResponse({ success: true, event: 'session_start' })
    }

    if (eventType === 'game_exit_menu') {
      await setGameStatus(supabase, userId, 'exit_menu', false)
      return jsonResponse({ success: true, event: 'game_exit_menu' })
    }

    if (eventType === 'game_quit') {
      await setGameStatus(supabase, userId, 'quit_game', true)
      return jsonResponse({ success: true, event: 'game_quit' })
    }

    if (eventType === 'game_crash') {
      await setGameStatus(supabase, userId, 'crash_waiting', false)
      return jsonResponse({ success: true, event: 'game_crash' })
    }

    if (eventType === 'game_reconnected') {
      await setGameStatus(supabase, userId, 'reconnected', false)
      return jsonResponse({ success: true, event: 'game_reconnected' })
    }

    if (eventType === 'game_tracking') {
      await setGameStatus(supabase, userId, 'tracking', false)
      return jsonResponse({ success: true, event: 'game_tracking' })
    }

    if (eventType === 'session_end') {
      await setWatchSession(supabase, userId, false)
      return jsonResponse({ success: true, event: 'session_end' })
    }

    if (eventType === 'session_ping') {
      await touchWatchPing(supabase, userId)
      await supabase
        .from('profiles')
        .update({ dumper_watch_active: true })
        .eq('id', userId)
        .eq('dumper_watch_active', false)
      await cleanupStaleDumperSessions(supabase)
      return jsonResponse({ success: true, event: 'session_ping' })
    }

    if (eventType === 'missions_snapshot') {
      const rawMissions = payload.missions
      if (!Array.isArray(rawMissions)) {
        return jsonResponse({ error: 'Invalid missions payload' }, 400)
      }
      if (rawMissions.length > 20) {
        return jsonResponse({ error: 'Too many missions in snapshot' }, 400)
      }

      await clearActiveMissions(supabase, userId)

      const rows = rawMissions
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const missionGuid = 'missionGuid' in entry ? String(entry.missionGuid).trim() : ''
          if (!missionGuid || missionGuid.length > 128) return null
          const contractDefinitionId =
            'contractDefinitionId' in entry && entry.contractDefinitionId
              ? String(entry.contractDefinitionId).trim()
              : null
          const debugName =
            'debugName' in entry && entry.debugName
              ? String(entry.debugName).trim().slice(0, 500)
              : 'Unknown'
          return {
            user_id: userId,
            mission_guid: missionGuid,
            contract_definition_id: contractDefinitionId,
            debug_name: debugName || 'Unknown',
            started_at: new Date().toISOString(),
          }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('dumper_active_missions')
          .upsert(rows, { onConflict: 'user_id,mission_guid' })
        if (upsertError) throw upsertError
      }

      await supabase
        .from('profiles')
        .update({
          dumper_watch_active: true,
          dumper_last_ping_at: new Date().toISOString(),
          dumper_game_status: 'tracking',
          dumper_game_status_at: new Date().toISOString(),
        })
        .eq('id', userId)
      return jsonResponse({
        success: true,
        event: 'missions_snapshot',
        missionCount: rows.length,
      })
    }

    if (eventType === 'mission_started') {
      const missionGuid = payload.missionGuid ? String(payload.missionGuid).trim() : ''
      if (!missionGuid || missionGuid.length > 128) {
        return jsonResponse({ error: 'Invalid missionGuid' }, 400)
      }

      const contractDefinitionId = payload.contractDefinitionId
        ? String(payload.contractDefinitionId).trim()
        : null
      const debugName = payload.debugName
        ? String(payload.debugName).trim().slice(0, 500)
        : 'Unknown'

      const { error: upsertError } = await supabase.from('dumper_active_missions').upsert(
        {
          user_id: userId,
          mission_guid: missionGuid,
          contract_definition_id: contractDefinitionId,
          debug_name: debugName || 'Unknown',
          started_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,mission_guid' }
      )
      if (upsertError) throw upsertError

      await supabase
        .from('profiles')
        .update({
          dumper_watch_active: true,
          dumper_last_ping_at: new Date().toISOString(),
          dumper_game_status: 'tracking',
          dumper_game_status_at: new Date().toISOString(),
        })
        .eq('id', userId)
      return jsonResponse({ success: true, event: 'mission_started', missionGuid })
    }

    if (eventType === 'mission_ended') {
      const missionGuid = payload.missionGuid ? String(payload.missionGuid).trim() : ''
      if (!missionGuid || missionGuid.length > 128) {
        return jsonResponse({ error: 'Invalid missionGuid' }, 400)
      }

      const { error: deleteError } = await supabase
        .from('dumper_active_missions')
        .delete()
        .eq('user_id', userId)
        .eq('mission_guid', missionGuid)
      if (deleteError) throw deleteError

      await touchWatchPing(supabase, userId)
      return jsonResponse({ success: true, event: 'mission_ended', missionGuid })
    }

    return new Response(JSON.stringify({ message: 'Event type not handled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Internal error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
