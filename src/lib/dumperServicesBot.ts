import { supabase } from './supabase'

export type PostBotTestResult = {
  success: boolean
  request_id?: string
  posted_count?: number
  posted?: Array<{ channel_id: string; message_id: string }>
  errors?: string[]
  next?: string
  error?: string
}

/** Super-admin: post Accept-button test messages via Partnership bot. */
export async function postDumperServicesBotTest(opts: {
  channelId: string
  copyCount?: number
  serviceLabel?: string
  requesterLabel?: string
}): Promise<PostBotTestResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not signed in' }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-services-post-test`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel_id: opts.channelId.trim(),
        copy_count: opts.copyCount ?? 2,
        service_label: opts.serviceLabel || 'Medical',
        requester_label: opts.requesterLabel || 'sinedrone_sentinel',
      }),
    }
  )

  const result = (await response.json().catch(() => ({}))) as PostBotTestResult
  if (!response.ok) {
    return { success: false, error: result.error || `HTTP ${response.status}` }
  }
  return result
}
