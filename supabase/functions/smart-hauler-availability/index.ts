// Smart Hauler live stock check. Answers only whether a commodity can be bought or sold
// at a terminal right now, and how much. Prices and terminal lists stay baked in the site.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UEX_URL = 'https://api.uexcorp.uk/2.0/commodities_prices_all'
const CACHE_MS = 10 * 60 * 1000
/** Only a report from the last day says anything about stock right now. */
const FRESH_MS = 24 * 60 * 60 * 1000
const MAX_COMMODITIES = 200
const STATUS_OUT_OF_STOCK = 1
const STATUS_FULL = 7

type Side = { available: boolean; scu: number | null }
type Row = { commodityId: number; terminalId: number; buy: Side | null; sell: Side | null }

type UexPrice = {
  id_commodity?: number
  id_terminal?: number
  price_buy?: number
  price_sell?: number
  status_buy?: number | null
  status_sell?: number | null
  scu_buy?: number | null
  scu_sell?: number | null
  date_modified?: number | null
}

let cache: { at: number; rows: Row[] } | null = null

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function positive(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function toRow(price: UexPrice, now: number): Row | null {
  const commodityId = Number(price.id_commodity)
  const terminalId = Number(price.id_terminal)
  if (!Number.isFinite(commodityId) || !Number.isFinite(terminalId)) return null
  const modified = Number(price.date_modified) * 1000
  if (!Number.isFinite(modified) || now - modified > FRESH_MS) return null
  const buyStatus = Number(price.status_buy) || 0
  const sellStatus = Number(price.status_sell) || 0
  const buy: Side | null = (Number(price.price_buy) || 0) > 0 && buyStatus > 0
    ? { available: buyStatus !== STATUS_OUT_OF_STOCK, scu: positive(price.scu_buy) }
    : null
  const sell: Side | null = (Number(price.price_sell) || 0) > 0 && sellStatus > 0
    ? { available: sellStatus !== STATUS_FULL, scu: positive(price.scu_sell) }
    : null
  if (!buy && !sell) return null
  return { commodityId, terminalId, buy, sell }
}

async function loadRows(): Promise<Row[]> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) return cache.rows
  const res = await fetch(UEX_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'DumpersRepo-SmartHauler' },
  })
  if (!res.ok) throw new Error(`uex_${res.status}`)
  const payload = (await res.json()) as { data?: UexPrice[] }
  const rows = (payload.data ?? []).map((price) => toRow(price, now)).filter((row): row is Row => row !== null)
  cache = { at: now, rows }
  return rows
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'Sign in to use Smart Hauler.' })

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json(401, { error: 'Sign in to use Smart Hauler.' })

    const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (profile as { role?: string } | null)?.role
    if (!role || role === 'pending') return json(403, { error: 'Smart Hauler is for approved members.' })

    const body = (await req.json().catch(() => ({}))) as { commodityIds?: unknown }
    const wanted = Array.isArray(body.commodityIds)
      ? new Set(
        body.commodityIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
          .slice(0, MAX_COMMODITIES),
      )
      : null

    const rows = await loadRows()
    return json(200, { rows: wanted?.size ? rows.filter((row) => wanted.has(row.commodityId)) : rows })
  } catch (error) {
    console.error('smart-hauler-availability', error instanceof Error ? error.message : error)
    return json(502, { error: 'Live stock could not be checked.' })
  }
})
