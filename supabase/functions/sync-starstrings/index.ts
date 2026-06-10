// Supabase Edge Function: sync-starstrings
// Fetches latest StarStrings data from GitHub and updates Supabase tables

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as pako from 'https://esm.sh/pako@2.1.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// GitHub repo info for StarStrings
const GITHUB_OWNER = 'MrKraken'
const GITHUB_REPO = 'StarStrings'

interface MiningOre {
  ore_name: string
  rarity: string
  locations: string[]
}

interface Component {
  internal_id: string
  display_name: string
  component_type: string
  type_code: string
  manufacturer: string
  manufacturer_code: string
  size: number
  class: string
  class_code: string
  grade: string
  grade_rank: number
  full_label: string
}

interface Ordnance {
  internal_id: string
  display_name: string
  guidance: string
  guidance_code: string
  size: number
  is_gimbal: boolean
  is_torpedo: boolean
  ordnance_type: string
  manufacturer: string
  full_label: string
}

interface BlueprintPool {
  contract_key: string
  blueprints: string[]
  standing_tier: string
}

// Manufacturer code mappings
const manufacturerCodes: Record<string, string> = {
  'AEGS': 'Aegis Dynamics',
  'ACOM': 'ArcCorp',
  'AMRS': 'Amon & Reese',
  'ARCC': 'Arc Corp',
  'ASAS': 'Ascension Astro',
  'BANU': 'Banu',
  'BASL': 'Basilisk',
  'BEHR': 'Behring',
  'BLTR': 'Blighter',
  'BRRA': 'Brentworth',
  'CHCO': 'Chimera Communications',
  'FSIN': 'Flash Industries',
  'GODI': 'Gorgon Defender Industries',
  'GRNP': 'Groupe Nouveau Paris',
  'JSPN': 'Juno Starwerk',
  'JUST': 'Juno',
  'LPLT': 'Lightning Power Ltd',
  'MITE': 'Mite',
  'NAVE': 'Nav-E7',
  'NOVP': 'Nova',
  'RACO': 'Railen Corp',
  'RSI': 'Roberts Space Industries',
  'SADA': 'Sakura Sun',
  'SASU': 'Sakura Sun',
  'SECO': 'Seal Corp',
  'TARS': 'Tarsus',
  'THCN': 'Thermacorp',
  'TYDT': 'Tyler Design & Tech',
  'WCPR': 'Wen/Cassel Propulsion',
  'WETK': 'Wei-Tek',
  'WLOP': 'Wolover',
  'YORM': 'Yormandi'
}

const typeCodes: Record<string, string> = {
  'COOL': 'Cooler',
  'POWR': 'Power Plant',
  'QDRV': 'Quantum Drive',
  'QDMP': 'Quantum Dampener',
  'QED': 'Quantum Enforcement Device',
  'SHLD': 'Shield Generator',
  'LIFE': 'Life Support',
  'RADR': 'Radar',
  'COMP': 'Computer',
  'JUMP': 'Jump Drive',
  'SECO': 'Shield'
}

const classCodes: Record<string, string> = {
  'Mil': 'Military',
  'Civ': 'Civilian',
  'Ind': 'Industrial',
  'Cmp': 'Competition',
  'Sth': 'Stealth'
}

const guidanceCodes: Record<string, string> = {
  'CS': 'Cross-Section',
  'EM': 'Electromagnetic',
  'IR': 'Infrared'
}

const gradeOrder = ['A', 'B', 'C', 'D']

// Parse mining.ini content
function parseMiningData(content: string): MiningOre[] {
  const ores: MiningOre[] = []
  
  const journalMatch = content.match(/Journal_General_Mining_Compendium_Content=(.+)/)
  if (!journalMatch) return ores

  const journalContent = journalMatch[1].replace(/\\n/g, '\n')
  
  let currentRarity: string | null = null
  const lines = journalContent.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    if (trimmed.includes('** Legendary **')) currentRarity = 'legendary'
    else if (trimmed.includes('** Epic **')) currentRarity = 'epic'
    else if (trimmed.includes('** Rare **')) currentRarity = 'rare'
    else if (trimmed.includes('** Uncommon **')) currentRarity = 'uncommon'
    else if (trimmed.includes('** Common **')) currentRarity = 'common'
    else if (trimmed.includes('** Hand Mineables **')) currentRarity = 'handMineable'
    else if (currentRarity && trimmed.includes(' - ')) {
      const [orePart, locationsPart] = trimmed.split(' - ')
      if (orePart && locationsPart) {
        ores.push({
          ore_name: orePart.trim(),
          rarity: currentRarity,
          locations: locationsPart.split(',').map(l => l.trim()).filter(Boolean)
        })
      }
    }
  }
  
  return ores
}

