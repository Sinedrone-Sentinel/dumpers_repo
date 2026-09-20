// Smart Cracker loadout advisor. Member JWT + their Gemini key. Catalog is server-owned.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import catalogJson from './catalog.json' with { type: 'json' }
import shopsJson from './shops.json' with { type: 'json' }
import { buildSystemPrompt } from './advisorPrompt.ts'
import {
  collectCatalogNames,
  formatCrossoverDeny,
  formatScopeRefusalReply,
  isCrossoverTableProbe,
  shouldDenyCrossover,
} from './sciFiCrossover.ts'
import {
  type GearShopIndex,
  renderGearShopBlock,
  resolveGearShopMatches,
} from './gearShopLookup.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// New AI Studio keys 404 on 2.5 (“no longer available to new users”).
// Prefer free-tier 3.x Flash-Lite, then Flash, then legacy 2.5 for older keys.
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
] as const
const RATE_FEATURE = 'mining_advisor'
const MAX_QUESTION = 2000
const MAX_HISTORY = 8
const MAX_MSG = 2000
const MAX_OUTPUT_TOKENS = 500

type ChatRole = 'user' | 'advisor'

type HeadSession = {
  head: string
  modules: string[]
  slots: number | null
  size: number | null
}

type CatalogLaser = {
  displayName: string
  size?: number
  slots?: number
}

type CatalogVessel = {
  displayName: string
  laserHardpoints: number
  laserSize: number
  fixedHead?: string
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
  lasers: CatalogLaser[]
  modules: unknown[]
  gadgets: unknown[]
  ores: Array<{ displayName: string }>
  vessels?: CatalogVessel[]
}

function loadCatalog(): Catalog {
  const parsed = catalogJson as Catalog
  if (!parsed?.lasers?.length || !parsed.ores?.length) {
    throw new Error('catalog_missing')
  }
  return parsed
}

/**
 * Baked UEX buy locations for mining gear. Optional on purpose — a stale or missing
 * shops.json must never take the advisor down, it just loses "where can I buy" answers.
 */
function loadGearShops(): GearShopIndex | null {
  const parsed = shopsJson as GearShopIndex
  if (!parsed?.items?.length || !parsed.terminals?.length) return null
  return parsed
}

type UsageSnapshot = {
  used: number
  max: number
  resetsInSec: number
}

type AdminClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>
}

/** SHA-256 hex of the trimmed Gemini key — never log or persist the key itself. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Non-fatal — a missing migration 196 must not take the chat down. */
async function recordAiChatEvent(
  admin: AdminClient,
  input: { userId: string; feature: string; keySha256: string; event: string },
): Promise<void> {
  const { error } = await admin.rpc('record_ai_chat_event', {
    p_user_id: input.userId,
    p_feature: input.feature,
    p_key_sha256: input.keySha256,
    p_event: input.event,
  })
  if (error) console.warn('record_ai_chat_event failed')
}

