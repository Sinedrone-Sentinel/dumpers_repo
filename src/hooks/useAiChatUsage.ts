import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AI_CHAT_USAGE_POLL_MS,
  normalizeAiChatUsage,
  type AiChatFeature,
  type AiChatUsage,
} from '../lib/aiChatUsage'
import { supabase } from '../lib/supabase'

/** Read-only — polling this never costs the member an ask. */
async function fetchAiChatUsage(feature: AiChatFeature): Promise<AiChatUsage | null> {
  const { data, error } = await supabase.rpc('ai_chat_usage', { p_feature: feature })
  if (error) return null
  return normalizeAiChatUsage(data)
}

/**
 * Live "x/20 this hour" state for an AI chat.
 *
 * Three things keep it current with no page reload:
 *  - `pushUsage` applies the snapshot each Edge Function returns, so the meter
 *    moves the instant the member sends a question
 *  - a read on open
 *  - a poll every two minutes while the chat is open and the tab is visible,
 *    which catches the window rolling over and asks made in another tab
 *
 * Never throws and never blocks chat: if the read fails the meter simply hides.
 */
export function useAiChatUsage(feature: AiChatFeature, active: boolean) {
  const [usage, setUsage] = useState<AiChatUsage | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  const refresh = useCallback(async () => {
    if (!activeRef.current) return
    const next = await fetchAiChatUsage(feature)
    if (next && activeRef.current) setUsage(next)
  }, [feature])

  /** Apply the usage an ask response echoed back. */
  const pushUsage = useCallback((raw: unknown) => {
    const next = normalizeAiChatUsage(raw)
    if (next) setUsage(next)
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()

    const tick = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = window.setInterval(tick, AI_CHAT_USAGE_POLL_MS)

    // Coming back to a backgrounded tab: catch up immediately rather than
    // showing a stale count until the next tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, refresh])

  return { usage, pushUsage, refreshUsage: refresh }
}
