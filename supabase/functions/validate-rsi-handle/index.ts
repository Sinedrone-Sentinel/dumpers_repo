// Supabase Edge Function: validate-rsi-handle
// Verifies RSI handle ownership via public citizen bio challenge code.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RSI_CITIZEN_URL = 'https://robertsspaceindustries.com/en/citizens/'

/** Extract public bio text from RSI citizen HTML (`div.entry.bio > div.value`). */
function extractRsiBio(pageHtml: string): string {
  const match = pageHtml.match(
    /<div class="entry bio">[\s\S]*?<div class="value">\s*([\s\S]*?)\s*<\/div>/i
  )
  if (!match) return ''
  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function bioContainsCode(bio: string, code: string): boolean {
  if (!bio || !code) return false
  return bio.toUpperCase().includes(code.toUpperCase())
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { handle } = await req.json()
    if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'RSI Handle is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanHandle = handle.trim()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Already verified for this handle — no bio re-check required.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('rsi_handle, rsi_handle_verified')
      .eq('id', user.id)
      .maybeSingle()

    if (
      existingProfile?.rsi_handle_verified &&
      existingProfile.rsi_handle &&
      existingProfile.rsi_handle.toLowerCase() === cleanHandle.toLowerCase()
    ) {
      return new Response(
        JSON.stringify({ valid: true, verified: true, handle: cleanHandle, alreadyVerified: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: availableData, error: availableError } = await supabase.rpc('is_rsi_handle_available', {
      p_handle: cleanHandle,
      p_user_id: user.id,
    })

    if (availableError) {
      console.error('Error checking handle availability:', availableError)
      return new Response(
        JSON.stringify({ error: 'Failed to check handle availability' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!availableData) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'This RSI Handle is already verified by another user',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: challenge, error: challengeError } = await supabase.rpc(
      'service_get_rsi_verify_challenge',
      { p_user_id: user.id }
    )

    if (challengeError) {
      console.error('Challenge lookup failed:', challengeError)
      return new Response(
        JSON.stringify({ error: 'Failed to load verification challenge' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!challenge?.success) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: challenge?.error || 'Request a verification code first',
          needsChallenge: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (String(challenge.handle).toLowerCase() !== cleanHandle.toLowerCase()) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Your active code is for handle "${challenge.handle}". Get a new code for "${cleanHandle}", or verify that handle.`,
          needsChallenge: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const challengeCode = String(challenge.code || '')

    console.log(`Validating RSI handle with bio challenge: ${cleanHandle}`)
    const rsiUrl = `${RSI_CITIZEN_URL}${encodeURIComponent(cleanHandle)}`

    const rsiResponse = await fetch(rsiUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    })

    if (rsiResponse.status === 404) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'RSI Handle not found on robertsspaceindustries.com',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!rsiResponse.ok) {
      console.error(`RSI website returned status: ${rsiResponse.status}`)
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Unable to verify handle (RSI returned ${rsiResponse.status}). Try again shortly, or contact an officer if this persists.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const pageContent = await rsiResponse.text()

    const isValidProfile =
      pageContent.includes('CITIZEN DOSSIER') ||
      pageContent.includes('UEE Citizen Record') ||
      pageContent.includes('Handle name')

    const isNotFound =
      pageContent.includes('Citizen not found') ||
      (pageContent.includes('Page not found') && !isValidProfile)

    if (isNotFound || !isValidProfile) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'RSI Handle not found on robertsspaceindustries.com',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const bio = extractRsiBio(pageContent)
    if (!bioContainsCode(bio, challengeCode)) {
      // Fallback: code anywhere on page (some layout variants) but prefer bio.
      const pageHasCode = pageContent.toUpperCase().includes(challengeCode.toUpperCase())
      if (!pageHasCode) {
        return new Response(
          JSON.stringify({
            valid: false,
            error:
              `Verification code ${challengeCode} not found in your public RSI bio. Paste the code into your citizen Bio on robertsspaceindustries.com, save, wait a few seconds, then try Verify again.`,
            needsChallenge: false,
            challengeCode,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const { data: rpcData, error: updateError } = await supabase.rpc('mark_rsi_handle_verified', {
      p_user_id: user.id,
      p_handle: cleanHandle,
    })

    if (updateError) {
      console.error('RPC Error marking handle as verified:', JSON.stringify(updateError))
      return new Response(
        JSON.stringify({
          valid: true,
          verified: false,
          error: `Handle is valid but failed to save: ${updateError.message || updateError.code || 'Unknown RPC error'}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (rpcData && rpcData.success === false) {
      console.error('RPC returned failure:', rpcData.error)
      return new Response(
        JSON.stringify({
          valid: true,
          verified: false,
          error: rpcData.error || 'Verification rejected by database',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await supabase.rpc('service_clear_rsi_verify_challenge', { p_user_id: user.id })

    return new Response(
      JSON.stringify({
        valid: true,
        verified: true,
        handle: cleanHandle,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Validation error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