// Parse components.ini content
function parseComponentsData(content: string): Component[] {
  const components: Component[] = []
  const lines = content.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const match = line.match(/^item_Name[_]?([A-Z]+)_([A-Z]+)_S(\d+)_([^=]+)=(.+)$/)
    if (!match) continue

    const [, typeCode, mfrCode, sizeStr, internalName, displayValue] = match
    const displayMatch = displayValue.match(/^([A-Za-z]+)\/(\d+)\/([A-D])\s+(.+)$/)
    if (!displayMatch) continue

    const [, classCode, , grade, displayName] = displayMatch

    components.push({
      internal_id: `${typeCode}_${mfrCode}_S${sizeStr}_${internalName}`,
      display_name: displayName.trim(),
      component_type: typeCodes[typeCode] || typeCode,
      type_code: typeCode,
      manufacturer: manufacturerCodes[mfrCode] || mfrCode,
      manufacturer_code: mfrCode,
      size: parseInt(sizeStr),
      class: classCodes[classCode] || classCode,
      class_code: classCode,
      grade,
      grade_rank: gradeOrder.indexOf(grade) + 1,
      full_label: displayValue.trim()
    })
  }

  return components
}

// Parse ordnance.ini content
function parseOrdnanceData(content: string): Ordnance[] {
  const ordnance: Ordnance[] = []
  const lines = content.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const match = line.match(/^item_Name(G?)MISL_S(\d+)_([A-Z]+)_([A-Z]+)_([^=]+)=(.+)$/)
    if (!match) continue

    const [, isGimbal, sizeStr, guidanceCode, mfrCode, internalName, displayValue] = match
    const displayMatch = displayValue.match(/^\[([A-Z]+)(\d+)\]\s+(.+)$/)
    if (!displayMatch) continue

    const [, , , displayName] = displayMatch
    const isTorpedo = displayName.toLowerCase().includes('torpedo')

    ordnance.push({
      internal_id: `${isGimbal ? 'G' : ''}MISL_S${sizeStr}_${guidanceCode}_${mfrCode}_${internalName}`,
      display_name: displayName.trim(),
      guidance: guidanceCodes[guidanceCode] || guidanceCode,
      guidance_code: guidanceCode,
      size: parseInt(sizeStr),
      is_gimbal: isGimbal === 'G',
      is_torpedo: isTorpedo,
      ordnance_type: isTorpedo ? 'Torpedo' : 'Missile',
      manufacturer: mfrCode,
      full_label: displayValue.trim()
    })
  }

  return ordnance
}

