// Live UEX stock check for Smart Hauler and the UEX Lookup commodity rows. Answers only
// whether a commodity can be bought or sold at a terminal right now, how much, the UEX
// status and the report date. Prices and terminal lists stay baked in the site.
// Open to guests: it returns public UEX data, and the 10-minute cache keeps UEX at one
// fetch per instance however many visitors call it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UEX_URL = 'https://api.uexcorp.uk/2.0/commodities_prices_all'
const CACHE_MS = 10 * 60 * 1000
/** A route only trusts a report from the last 7 days. */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000
const MAX_COMMODITIES = 200
const STATUS_OUT_OF_STOCK = 1
const STATUS_FULL = 7

type Side = { available: boolean; scu: number | null; status: number; verifiedAt: number }
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
  const verifiedAt = Number(price.date_modified) * 1000
  if (!Number.isFinite(verifiedAt) || verifiedAt > now + 60_000 || now - verifiedAt > FRESH_MS) return null
  const buyStatus = Number(price.status_buy) || 0
  const sellStatus = Number(price.status_sell) || 0
  const buy: Side | null = (Number(price.price_buy) || 0) > 0 && buyStatus > 0
    ? { available: buyStatus !== STATUS_OUT_OF_STOCK, scu: positive(price.scu_buy), status: buyStatus, verifiedAt }
    : null
  const sell: Side | null = (Number(price.price_sell) || 0) > 0 && sellStatus > 0
    ? { available: sellStatus !== STATUS_FULL, scu: positive(price.scu_sell), status: sellStatus, verifiedAt }
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

  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  try {
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
