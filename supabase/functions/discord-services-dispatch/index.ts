// Fan-out service_request deliveries: actionable Accept posts or informative tip+image.
// After successful informative posts, purge DB + storage screenshot.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildAcceptMessagePayload,
  buildTipMessagePayload,
  discordBotPostMessage,
  jsonResponse,
  resolveWebhookChannel,
} from '../_shared/discordServicesBot.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST required' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const botToken = Deno.env.get('DISCORD_SERVICES_BOT_TOKEN') || ''
    const admin = createClient(supabaseUrl, supabaseServiceKey)

    if (!botToken) {
      return new Response(JSON.stringify({ error: 'DISCORD_SERVICES_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = token.length > 0 && token === supabaseServiceKey
    let callerId: string | null = null

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
        error: authError,
      } = await userClient.auth.getUser()
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      callerId = user.id
    }

    const body = await req.json().catch(() => ({}))
    const requestId = String(body.request_id || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return new Response(JSON.stringify({ error: 'request_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: claimed, error: claimError } = await admin.rpc('claim_service_request_deliveries', {
      p_request_id: requestId,
    })

    if (claimError || !claimed?.success) {
      return new Response(
        JSON.stringify({ error: claimError?.message || claimed?.error || 'Claim failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (callerId && String(claimed.requester_id || '') !== callerId) {
      return new Response(JSON.stringify({ error: 'Not your request' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceKind = String(claimed.service_kind || 'actionable')
    const isInformative = serviceKind === 'informative'
    const serviceLabel = String(claimed.service_label || 'Service')
    const requesterRsi = String(claimed.requester_rsi || 'Requester')
    const details = String(claimed.details || '')
    const screenshotPath = claimed.screenshot_path ? String(claimed.screenshot_path) : ''

    if (isInformative && !screenshotPath) {
      return new Response(
        JSON.stringify({ error: 'Screenshot required for informative tips' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let fileBytes: Uint8Array | null = null
    let fileName = 'screenshot.png'
    let contentType = 'image/png'

    if (isInformative && screenshotPath) {
      const { data: blob, error: dlError } = await admin.storage
        .from('service-request-screenshots')
        .download(screenshotPath)
      if (dlError || !blob) {
        return new Response(
          JSON.stringify({ error: dlError?.message || 'Failed to load screenshot' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      fileBytes = new Uint8Array(await blob.arrayBuffer())
      if (fileBytes.byteLength > 8 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: 'Screenshot too large (max 8 MB)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const lower = screenshotPath.toLowerCase()
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        fileName = 'starmap.jpg'
        contentType = 'image/jpeg'
      } else if (lower.endsWith('.webp')) {
        fileName = 'starmap.webp'
        contentType = 'image/webp'
      }
    }

    const deliveries = (claimed.deliveries as Array<Record<string, string>>) || []
    const posted: Array<{
      delivery_id: string
      channel_id: string
      message_id: string
      org_name: string
    }> = []
    const errors: string[] = []

    for (const d of deliveries) {
      const deliveryId = String(d.delivery_id || '')
      const webhookUrl = String(d.discord_webhook_url || '')
      const orgName = String(d.org_name || 'Partner')
      const pricingLabel = String(d.pricing_label || 'FREE')

      if (!deliveryId || !webhookUrl) {
        errors.push(`${orgName}: missing delivery data`)
        continue
      }

      const resolved = await resolveWebhookChannel(webhookUrl)
      if ('error' in resolved) {
        errors.push(`${orgName}: ${resolved.error}`)
        await admin.rpc('complete_service_request_delivery', {
          p_delivery_id: deliveryId,
          p_ok: false,
          p_error: resolved.error,
        })
        continue
      }

      const payload = isInformative
        ? buildTipMessagePayload({
            serviceLabel,
            requesterLabel: requesterRsi,
            details,
            orgName,
            pricingLabel,
          })
        : buildAcceptMessagePayload({
            requestId,
            serviceLabel,
            requesterLabel: requesterRsi,
            pricingLabel,
            orgName,
            details,
            footerNote: "Dumper's Repo · Partnership · Accept commits to listed pricing · 30 min",
          })

      const res = await discordBotPostMessage(
        resolved.channel_id,
        botToken,
        payload,
        fileBytes
          ? { bytes: fileBytes, filename: fileName, contentType }
          : undefined
      )
      const msg = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errText = msg.message || `Discord ${res.status}`
        errors.push(`${orgName}: ${errText}`)
        await admin.rpc('complete_service_request_delivery', {
          p_delivery_id: deliveryId,
          p_ok: false,
          p_error: errText,
        })
        continue
      }

      const messageId = String(msg.id || '')
      if (!messageId) {
        errors.push(`${orgName}: no message id`)
        await admin.rpc('complete_service_request_delivery', {
          p_delivery_id: deliveryId,
          p_ok: false,
          p_error: 'No message id',
        })
        continue
      }

      await admin.rpc('complete_service_request_delivery', {
        p_delivery_id: deliveryId,
        p_ok: true,
        p_channel_id: resolved.channel_id,
        p_message_id: messageId,
        p_guild_id: resolved.guild_id,
      })

      posted.push({
        delivery_id: deliveryId,
        channel_id: resolved.channel_id,
        message_id: messageId,
        org_name: orgName,
      })
    }

    // Informative: purge DB + storage after any successful Discord post
    if (isInformative && posted.length > 0) {
      const { data: purged } = await admin.rpc('purge_service_request', {
        p_request_id: requestId,
      })
      const path = purged?.screenshot_path || screenshotPath
      if (path) {
        await admin.storage.from('service-request-screenshots').remove([path])
      }
    }

    return new Response(
      JSON.stringify({
        success: posted.length > 0,
        request_id: requestId,
        service_kind: serviceKind,
        posted_count: posted.length,
        posted,
        purged: isInformative && posted.length > 0,
        errors: errors.length ? errors : undefined,
      }),
      {
        status: posted.length > 0 ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
