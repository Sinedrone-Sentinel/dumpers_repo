// Supabase Edge Function: sync-shop-data
// Fetches shop data from scunpacked GitHub and updates Supabase tables

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SCUNPACKED_SHOPS_URL = 'https://raw.githubusercontent.com/richardthombs/scunpacked/master/api/dist/json/shops.json'

// Types matching scunpacked shops.json structure
interface ShopInventoryItem {
  name: string
  displayName?: string
  basePrice: number
  basePriceOffsetPercentage?: number
  maxDiscountPercentage?: number
  maxPremiumPercentage?: number
  shopBuysThis: boolean
  shopSellsThis: boolean
  shopRentThis: boolean
  filename?: string
  type?: string
  subType?: string
  tags?: string[]
  item_reference?: string
  node_reference?: string
}

interface ShopData {
  name: string
  containerPath: string
  acceptsStolenGoods: boolean
  profitMargin: number
  reference: string
  inventory: ShopInventoryItem[]
}

// Location parsing from containerPath patterns
function parseLocation(shopName: string, containerPath: string): { system: string; location: string; locationType: string } {
  let system = 'Stanton'
  let location = ''
  let locationType = 'unknown'

  // Parse from shop name first (e.g., "Aparelli, New Babbage")
  if (shopName.includes(',')) {
    const parts = shopName.split(',').map(p => p.trim())
    if (parts.length >= 2) {
      location = parts[parts.length - 1]
    }
  }

  // Parse system and location type from containerPath
  const pathLower = containerPath.toLowerCase()

  // System detection
  if (pathLower.includes('pyro') || pathLower.includes('ruin_station')) {
    system = 'Pyro'
  }

  // Location type detection
  if (pathLower.includes('reststop') || pathLower.includes('rest_stop') || /_l\d/.test(pathLower)) {
    locationType = 'rest_stop'
  } else if (pathLower.includes('refiner')) {
    locationType = 'refinery'
  } else if (pathLower.includes('orbital') || pathLower.includes('_leo')) {
    locationType = 'orbital'
  } else if (pathLower.includes('prison') || pathLower.includes('klescher')) {
    locationType = 'prison'
  } else if (pathLower.includes('dealership')) {
    locationType = 'dealership'
  } else if (
    pathLower.includes('area18') ||
    pathLower.includes('lorville') ||
    pathLower.includes('newbabbage') ||
    pathLower.includes('orison') ||
    pathLower.includes('levski') ||
    pathLower.includes('grimhex')
  ) {
    locationType = 'city'
  }

  // Detailed location from containerPath patterns
  if (!location) {
    // Stanton rest stops: Stanton1_L1 = HUR-L1, etc.
    const restStopMatch = containerPath.match(/Stanton(\d)_L(\d)/i)
    if (restStopMatch) {
      const planetNum = restStopMatch[1]
      const lagrangeNum = restStopMatch[2]
      const planetCodes: Record<string, string> = { '1': 'HUR', '2': 'CRU', '3': 'ARC', '4': 'MIC' }
      location = `${planetCodes[planetNum] || 'UNK'}-L${lagrangeNum}`
    }

    // LEO stations: Stanton4_LEO1 = MIC-L1 orbital
    const leoMatch = containerPath.match(/Stanton(\d)_LEO(\d)/i)
    if (leoMatch) {
      const planetNum = leoMatch[1]
      const orbitNum = leoMatch[2]
      const planetCodes: Record<string, string> = { '1': 'HUR', '2': 'CRU', '3': 'ARC', '4': 'MIC' }
      location = `${planetCodes[planetNum] || 'UNK'} Orbit ${orbitNum}`
    }

    // Cities
    if (pathLower.includes('area18')) location = 'Area18'
    else if (pathLower.includes('lorville')) location = 'Lorville'
    else if (pathLower.includes('newbabbage') || pathLower.includes('new_babbage')) location = 'New Babbage'
    else if (pathLower.includes('orison')) location = 'Orison'
    else if (pathLower.includes('levski')) location = 'Levski'
    else if (pathLower.includes('grimhex') || pathLower.includes('grim_hex')) location = 'GrimHEX'
    else if (pathLower.includes('porto') || pathLower.includes('port_o')) location = 'Port Olisar'
    else if (pathLower.includes('everus')) location = 'Everus Harbor'
    else if (pathLower.includes('baijini')) location = 'Baijini Point'
    else if (pathLower.includes('seraphim')) location = 'Seraphim Station'
  }

  return { system, location: location || 'Unknown', locationType }
}

// Calculate effective price including margins
function calculateEffectivePrice(item: ShopInventoryItem, shopProfitMargin: number): number {
  const base = item.basePrice || 0
  const offsetPct = item.basePriceOffsetPercentage || 0
  
  // Price = basePrice * (1 + offset%) * (1 + shopMargin%)
  const withOffset = base * (1 + offsetPct / 100)
  const withMargin = withOffset * (1 + shopProfitMargin / 100)
  
  return Math.round(withMargin)
}

