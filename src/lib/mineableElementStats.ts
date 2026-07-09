import { gameMining, type MineableElement } from '../data'
import {
  GROUND_VEHICLE_GEMS,
  isHandMineableOre,
  normalizeMiningOreName,
} from './handMineables'

export interface MineableElementStats {
  instability: number
  resistance: number
}

function normalizeElementKey(name: string): string {
  return name.trim().toLowerCase()
}

function guideOreLookupKey(oreName: string): string {
  return normalizeElementKey(normalizeMiningOreName(oreName))
}

function elementLookupKeys(element: MineableElement): string[] {
  const keys = new Set<string>()
  const { name } = element
  keys.add(normalizeElementKey(name))
  if (name.startsWith('Ore_')) keys.add(normalizeElementKey(name.slice(4)))
  if (name.startsWith('Raw_')) keys.add(normalizeElementKey(name.slice(4)))
  if (/^Raw[A-Z]/.test(name)) keys.add(normalizeElementKey(name.slice(3)))
  return [...keys]
}

function elementMatchScore(element: MineableElement, oreName: string): number {
  const canonical = normalizeMiningOreName(oreName)
  const record = element.recordName.toLowerCase()
  const hand = isHandMineableOre(canonical)
  const ground = GROUND_VEHICLE_GEMS.has(canonical)

  if (hand && record.includes('fps')) return 4
  if (ground && record.includes('groundvehicle')) return 4
  if (!hand && !ground && (element.name.startsWith('Ore_') || element.name.startsWith('Raw'))) return 4
  if (hand && !record.includes('test') && !record.includes('balance')) return 2
  if (record.includes('test') || record.includes('balance')) return 0
  return 1
}

const elementsByGuideKey = new Map<string, MineableElement[]>()

for (const element of gameMining.mineableElements) {
  for (const key of elementLookupKeys(element)) {
    const list = elementsByGuideKey.get(key) ?? []
    list.push(element)
    elementsByGuideKey.set(key, list)
  }
}

export function getMineableElementStats(oreName: string): MineableElementStats | null {
  const key = guideOreLookupKey(oreName)
  const candidates = elementsByGuideKey.get(key)
  if (!candidates?.length) return null

  const best = [...candidates].sort((a, b) => elementMatchScore(b, oreName) - elementMatchScore(a, oreName))[0]
  return {
    instability: best.instability,
    resistance: best.resistance,
  }
}

function formatStatRangeHint(values: number[], decimals: number): string | null {
  const finite = values.filter((v) => Number.isFinite(v))
  if (!finite.length) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const fmt = (v: number) =>
    decimals === 0
      ? String(Math.round(v))
      : Math.abs(v) >= 10 || Number.isInteger(v)
        ? v.toFixed(Math.min(decimals, 1))
        : v.toFixed(decimals)
  if (min === max) return fmt(min)
  return `${fmt(min)}–${fmt(max)}`
}

/** Expected instability/resistance hints for Rock Calculator (range when game data varies). */
export function getMineableElementStatHints(oreName: string): {
  instability: string | null
  resistance: string | null
} {
  const key = guideOreLookupKey(oreName)
  const candidates = elementsByGuideKey.get(key)
  if (!candidates?.length) return { instability: null, resistance: null }

  const ranked = [...candidates].sort((a, b) => elementMatchScore(b, oreName) - elementMatchScore(a, oreName))
  const topScore = elementMatchScore(ranked[0], oreName)
  const relevant = ranked.filter((c) => elementMatchScore(c, oreName) === topScore)

  return {
    instability: formatStatRangeHint(
      relevant.map((c) => c.instability),
      0
    ),
    resistance: formatStatRangeHint(
      relevant.map((c) => c.resistance),
      2
    ),
  }
}

export function formatMineableInstability(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 10 || Number.isInteger(value)) return String(Math.round(value))
  return value.toFixed(2)
}

export function formatMineableResistance(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}
