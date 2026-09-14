// Smart Cracker loadout advisor. Member JWT + their Gemini key. Catalog is server-owned.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import catalogJson from './catalog.json' with { type: 'json' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const
const MAX_QUESTION = 2000
const MAX_HISTORY = 8
const MAX_MSG = 2000
const MAX_OUTPUT_TOKENS = 1200

type ChatRole = 'user' | 'advisor'

type HeadSession = {
  head: string
  modules: string[]
}

type ScanSession = {
  mass: number
  resistancePercent: number
  instability: number | null
  crackSummary: string
}

type AdvisorBody = {
  apiKey?: unknown
  question?: unknown
  messages?: unknown
  useScannedInfo?: unknown
  vesselDisplayName?: unknown
  loadout?: unknown
  gadgetsInUse?: unknown
  oreName?: unknown
  scan?: unknown
  catalog?: unknown
}

type Catalog = {
  lasers: unknown[]
  modules: unknown[]
  gadgets: unknown[]
  ores: Array<{ displayName: string }>
}

function loadCatalog(): Catalog {
  const parsed = catalogJson as Catalog
  if (!parsed?.lasers?.length || !parsed.ores?.length) {
    throw new Error('catalog_missing')
  }
  return parsed
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clip(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function isGeminiKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const key = value.trim()
  if (key.length < 20 || key.length > 512) return false
  if (/\s/.test(key)) return false
  // Legacy AIza… keys and 2026 AI Studio auth keys (AQ.…).
  return /^[A-Za-z0-9_.-]+$/.test(key)
}

function parseMessages(raw: unknown): Array<{ role: ChatRole; text: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ role: ChatRole; text: string }> = []
  for (const row of raw.slice(-MAX_HISTORY)) {
    if (!row || typeof row !== 'object') continue
    const role = (row as { role?: unknown }).role
    const text = clip((row as { text?: unknown }).text, MAX_MSG)
    if (!text) continue
    if (role !== 'user' && role !== 'advisor') continue
    out.push({ role, text })
  }
  return out
}

function parseLoadout(raw: unknown): HeadSession[] {
  if (!Array.isArray(raw)) return []
  const out: HeadSession[] = []
  for (const row of raw.slice(0, 6)) {
    if (!row || typeof row !== 'object') continue
    const head = clip((row as { head?: unknown }).head, 80)
    if (!head) continue
    const modulesRaw = (row as { modules?: unknown }).modules
    const modules = Array.isArray(modulesRaw)
      ? modulesRaw.map((name) => clip(name, 80)).filter(Boolean).slice(0, 4)
      : []
    out.push({ head, modules })
  }
  return out
}

function parseGadgets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((name) => clip(name, 80)).filter(Boolean).slice(0, 4)
}

function parseScan(raw: unknown): ScanSession | null {
  if (!raw || typeof raw !== 'object') return null
  const mass = Number((raw as { mass?: unknown }).mass)
  const resistancePercent = Number((raw as { resistancePercent?: unknown }).resistancePercent)
  if (!Number.isFinite(mass) || mass <= 0 || !Number.isFinite(resistancePercent)) return null
  const instabilityRaw = (raw as { instability?: unknown }).instability
  const instability = instabilityRaw == null || instabilityRaw === ''
    ? null
    : Number(instabilityRaw)
  return {
    mass,
    resistancePercent,
    instability: Number.isFinite(instability) ? instability : null,
    crackSummary: clip((raw as { crackSummary?: unknown }).crackSummary, 600),
  }
}

function matchOre(catalog: Catalog, oreName: string) {
  const needle = oreName.trim().toLowerCase()
  if (!needle) return null
  return (
    catalog.ores.find((ore) => ore.displayName.toLowerCase() === needle) ??
    catalog.ores.find((ore) => ore.displayName.toLowerCase().includes(needle)) ??
    null
  )
}

function buildSystemPrompt(input: {
  catalog: Catalog
  planningMode: boolean
  oreName: string
  oreRow: unknown
  vesselDisplayName: string
  loadout: HeadSession[]
  gadgetsInUse: string[]
  scan: ScanSession | null
}): string {
  const lines = [
    'You are the Smart Cracker mining loadout advisor for Dumper\'s Repo (Star Citizen).',
    'Give practical advice about mining ship lasers, modules, and gadgets only.',
    'Use display names from the catalog. Never invent gear, stats, or ores.',
    'Never claim you changed, saved, or equipped a loadout. Advice only.',
    'Refuse questions about other site tools, accounts, security, or anything not mining loadouts.',
    'Keep answers concise. Prefer 1 recommended setup plus a short why.',
    'If a field is unknown, say so. Do not dump JSON or internal identifiers.',
    '',
    'Gear catalog (authoritative game-file stats):',
    JSON.stringify({
      lasers: input.catalog.lasers,
      modules: input.catalog.modules,
      gadgets: input.catalog.gadgets,
    }),
    '',
    'Current ship: ' + (input.vesselDisplayName || 'unknown'),
    'Current heads: ' + JSON.stringify(input.loadout),
    'Gadgets already on the rock: ' + (input.gadgetsInUse.join(', ') || 'none'),
  ]

  if (input.oreName) {
    lines.push('Resource: ' + input.oreName)
  }
  if (input.oreRow) {
    lines.push(
      'Game-file element stats for this resource (not a scanned rock mass): ' +
        JSON.stringify(input.oreRow),
    )
  }

  if (input.planningMode) {
    lines.push(
      'Mode: planning. Do not mention or use any HUD scan numbers.',
      'Typical deposit mass is not in game files. Say typical deposit size is unknown rather than inventing a number.',
    )
  } else if (input.scan) {
    lines.push(
      'Mode: this rock. Use the HUD scan and Smart Cracker math below. Do not invent different mass/resistance.',
      'HUD mass: ' + input.scan.mass,
      'HUD resistance %: ' + input.scan.resistancePercent,
      'HUD instability: ' + (input.scan.instability ?? 'not entered'),
      'Smart Cracker summary: ' + (input.scan.crackSummary || 'none'),
    )
  }

  return lines.join('\n')
}

