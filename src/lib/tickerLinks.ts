/**
 * Ticker text is public and shown to guests. Only addresses on these hosts become
 * clickable links; anything else stays plain text.
 */
const TRUSTED_HOSTS = [
  'dumpers-repo.com',
  'ko-fi.com',
  'github.com',
  'robertsspaceindustries.com',
  'uexcorp.space',
  'discord.gg',
  'discord.com',
] as const

const URL_IN_TEXT = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()"']*)?/gi

export type TickerTextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

function isTrustedHost(host: string): boolean {
  const lower = host.toLowerCase()
  return TRUSTED_HOSTS.some((trusted) => lower === trusted || lower.endsWith(`.${trusted}`))
}

/** Returns an https URL when `raw` points at a trusted host, otherwise null. */
export function trustedTickerHref(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  if (!isTrustedHost(url.hostname)) return null
  url.protocol = 'https:'
  return url.toString()
}

/** Splits ticker text into plain runs and trusted links. Trailing sentence punctuation stays text. */
export function splitTickerText(text: string): TickerTextPart[] {
  const parts: TickerTextPart[] = []
  let last = 0
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const start = match.index ?? 0
    let raw = match[0]
    const trailing = raw.match(/[.,;:!?]+$/)?.[0] ?? ''
    if (trailing) raw = raw.slice(0, -trailing.length)
    const href = trustedTickerHref(raw)
    if (!href) continue
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) })
    parts.push({ kind: 'link', text: raw, href })
    last = start + raw.length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}
