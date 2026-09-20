/**
 * Parse Shubin Advisor reply lines so the chat UI can color [TERM]/[FIT]/... tags.
 * User questions are not parsed.
 */

export const SHUBIN_TERMINAL_TAGS = [
  'TERM',
  'FIT',
  'INFO',
  'WARNING',
  'ERROR',
  'DENIED',
  'BUY',
  'SHUBIN',
] as const

export type ShubinTerminalTag = (typeof SHUBIN_TERMINAL_TAGS)[number]

export type ShubinLinePart =
  | { kind: 'tag'; tag: string; slug: string }
  | { kind: 'text'; text: string }

const LEADING_TAG = /^(\[[A-Z]+\])([ \t]*)(.*)$/

function isKnownTag(value: string): value is ShubinTerminalTag {
  return (SHUBIN_TERMINAL_TAGS as readonly string[]).includes(value)
}

export function parseShubinTerminalLine(line: string): ShubinLinePart[] {
  const match = LEADING_TAG.exec(String(line ?? ''))
  if (!match) return [{ kind: 'text', text: line }]
  const tagToken = match[1]
  const name = tagToken.slice(1, -1)
  const gap = match[2]
  const rest = match[3]
  const parts: ShubinLinePart[] = [
    { kind: 'tag', tag: tagToken, slug: isKnownTag(name) ? name.toLowerCase() : 'default' },
  ]
  if (gap) parts.push({ kind: 'text', text: gap })
  if (rest) parts.push({ kind: 'text', text: rest })
  return parts
}

/** First tag slug on a line, used to tint the rest of that terminal row. */
export function shubinLineTagSlug(line: string): string | null {
  const tag = parseShubinTerminalLine(line).find((part) => part.kind === 'tag')
  return tag?.kind === 'tag' ? tag.slug : null
}
