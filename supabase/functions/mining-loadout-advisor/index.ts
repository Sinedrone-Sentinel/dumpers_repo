// Smart Cracker loadout advisor. Member JWT + their Gemini key. Catalog is server-owned.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
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
  action?: unknown
  apiKey?: unknown
  useStoredKey?: unknown
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

let catalogCache: Catalog | null = null

async function loadCatalog(): Promise<Catalog> {
  if (catalogCache) return catalogCache
  const raw = await Deno.readTextFile(new URL('./catalog.json', import.meta.url))
  const parsed = JSON.parse(raw) as Catalog
  if (!parsed?.lasers?.length || !parsed.ores?.length) {
    throw new Error('catalog_missing')
  }
  catalogCache = parsed
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
  if (key.length < 20 || key.length > 200) return false
  if (/\s/.test(key)) return false
  return /^[A-Za-z0-9_\-]+$/.test(key)
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function wrapKeyBytes(): Uint8Array | null {
  const raw = (Deno.env.get('MINING_ADVISOR_WRAP_KEY') || '').trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(32)
    for (let i = 0; i < 32; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16)
    return out
  }
  try {
    const decoded = b64ToBytes(raw)
    return decoded.length === 32 ? decoded : null
  } catch {
    return null
  }
}

async function importWrapKey(): Promise<CryptoKey | null> {
  const bytes = wrapKeyBytes()
  if (!bytes) return null
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptGeminiKey(plain: string): Promise<string | null> {
  const key = await importWrapKey()
  if (!key) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  )
  return 'v1.' + bytesToB64(iv) + '.' + bytesToB64(cipher)
}

async function decryptGeminiKey(blob: string): Promise<string | null> {
  const key = await importWrapKey()
  if (!key) return null
  const parts = blob.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  try {
    const iv = b64ToBytes(parts[1])
    const cipher = b64ToBytes(parts[2])
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    const text = new TextDecoder().decode(raw).trim()
    return isGeminiKey(text) ? text : null
  } catch {
    return null
  }
}

type AdminClient = ReturnType<typeof createClient>

async function loadStoredGeminiKey(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('mining_advisor_secrets')
    .select('ciphertext')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.ciphertext) return null
  return decryptGeminiKey(String(data.ciphertext))
}

async function saveStoredGeminiKey(admin: AdminClient, userId: string, apiKey: string): Promise<boolean> {
  const ciphertext = await encryptGeminiKey(apiKey)
  if (!ciphertext) return false
  const { error } = await admin.from('mining_advisor_secrets').upsert(
    { user_id: userId, ciphertext, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  return !error
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
      'Typical deposit mass is not in game files. If you use web search, label those numbers as community typical, never as this rock.',
      'If you have no typical mass, say typical deposit size is unknown.',
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
  if (status === 400 || status === 403) {
    return 'That Gemini key was rejected. Check it in Google AI Studio.'
  }
  if (status === 429) {
    return 'Your Gemini quota is used up for now. Try again later, or check AI Studio rate limits.'
  }
  return 'Gemini is unavailable right now. Try again in a moment.'
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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const action = clip(body.action, 20) || 'ask'

    if (action === 'save-key') {
      if (!isGeminiKey(body.apiKey)) {
        return json(400, { error: 'Add your Gemini API key to save it.' })
      }
      if (!wrapKeyBytes()) {
        return json(503, { error: 'Saving a key is not configured yet. Paste it each visit for now.' })
      }
      const stored = await saveStoredGeminiKey(admin, user.id, body.apiKey.trim())
      if (!stored) return json(500, { error: 'Could not save your key. Try again.' })
      return json(200, { saved: true })
    }

    if (action !== 'ask') {
      return json(400, { error: 'Unknown Advisor action.' })
    }

    let catalog: Catalog
    try {
      catalog = await loadCatalog()
    } catch {
      return json(503, { error: 'Advisor is not deployed yet. Ask a site admin to finish setup.' })
    }

    let apiKey = isGeminiKey(body.apiKey) ? body.apiKey.trim() : ''
    if (!apiKey && body.useStoredKey === true) {
      apiKey = (await loadStoredGeminiKey(admin, user.id)) || ''
    }
    if (!apiKey) {
      return json(400, { error: 'Add your Gemini API key to use Advisor.' })
    }

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
      },
    }
    if (planningMode && oreName) {
      payload.tools = [{ google_search: {} }]
    }

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    if (!geminiRes.ok) {
      console.error('gemini status', geminiRes.status)
      return json(geminiRes.status === 429 ? 429 : 502, { error: memberSafeGeminiError(geminiRes.status) })
    }

    const geminiJson = await geminiRes.json()
    const advice = extractGeminiText(geminiJson)
    if (!advice) {
      return json(502, { error: 'Gemini returned an empty answer. Try again.' })
    }

    return json(200, { advice })
  } catch (error) {
    console.error('advisor failed', error instanceof Error ? error.name : 'error')
    return json(500, { error: 'Advisor is temporarily unavailable.' })
  }
})