// Component types we want to track for price summaries
const COMPONENT_TYPES = new Set([
  'QuantumDrive',
  'PowerPlant',
  'Shield',
  'Cooler',
  'MissileRack',
  'WeaponGun',
  'Turret',
  'Radar',
  'EMP',
  'MiningLaser',
  'QIGDampener',
  'QuantumInterdictionGenerator',
  'Missile',
  'Torpedo',
  'WeaponMining',
  'TractorBeam',
  'UtilityTurret',
  'SelfDestruct',
  'Ping',
  'FlightController',
  'FuelIntake',
  'FuelTank',
  'Container',
  'Turret_Gun',
  'TurretBase',
  'WheeledController',
])

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

    // Create Supabase clients
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
      .from('shop_data_sync_status')
      .update({ sync_status: 'syncing', sync_error: null, updated_at: new Date().toISOString() })
      .eq('id', 1)

    console.log('Fetching shops.json from scunpacked...')

    // Fetch shops.json (~12MB)
    const response = await fetch(SCUNPACKED_SHOPS_URL, {
      headers: { 'User-Agent': 'DumpersRepo-Sync' }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch shops.json: ${response.status}`)
    }

    const shops: ShopData[] = await response.json()
    console.log(`Fetched ${shops.length} shops`)

    // Get scunpacked version from GitHub API
    let version = 'unknown'
    try {
      const commitRes = await fetch('https://api.github.com/repos/richardthombs/scunpacked/commits/master', {
        headers: { 'User-Agent': 'DumpersRepo-Sync' }
      })
      if (commitRes.ok) {
        const commitData = await commitRes.json()
        version = `commit-${commitData.sha?.substring(0, 7) || 'unknown'}`
      }
    } catch (e) {
      console.log('Could not fetch version info:', e)
    }

    // Clear existing data
    console.log('Clearing existing shop data...')
    await supabase.from('shop_inventory').delete().neq('id', 0)
    await supabase.from('shops').delete().neq('id', 0)
    await supabase.from('component_price_summary').delete().neq('id', 0)

    // Process shops and inventory
    let totalInventoryCount = 0
    const componentPrices: Map<string, { type: string; prices: number[] }> = new Map()

    for (const shop of shops) {
      const { system, location, locationType } = parseLocation(shop.name, shop.containerPath)

      // Insert shop
      const { data: insertedShop, error: shopError } = await supabase
        .from('shops')
        .insert({
          shop_reference: shop.reference,
          name: shop.name,
          container_path: shop.containerPath,
          system,
          location,
          location_type: locationType,
          accepts_stolen_goods: shop.acceptsStolenGoods,
          profit_margin: shop.profitMargin,
        })
        .select('id')
        .single()

      if (shopError || !insertedShop) {
        console.error(`Failed to insert shop ${shop.name}:`, shopError)
        continue
      }

      const shopId = insertedShop.id

      // Process inventory in batches
      if (shop.inventory && shop.inventory.length > 0) {
        const inventoryRows = shop.inventory.map((item) => {
          const effectivePrice = calculateEffectivePrice(item, shop.profitMargin)

          // Track component prices for summary
          if (item.type && COMPONENT_TYPES.has(item.type) && item.shopSellsThis && item.displayName) {
            const existing = componentPrices.get(item.displayName)
            if (existing) {
              existing.prices.push(effectivePrice)
            } else {
              componentPrices.set(item.displayName, { type: item.type, prices: [effectivePrice] })
            }
          }

          return {
            shop_id: shopId,
            item_name: item.name,
            display_name: item.displayName || item.name,
            item_type: item.type || null,
            sub_type: item.subType || null,
            base_price: item.basePrice,
            effective_price: effectivePrice,
            base_price_offset_pct: item.basePriceOffsetPercentage || 0,
            shop_buys: item.shopBuysThis,
            shop_sells: item.shopSellsThis,
            shop_rents: item.shopRentThis,
            item_reference: item.item_reference || null,
            tags: item.tags || null,
          }
        })

        // Insert in batches of 500
        const batchSize = 500
        for (let i = 0; i < inventoryRows.length; i += batchSize) {
          const batch = inventoryRows.slice(i, i + batchSize)
          const { error: invError } = await supabase.from('shop_inventory').insert(batch)
          if (invError) {
            console.error(`Failed to insert inventory batch for ${shop.name}:`, invError)
          }
        }

        totalInventoryCount += inventoryRows.length
      }
    }

    console.log(`Inserted ${shops.length} shops and ${totalInventoryCount} inventory items`)

    // Insert component price summaries
    console.log(`Computing price summaries for ${componentPrices.size} components...`)
    const priceSummaries = Array.from(componentPrices.entries()).map(([name, data]) => {
      const prices = data.prices.sort((a, b) => a - b)
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      return {
        component_name: name,
        component_type: data.type,
        avg_price: avg,
        min_price: prices[0],
        max_price: prices[prices.length - 1],
        shop_count: prices.length,
      }
    })

    if (priceSummaries.length > 0) {
      const batchSize = 200
      for (let i = 0; i < priceSummaries.length; i += batchSize) {
        const batch = priceSummaries.slice(i, i + batchSize)
        await supabase.from('component_price_summary').insert(batch)
      }
    }

    // Update sync status to success
    await supabase
      .from('shop_data_sync_status')
      .update({
        sync_status: 'success',
        last_synced_at: new Date().toISOString(),
        source_url: SCUNPACKED_SHOPS_URL,
        source_version: version,
        shop_count: shops.length,
        inventory_count: totalInventoryCount,
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)

    return new Response(
      JSON.stringify({
        success: true,
        version,
        counts: {
          shops: shops.length,
          inventory: totalInventoryCount,
          componentPriceSummaries: priceSummaries.length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync error:', error)

    // Update sync status to error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      await supabase
        .from('shop_data_sync_status')
        .update({
          sync_status: 'error',
          sync_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
    } catch (_) {
      // Ignore error update failure
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