/** Echoed to the client so the x/20 meter moves the moment a question is sent. */
function usageFromRate(rate: unknown): UsageSnapshot | null {
  if (!rate || typeof rate !== 'object') return null
  const row = rate as { ask_count?: unknown; max?: unknown; resets_in_sec?: unknown }
  const used = Number(row.ask_count)
  const max = Number(row.max)
  if (!Number.isFinite(used) || !Number.isFinite(max)) return null
  const resets = Number(row.resets_in_sec)
  return { used, max, resetsInSec: Number.isFinite(resets) ? resets : 0 }
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

function findCatalogLaser(catalog: Catalog, name: string): CatalogLaser | null {
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  return (
    catalog.lasers.find((laser) => laser.displayName.toLowerCase() === needle) ??
    catalog.lasers.find((laser) => laser.displayName.toLowerCase().includes(needle)) ??
    null
  )
}

function parseLoadout(raw: unknown, catalog: Catalog): HeadSession[] {
  if (!Array.isArray(raw)) return []
  const out: HeadSession[] = []
  for (const row of raw.slice(0, 6)) {
    if (!row || typeof row !== 'object') continue
    const head = clip((row as { head?: unknown }).head, 80)
    if (!head) continue
    const laser = findCatalogLaser(catalog, head)
    const maxPorts = Number.isFinite(laser?.slots) ? Number(laser?.slots) : 4
    const modulesRaw = (row as { modules?: unknown }).modules
    const modules = Array.isArray(modulesRaw)
      ? modulesRaw.map((name) => clip(name, 80)).filter(Boolean).slice(0, Math.max(0, maxPorts))
      : []
    out.push({
      head: laser?.displayName ?? head,
      modules,
      slots: Number.isFinite(laser?.slots) ? Number(laser?.slots) : null,
      size: Number.isFinite(laser?.size) ? Number(laser?.size) : null,
    })
  }
  return out
}

function parseGadgets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((name) => clip(name, 80)).filter(Boolean).slice(0, 2)
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
    const keySha256 = await sha256Hex(apiKey)
    const catalogNames = collectCatalogNames(catalog)

    const consumeAsk = async (): Promise<
      { ok: true; usage: UsageSnapshot | null } | { ok: false; response: Response }
    > => {
      const { data: rate, error: rateError } = await admin.rpc('ai_chat_try_consume', {
        p_user_id: user.id,
        p_feature: RATE_FEATURE,
      })
      if (rateError) {
        console.error('advisor rate rpc failed')
        return {
          ok: false,
          response: json(500, { error: 'Advisor is temporarily unavailable.' }),
        }
      }
      const usage = usageFromRate(rate)
      const allowed = (rate as { allowed?: boolean } | null)?.allowed
      await recordAiChatEvent(admin, {
        userId: user.id,
        feature: RATE_FEATURE,
        keySha256,
        event: 'invoke',
      })
      if (!allowed) {
        await recordAiChatEvent(admin, {
          userId: user.id,
          feature: RATE_FEATURE,
          keySha256,
          event: 'blocked',
        })
        const retry = Number((rate as { retry_after_sec?: unknown } | null)?.retry_after_sec)
        return {
          ok: false,
          response: json(429, {
            error: `Slow down — Advisor is limited to ${usage?.max ?? 20} questions per hour.`,
            retryAfterSec: Number.isFinite(retry) ? retry : 3600,
            usage,
          }),
        }
      }
      await recordAiChatEvent(admin, {
        userId: user.id,
        feature: RATE_FEATURE,
        keySha256,
        event: 'asked',
      })
      return { ok: true, usage }
    }

    if (isCrossoverTableProbe(question)) {
      const consumed = await consumeAsk()
      if (!consumed.ok) return consumed.response
      return json(200, {
        advice: formatScopeRefusalReply(),
        usage: consumed.usage,
      })
    }

    const crossover = shouldDenyCrossover(question, catalogNames)
    if (crossover.action === 'deny') {
      return json(200, { advice: formatCrossoverDeny(crossover.hit.entry.retort) })
    }

    const consumed = await consumeAsk()
    if (!consumed.ok) return consumed.response
    const usage = consumed.usage

    const useScannedInfo = body.useScannedInfo === true
    const scan = useScannedInfo ? parseScan(body.scan) : null
    const oreName = clip(body.oreName, 80)
    const planningMode = !useScannedInfo || !scan
    const oreRow = oreName ? matchOre(catalog, oreName) : null
    const loadout = parseLoadout(body.loadout, catalog)
    const gadgetsInUse = parseGadgets(body.gadgetsInUse)

    // Only the gear actually being asked about (or, for "where do I buy these", the gear
    // they already run) reaches the prompt — the full index would swamp it.
    const gearShops = loadGearShops()
    const equippedGear = [
      ...loadout.flatMap((head) => [head.head, ...head.modules]),
      ...gadgetsInUse,
    ]
    const gearShopBlock = gearShops
      ? renderGearShopBlock(gearShops, resolveGearShopMatches(gearShops, question, equippedGear))
      : ''

    const systemPrompt = buildSystemPrompt({
      catalog,
      planningMode,
      oreName,
      oreRow,
      vesselDisplayName: clip(body.vesselDisplayName, 40),
      loadout,
      gadgetsInUse,
      scan,
      gearShopBlock,
      closer: crossover.hit ? crossover.hit.entry.retort : undefined,
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
    const generated = await generateAdvice(apiKey, payload)
    if (!generated.ok) {
      await recordAiChatEvent(admin, {
        userId: user.id,
        feature: RATE_FEATURE,
        keySha256,
        event: 'gemini_fail',
      })
      return json(generated.status === 429 ? 429 : 502, {
        error: memberSafeGeminiError(generated.status),
        usage,
      })
    }

    await recordAiChatEvent(admin, {
      userId: user.id,
      feature: RATE_FEATURE,
      keySha256,
      event: 'gemini_ok',
    })
    return json(200, { advice: generated.advice, usage })
  } catch (error) {
    console.error('advisor failed', error instanceof Error ? error.name : 'error')
    return json(500, { error: 'Advisor is temporarily unavailable.' })
  }
})
