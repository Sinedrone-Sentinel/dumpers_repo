import {
  aiChatUsageTone,
  formatAiChatUsage,
  formatAiChatUsageReset,
  type AiChatUsage,
} from '../../lib/aiChatUsage'

const TONE_CLASS: Record<ReturnType<typeof aiChatUsageTone>, string> = {
  ok: 'text-slate-400',
  warn: 'text-amber-300',
  full: 'text-red-300',
}

/**
 * Shared "x/20 this hour" readout for the AI chats. Renders nothing until the
 * first read lands, so a failed usage lookup never leaves an empty box behind.
 */
export default function AiChatUsageMeter({
  usage,
  className = '',
}: {
  usage: AiChatUsage | null
  className?: string
}) {
  if (!usage) return null

  const tone = aiChatUsageTone(usage)
  const reset = formatAiChatUsageReset(usage.resetsInSec)
  const atCap = tone === 'full'

  return (
    <span
      className={`text-[10px] tabular-nums ${TONE_CLASS[tone]} ${className}`}
      title={
        atCap
          ? `You have used all ${usage.max} questions for this hour${reset ? ` — ${reset}` : ''}.`
          : `Each chat allows ${usage.max} questions per hour${reset ? ` — ${reset}` : ''}.`
      }
    >
      {formatAiChatUsage(usage)}
      {reset ? ` · ${reset}` : ''}
    </span>
  )
}
