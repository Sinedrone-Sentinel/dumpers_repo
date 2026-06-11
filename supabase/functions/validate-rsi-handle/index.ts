// Supabase Edge Function: validate-rsi-handle
// Validates an RSI handle by checking robertsspaceindustries.com

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RSI_CITIZEN_URL = 'https://robertsspaceindustries.com/en/citizens/'

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

    // Parse request body
    const { handle } = await req.json()
    if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'RSI Handle is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanHandle = handle.trim()

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authenticated user
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

    // Check if handle is available (not already verified by someone else)
    const { data: availableData, error: availableError } = await supabase.rpc('is_rsi_handle_available', {
      p_handle: cleanHandle,
      p_user_id: user.id
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
          error: 'This RSI Handle is already verified by another user' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check the RSI website for this handle
    console.log(`Validating RSI handle: ${cleanHandle}`)
    const rsiUrl = `${RSI_CITIZEN_URL}${encodeURIComponent(cleanHandle)}`
    
    const rsiResponse = await fetch(rsiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow'
    })

    // Helper to clear unverified RSI handle
    const clearUnverifiedHandle = async () => {
      await supabase
        .from('profiles')
        .update({ 
          rsi_handle: null, 
          rsi_handle_verified: false, 
          rsi_handle_verified_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .eq('rsi_handle_verified', false)
    }

    // Check if we got a valid profile page or 404
    if (rsiResponse.status === 404) {
      await clearUnverifiedHandle()
      return new Response(
        JSON.stringify({ 
          valid: false,
          cleared: true,
          error: 'RSI Handle not found on robertsspaceindustries.com' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!rsiResponse.ok) {
      console.error(`RSI website returned status: ${rsiResponse.status}`)
      await clearUnverifiedHandle()
      return new Response(
        JSON.stringify({ 
          valid: false,
          cleared: true, 
          error: `Unable to verify handle (RSI returned ${rsiResponse.status})` 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check the page content to make sure it's a real profile page
    const pageContent = await rsiResponse.text()
    
    // Look for indicators of a valid citizen page
    const isValidProfile = pageContent.includes('CITIZEN DOSSIER') || 
                          pageContent.includes('UEE Citizen Record') ||
                          pageContent.includes('Handle name')

    // Check for 404/not found indicators
    const isNotFound = pageContent.includes('404') || 
                       pageContent.includes('Page not found') ||
                       pageContent.includes('Citizen not found')

    if (isNotFound || !isValidProfile) {
      await clearUnverifiedHandle()
      return new Response(
        JSON.stringify({ 
          valid: false, 
          cleared: true,
          error: 'RSI Handle not found on robertsspaceindustries.com' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle is valid! Mark it as verified in the database
    console.log('Attempting to mark handle as verified:', { user_id: user.id, handle: cleanHandle })
    
    const { data: rpcData, error: updateError } = await supabase.rpc('mark_rsi_handle_verified', {
      p_user_id: user.id,
      p_handle: cleanHandle
    })

    console.log('RPC result:', { data: rpcData, error: updateError })

    if (updateError) {
      console.error('RPC Error marking handle as verified:', JSON.stringify(updateError))
      return new Response(
        JSON.stringify({ 
          valid: true, 
          verified: false,
          error: `Handle is valid but failed to save: ${updateError.message || updateError.code || 'Unknown RPC error'}`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if the RPC returned a success:false result
    if (rpcData && rpcData.success === false) {
      console.error('RPC returned failure:', rpcData.error)
      return new Response(
        JSON.stringify({ 
          valid: true, 
          verified: false,
          error: rpcData.error || 'Verification rejected by database'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        valid: true, 
        verified: true,
        handle: cleanHandle
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