function extractGeminiText(data: unknown): string {
  const parts =
    (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts ?? []
  return parts.map((part) => part.text ?? '').filter(Boolean).join('\n').trim()
}

function memberSafeGeminiError(status: number): string {
  if (status === 400 || status === 401 || status === 403) {
    return 'That Gemini key was rejected. Create a Gemini API key in Google AI Studio and try again.'
  }
  if (status === 404) {
    return 'Gemini could not reach that model. Try again in a moment.'
  }
  if (status === 429) {
    return 'Your Gemini quota is used up for now. Try again later, or check AI Studio rate limits.'
  }
  return 'Gemini is unavailable right now. Try again in a moment.'
}

function geminiUrl(model: string, apiKey: string | null): string {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  return apiKey ? `${base}?key=${encodeURIComponent(apiKey)}` : base
}

function postGemini(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
  viaQuery: boolean,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!viaQuery) headers['x-goog-api-key'] = apiKey
  return fetch(geminiUrl(model, viaQuery ? apiKey : null), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
}

async function generateAdvice(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; advice: string } | { ok: false; status: number }> {
  let lastStatus = 502
  for (const model of GEMINI_MODELS) {
    for (const viaQuery of [false, true]) {
      const res = await postGemini(apiKey, model, payload, viaQuery)
      lastStatus = res.status
      if (res.status === 429) return { ok: false, status: 429 }
      if (!res.ok) {
        console.error('gemini status', res.status, viaQuery ? 'query' : 'header')
        if (res.status === 401 || res.status === 403) continue
        if (res.status === 404) break
        continue
      }
      const advice = extractGeminiText(await res.json())
      if (advice) return { ok: true, advice }
      lastStatus = 502
    }
  }
  return { ok: false, status: lastStatus }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'Sign in to use Advisor.' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json(401, { error: 'Sign in to use Advisor.' })

    const body = (await req.json().catch(() => ({}))) as AdvisorBody
    if (body.catalog != null) {
      // Client catalog is ignored. Do not mention this to the model.
    }

    let catalog: Catalog
    try {
      catalog = loadCatalog()
    } catch {
      console.error('advisor catalog missing')
      return json(503, { error: 'Advisor is not deployed yet. Ask a site admin to finish setup.' })
    }

    if (!isGeminiKey(body.apiKey)) {
      return json(400, { error: 'Add your Gemini API key to use Advisor.' })
    }
    const apiKey = body.apiKey.trim()

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const question = clip(body.question, MAX_QUESTION)
    if (!question) return json(400, { error: 'Ask a mining loadout question.' })
    const { data: rate, error: rateError } = await admin.rpc('mining_advisor_try_consume', {
      p_user_id: user.id,
    })
    if (rateError) {
      console.error('advisor rate rpc failed')
      return json(500, { error: 'Advisor is temporarily unavailable.' })
    }
    const allowed = (rate as { allowed?: boolean } | null)?.allowed
    if (!allowed) {
      const retry = Number((rate as { retry_after_sec?: unknown } | null)?.retry_after_sec)
      return json(429, {
        error: 'Slow down — Advisor is limited to 20 questions per hour.',
        retryAfterSec: Number.isFinite(retry) ? retry : 3600,
      })
    }

    const useScannedInfo = body.useScannedInfo === true
    const scan = useScannedInfo ? parseScan(body.scan) : null
    const oreName = clip(body.oreName, 80)
    const planningMode = !useScannedInfo || !scan
    const oreRow = oreName ? matchOre(catalog, oreName) : null

    const systemPrompt = buildSystemPrompt({
      catalog,
      planningMode,
      oreName,
      oreRow,
      vesselDisplayName: clip(body.vesselDisplayName, 40),
      loadout: parseLoadout(body.loadout),
      gadgetsInUse: parseGadgets(body.gadgetsInUse),
      scan,
    })

    const history = parseMessages(body.messages)
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
    for (const msg of history) {
      contents.push({
        role: msg.role === 'advisor' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      })
    }
    contents.push({ role: 'user', parts: [{ text: question }] })

    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }
    const generated = await generateAdvice(apiKey, payload)
    if (!generated.ok) {
      return json(generated.status === 429 ? 429 : 502, {
        error: memberSafeGeminiError(generated.status),
      })
    }

    return json(200, { advice: generated.advice })
  } catch (error) {
    console.error('advisor failed', error instanceof Error ? error.name : 'error')
    return json(500, { error: 'Advisor is temporarily unavailable.' })
  }
})
