import { formatMissionDisplayTitle } from './missionDisplay'

const REP_PROGRESS_SUFFIX_RE = /^(.+?)\s*\[(\d+)\s*\/\s*(\d+)\s*(?:rep|Rep|REP)?\]\s*$/
const REP_AWARD_SUFFIX_RE = /^(.+?)\s*\[(\d+)\s*(?:rep|Rep|REP)\]\s*$/
const LOG_NOISE_TAIL_RE = /\s:\s*"\s*\[\d+\]\s*To Queue|\[\d+\]\s*To Queue/i
/** CIG accept notifications tag blueprint-reward contracts as [bp] / [BP]. */
const BP_TAG_RE = /\s*\[bp\](?=\s*\[|$)/gi

/**
 * Strip HTML, [bp] tags, and Game.log queue noise from contract accept text.
 * Shared by display, contract match, and live-tracker pool lookup.
 */
export function sanitizeLiveMissionRawLabel(raw: string | null | undefined): string {
  let text = (raw || '').trim()
  if (!text) return ''

  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(BP_TAG_RE, '').replace(/\s+/g, ' ').trim()

  const embeddedRep = text.match(/\[(\d+)\s*\/\s*(\d+)\s*(?:rep|Rep|REP)?\]/i)
  if (embeddedRep && embeddedRep.index != null) {
    const title = text.slice(0, embeddedRep.index).replace(/[\s:"']+$/g, '').trim()
    if (title) {
      return `${title} [${embeddedRep[1]}/${embeddedRep[2]} Rep]`
    }
  }

  text = text.split(LOG_NOISE_TAIL_RE)[0].replace(/[\s:"',]+$/g, '').trim()
  return text
}

/** Catalog-match title: accept text without [bp] or [rep] suffixes. */
export function liveMissionMatchTitle(raw: string | null | undefined): string {
  const trimmed = sanitizeLiveMissionRawLabel(raw)
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return ''

  const progress = trimmed.match(REP_PROGRESS_SUFFIX_RE)
  if (progress) return progress[1].trim()

  const awardedOnly = trimmed.match(REP_AWARD_SUFFIX_RE)
  if (awardedOnly) return awardedOnly[1].trim()

  return formatMissionDisplayTitle({ debugName: trimmed, title: trimmed })
}

/** Parse mission title + rep suffix from Game.log accept notification or internal debug name. */
export function parseLiveMissionLabel(raw: string | null | undefined): {
  title: string
  rewardText: string | null
} {
  const trimmed = sanitizeLiveMissionRawLabel(raw)
  if (!trimmed || trimmed.toLowerCase() === 'unknown') {
    return { title: 'Unknown mission', rewardText: null }
  }

  const progress = trimmed.match(REP_PROGRESS_SUFFIX_RE)
  if (progress) {
    const awarded = Number(progress[2])
    const tierTotal = Number(progress[3])
    return {
      title: progress[1].trim(),
      rewardText: `${awarded.toLocaleString()} / ${tierTotal.toLocaleString()} rep`,
    }
  }

  const awardedOnly = trimmed.match(REP_AWARD_SUFFIX_RE)
  if (awardedOnly) {
    const rep = Number(awardedOnly[2])
    return {
      title: awardedOnly[1].trim(),
      rewardText: `+${rep.toLocaleString()} rep`,
    }
  }

  const title = formatMissionDisplayTitle({ debugName: trimmed, title: trimmed })
  return { title, rewardText: null }
}
