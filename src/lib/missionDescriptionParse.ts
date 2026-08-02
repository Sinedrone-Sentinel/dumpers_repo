export type MissionDescSegment =
  | { type: 'text'; text: string }
  | { type: 'placeholder'; label: string; raw: string; kind: 'mission' | 'emphasis' }

/** Humanize ~mission(Foo|Bar) → "Foo". */
export function humanizeMissionPlaceholderToken(token: string): string {
  const primary = String(token || '').split('|')[0].trim()
  if (!primary) return 'In-game value'
  return primary
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bScu\b/g, 'SCU')
    .replace(/\bId\b/g, 'ID')
    .trim()
}

function stripEmTags(inner: string): string {
  return inner.replace(/<\/?EM\d+>/gi, '')
}

/**
 * Split Contracts mission body text into plain text + placeholder chips.
 * Handles <EMn>…</EMn> emphasis and ~mission(Token) dynamic inserts.
 */
export function parseMissionDescription(text: string): MissionDescSegment[] {
  const raw = String(text || '')
  if (!raw) return []

  const segments: MissionDescSegment[] = []
  const pushText = (t: string) => {
    if (!t) return
    const last = segments[segments.length - 1]
    if (last?.type === 'text') last.text += t
    else segments.push({ type: 'text', text: t })
  }

  const tokenRe = /<EM\d+>([\s\S]*?)<\/EM\d+>|~mission\(([^)]+)\)/gi
  let last = 0
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(raw))) {
    if (match.index > last) pushText(raw.slice(last, match.index))

    if (match[1] != null) {
      const inner = stripEmTags(match[1])
      const missionOnly = inner.match(/^~mission\(([^)]+)\)(.*)$/i)
      if (missionOnly) {
        segments.push({
          type: 'placeholder',
          kind: 'mission',
          label: humanizeMissionPlaceholderToken(missionOnly[1]),
          raw: match[0],
        })
        if (missionOnly[2]) pushText(missionOnly[2])
      } else if (/~mission\(/i.test(inner)) {
        for (const part of parseMissionDescription(inner)) {
          if (part.type === 'text') pushText(part.text)
          else segments.push(part)
        }
      } else {
        const label = inner.replace(/\s+/g, ' ').trim()
        if (label) {
          segments.push({
            type: 'placeholder',
            kind: 'emphasis',
            label,
            raw: match[0],
          })
        }
      }
    } else if (match[2] != null) {
      segments.push({
        type: 'placeholder',
        kind: 'mission',
        label: humanizeMissionPlaceholderToken(match[2]),
        raw: match[0],
      })
    }

    last = match.index + match[0].length
  }
  if (last < raw.length) pushText(raw.slice(last))

  return segments
}
