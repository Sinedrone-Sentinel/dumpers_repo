/**
 * Per-hour ask allowance shared by the site's AI chats.
 *
 * Each chat has its own counter (migration 195, `ai_chat_rate_buckets` keyed on
 * user + feature), so Help questions never eat the Smart Cracker allowance.
 * The cap lives in SQL and is reported back here — never hardcode it in the UI.
 */
export type AiChatFeature = 'mining_advisor' | 'site_help'

export interface AiChatUsage {
  used: number
  max: number
  /** Seconds until the current hour window resets. */
  resetsInSec: number
}

/** Two minutes keeps the reset countdown honest without hammering a one-row read. */
export const AI_CHAT_USAGE_POLL_MS = 120_000

/**
 * Accepts both shapes we receive: snake_case from the `ai_chat_usage` RPC and
 * camelCase echoed by the Edge Functions on each ask.
 */
export function normalizeAiChatUsage(raw: unknown): AiChatUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const used = Number(row.used ?? row.ask_count)
  const max = Number(row.max)
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return null
  const resets = Number(row.resetsInSec ?? row.resets_in_sec)
  return {
    used: Math.max(0, Math.min(used, max)),
    max,
    resetsInSec: Number.isFinite(resets) && resets > 0 ? Math.floor(resets) : 0,
  }
}

export function formatAiChatUsage(usage: AiChatUsage): string {
  return `${usage.used}/${usage.max} this hour`
}

/**
 * The window is fixed, not rolling — the count resets in one step rather than
 * decaying per ask. Without this the number looks stuck, so always show it.
 */
export function formatAiChatUsageReset(resetsInSec: number): string | null {
  if (!Number.isFinite(resetsInSec) || resetsInSec <= 0) return null
  const minutes = Math.ceil(resetsInSec / 60)
  if (minutes >= 60) return 'resets in 1h'
  if (minutes <= 1) return 'resets in under a minute'
  return `resets in ${minutes}m`
}

export type AiChatUsageTone = 'ok' | 'warn' | 'full'

export function aiChatUsageTone(usage: AiChatUsage): AiChatUsageTone {
  if (usage.used >= usage.max) return 'full'
  if (usage.used >= usage.max - 3) return 'warn'
  return 'ok'
}
