const HOUR_MS = 60 * 60 * 1000

export function hoursRemaining(deadlineIso: string | null | undefined): number | null {
  if (!deadlineIso) return null
  const remaining = new Date(deadlineIso).getTime() - Date.now()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / HOUR_MS)
}

export function deadlineFromStart(
  startIso: string | null | undefined,
  hours: number
): string | null {
  if (!startIso) return null
  return new Date(new Date(startIso).getTime() + hours * HOUR_MS).toISOString()
}

export function formatHoursRemaining(hours: number | null): string {
  if (hours === null) return ''
  if (hours <= 0) return 'Expired'
  if (hours < 24) return `${hours}h remaining`
  const days = Math.floor(hours / 24)
  const rem = hours % 24
  return rem > 0 ? `${days}d ${rem}h remaining` : `${days}d remaining`
}

export function orderHasHighQualityBlueprint(
  order: { blueprints?: { min_quality: number }[]; min_quality?: number }
): boolean {
  const lines = order.blueprints ?? []
  if (lines.length > 0) {
    return lines.some((line) => line.min_quality >= 800)
  }
  return (order.min_quality ?? 0) >= 800
}