// Parse contracts.ini for blueprint pools
function parseContractsData(content: string): BlueprintPool[] {
  const pools: BlueprintPool[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    if (!line.includes('=')) continue
    
    const [key, ...valueParts] = line.split('=')
    const value = valueParts.join('=').replace(/\\n/g, '\n')
    
    if (value.includes('Potential Blueprints') || value.includes('Blueprint Pool')) {
      let standingTier = 'unknown'
      const tierMatch = value.match(/Awarded from ([^<\n]+) level/i)
      if (tierMatch) {
        const tierRaw = tierMatch[1].toLowerCase().trim()
        if (tierRaw.includes('neutral')) standingTier = 'neutral'
        else if (tierRaw.includes('friendly')) standingTier = 'friendly'
        else if (tierRaw.includes('trusted')) standingTier = 'trusted'
        else if (tierRaw.includes('sr') || tierRaw.includes('senior')) standingTier = 'sr_contractor'
        else if (tierRaw.includes('jr') || tierRaw.includes('junior')) standingTier = 'jr_contractor'
        else if (tierRaw.includes('master')) standingTier = 'master'
      }

      const blueprints: string[] = []
      const bpMatches = value.matchAll(/^- ([^(\n]+?)(?:\s*\([^)]+\))?$/gm)
      for (const m of bpMatches) {
        let bp = m[1].trim().replace(/\\n.*$/s, '').trim()
        if (bp && bp.length > 2 && !bp.includes('<EM4>') && !bp.includes('Pool')) {
          blueprints.push(bp)
        }
      }

      if (blueprints.length > 0) {
        pools.push({
          contract_key: key,
          blueprints: [...new Set(blueprints)],
          standing_tier: standingTier
        })
      }
    }
  }

  return pools
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify super-admin authorization
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
      .from('starstrings_sync_meta')
      .update({ sync_status: 'syncing', sync_error: null, updated_at: new Date().toISOString() })
      .eq('id', 1)

    // Try to fetch latest release info from GitHub (for version tracking)
    let version = 'unknown'
    const releaseUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    try {
      const releaseRes = await fetch(releaseUrl, {
        headers: { 'User-Agent': 'DumpersRepo-Sync' }
      })
      if (releaseRes.ok) {
        const releaseData = await releaseRes.json()
        version = releaseData.name || releaseData.tag_name || 'unknown'
      } else {
        // No releases - try to get latest commit instead
        const commitUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/master`
        const commitRes = await fetch(commitUrl, {
          headers: { 'User-Agent': 'DumpersRepo-Sync' }
        })
        if (commitRes.ok) {
          const commitData = await commitRes.json()
          version = `commit-${commitData.sha?.substring(0, 7) || 'unknown'}`
        }
      }
    } catch (e) {
      console.log('Could not fetch version info:', e)
    }

    // Fetch raw files from master branch
    const rawBaseUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/master`

    // Fetch the INI files
    const [miningRes, componentsRes, ordnanceRes, contractsRes] = await Promise.all([
      fetch(`${rawBaseUrl}/mining.ini`),
      fetch(`${rawBaseUrl}/components.ini`),
      fetch(`${rawBaseUrl}/ordnance.ini`),
      fetch(`${rawBaseUrl}/contracts.ini`)
    ])

    const miningContent = await miningRes.text()
    const componentsContent = await componentsRes.text()
    const ordnanceContent = await ordnanceRes.text()
    const contractsContent = await contractsRes.text()

    // Parse the data
    const miningData = parseMiningData(miningContent)
    const componentsData = parseComponentsData(componentsContent)
    const ordnanceData = parseOrdnanceData(ordnanceContent)
    const blueprintPools = parseContractsData(contractsContent)

    // Build blueprint standings from pools
    const blueprintStandings: Record<string, { min_standing: string; contract_keys: string[] }> = {}
    for (const pool of blueprintPools) {
      for (const bp of pool.blueprints) {
        if (!blueprintStandings[bp]) {
          blueprintStandings[bp] = { min_standing: pool.standing_tier, contract_keys: [] }
        }
        blueprintStandings[bp].contract_keys.push(pool.contract_key)
      }
    }

    // Clear existing data and insert new (within transaction-like behavior)
    // Mining
    await supabase.from('starstrings_mining').delete().neq('id', 0)
    if (miningData.length > 0) {
      await supabase.from('starstrings_mining').insert(miningData)
    }

    // Components
    await supabase.from('starstrings_components').delete().neq('id', 0)
    if (componentsData.length > 0) {
      // Insert in batches to avoid size limits
      const batchSize = 100
      for (let i = 0; i < componentsData.length; i += batchSize) {
        await supabase.from('starstrings_components').insert(componentsData.slice(i, i + batchSize))
      }
    }

    // Ordnance
    await supabase.from('starstrings_ordnance').delete().neq('id', 0)
    if (ordnanceData.length > 0) {
      await supabase.from('starstrings_ordnance').insert(ordnanceData)
    }

    // Blueprint pools
    await supabase.from('starstrings_blueprint_pools').delete().neq('id', 0)
    if (blueprintPools.length > 0) {
      const batchSize = 50
      for (let i = 0; i < blueprintPools.length; i += batchSize) {
        await supabase.from('starstrings_blueprint_pools').insert(blueprintPools.slice(i, i + batchSize))
      }
    }

    // Blueprint standings
    await supabase.from('starstrings_blueprint_standings').delete().neq('id', 0)
    const standingsToInsert = Object.entries(blueprintStandings).map(([bp, data]) => ({
      blueprint_name: bp,
      min_standing: data.min_standing,
      contract_keys: data.contract_keys
    }))
    if (standingsToInsert.length > 0) {
      const batchSize = 100
      for (let i = 0; i < standingsToInsert.length; i += batchSize) {
        await supabase.from('starstrings_blueprint_standings').insert(standingsToInsert.slice(i, i + batchSize))
      }
    }

    // Update sync status to success
    await supabase
      .from('starstrings_sync_meta')
      .update({
        sync_status: 'success',
        last_synced_at: new Date().toISOString(),
        source_url: releaseUrl,
        source_version: version,
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)

    return new Response(
      JSON.stringify({
        success: true,
        version,
        counts: {
          mining: miningData.length,
          components: componentsData.length,
          ordnance: ordnanceData.length,
          blueprintPools: blueprintPools.length,
          blueprintStandings: standingsToInsert.length
        }
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
        .from('starstrings_sync_meta')
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
