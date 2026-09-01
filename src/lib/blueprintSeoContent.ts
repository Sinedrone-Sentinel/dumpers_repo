import type { BlueprintSeoSlugInput } from './blueprintSeoSlug'
import {
  blueprintDisplayName,
  blueprintInternalKey,
  buildBlueprintSeoSlugMap,
  hasBlueprintSeoEntity,
} from './blueprintSeoSlug'
import gameBlueprintsData from '../data/game-blueprints.json'

type SlotOption = {
  type?: string
  resourceName?: string
  entityName?: string
  displayName?: string
  standardCargoUnits?: number
  count?: number
  quantity?: number
  itemName?: string
}

type Slot = {
  slotDisplayName?: string
  requiredCount?: number
  options?: SlotOption[]
}

type RewardMission = {
  mission?: string
  chance?: number
  standingName?: string | null
  maxStandingName?: string | null
  minReputation?: number | null
  maxReputation?: number | null
  repPoints?: number | null
  category?: string | null
  system?: string | null
  region?: string | null
  locations?: string[]
}

export type SeoBlueprint = BlueprintSeoSlugInput & {
  categoryName?: string | null
  category?: string | null
  craftTimeMinutes?: number | null
  craftTime?: { hours?: number; minutes?: number; seconds?: number } | null
  slots?: Slot[] | null
  rewardMissions?: RewardMission[] | null
}

export type SeoMaterialLine = {
  slot: string
  label: string
  amountText: string
}

export type SeoMissionLine = {
  title: string
  dropText: string
  standingText: string
  repText: string
  metaText: string
}

const allBlueprints = (gameBlueprintsData as { blueprints?: SeoBlueprint[] }).blueprints ?? []

let slugByInternal: Map<string, string> | null = null
let blueprintBySlug: Map<string, SeoBlueprint> | null = null

function ensureIndexes(): void {
  if (slugByInternal && blueprintBySlug) return
  slugByInternal = buildBlueprintSeoSlugMap(allBlueprints)
  blueprintBySlug = new Map()
  for (const bp of allBlueprints) {
    if (!hasBlueprintSeoEntity(bp)) continue
    const key = blueprintInternalKey(bp)
    const slug = slugByInternal.get(key)
    if (!slug) continue
    blueprintBySlug.set(slug, bp)
  }
}

export function getBlueprintSeoSlugMap(): Map<string, string> {
  ensureIndexes()
  return slugByInternal!
}

export function getBlueprintBySeoSlug(slug: string): SeoBlueprint | null {
  ensureIndexes()
  return blueprintBySlug!.get(slug) ?? null
}

export function getSeoSlugForInternalName(internalName: string): string | null {
  ensureIndexes()
  return slugByInternal!.get(internalName) ?? null
}

export function formatCraftTime(bp: SeoBlueprint): string {
  const ct = bp.craftTime
  if (ct && (ct.hours || ct.minutes || ct.seconds)) {
    const parts: string[] = []
    if (ct.hours) parts.push(`${ct.hours}h`)
    if (ct.minutes) parts.push(`${ct.minutes}m`)
    if (ct.seconds) parts.push(`${ct.seconds}s`)
    return parts.join(' ') || '—'
  }
  const mins = bp.craftTimeMinutes
  if (mins == null || Number.isNaN(Number(mins))) return '—'
  const totalSec = Math.round(Number(mins) * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

export function craftTimeIsoDuration(bp: SeoBlueprint): string | null {
  const ct = bp.craftTime
  let totalSec = 0
  if (ct && (ct.hours || ct.minutes || ct.seconds)) {
    totalSec = (ct.hours || 0) * 3600 + (ct.minutes || 0) * 60 + (ct.seconds || 0)
  } else if (bp.craftTimeMinutes != null) {
    totalSec = Math.round(Number(bp.craftTimeMinutes) * 60)
  }
  if (totalSec <= 0) return null
  return `PT${totalSec}S`
}

function seoMaterialLabel(opt: SlotOption): string {
  return opt.resourceName || opt.entityName || opt.displayName || opt.itemName || 'Material'
}

function seoMaterialAmount(opt: SlotOption): string {
  if (opt.standardCargoUnits != null && Number(opt.standardCargoUnits) > 0) {
    return `${Number(opt.standardCargoUnits)} SCU`
  }
  const count = opt.quantity ?? opt.count
  if (count != null && Number(count) > 0) {
    const n = Number(count)
    return `${n} item${n === 1 ? '' : 's'}`
  }
  return '—'
}

/** Same rules as scripts/lib/blueprintSeoDisplay.mjs cleanSeoMissionTitle. */
export function cleanSeoMissionTitle(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw)
    .replace(/~mission\s*\([^)]*\)/gi, '')
    .replace(/~\w+\([^)]*\)/g, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s*:\s*(\s|$)/g, ': ')
    .replace(/\s+/g, ' ')
    .replace(/\s+at\s*$/i, '')
    .replace(/^\s*Rank\s*-\s*/i, '')
    .replace(/:\s*$/g, '')
    .trim()
}

export function listSeoMaterials(bp: SeoBlueprint): SeoMaterialLine[] {
  const lines: SeoMaterialLine[] = []
  for (const slot of bp.slots ?? []) {
    const opt = (slot.options ?? []).find((o) => o.type === 'resource' || o.resourceName) ?? slot.options?.[0]
    if (!opt) continue
    lines.push({
      slot: slot.slotDisplayName || 'Input',
      label: seoMaterialLabel(opt),
      amountText: seoMaterialAmount(opt),
    })
  }
  return lines
}

function formatPct(chance: number | undefined): string {
  if (chance == null || Number.isNaN(Number(chance))) return ''
  const pct = Number(chance) * 100
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10
  return `${rounded}% BP drop`
}

export function listSeoRewardMissions(bp: SeoBlueprint): SeoMissionLine[] {
  const missions = [...(bp.rewardMissions ?? [])].sort((a, b) =>
    String(a.mission || '').localeCompare(String(b.mission || ''), undefined, {
      sensitivity: 'base',
    })
  )
  return missions
    .map((m) => ({ ...m, mission: cleanSeoMissionTitle(m.mission) }))
    .filter((m) => m.mission)
    .map((m) => {
      const standingParts: string[] = []
      if (m.standingName) {
        const minRep =
          m.minReputation != null ? ` (${Number(m.minReputation).toLocaleString()} rep)` : ''
        standingParts.push(`${m.standingName}${minRep}`)
      }
      if (m.maxStandingName && m.maxStandingName !== m.standingName) {
        const maxRep =
          m.maxReputation != null ? ` (${Number(m.maxReputation).toLocaleString()})` : ''
        standingParts.push(`${m.maxStandingName}${maxRep}`)
      }
      const loc =
        m.system || m.region
          ? [m.system, m.region].filter(Boolean).join(' ')
          : (m.locations || []).join(', ')
      const meta = [m.category, loc].filter(Boolean).join(' · ')
      const rep =
        m.repPoints != null && Number(m.repPoints) !== 0
          ? `${Number(m.repPoints) > 0 ? '+' : ''}${m.repPoints} rep`
          : ''
      return {
        title: String(m.mission).trim(),
        dropText: formatPct(m.chance),
        standingText: standingParts.join(' – '),
        repText: rep,
        metaText: meta,
      }
    })
}

export function blueprintSeoTitle(bp: SeoBlueprint): string {
  const name = blueprintDisplayName(bp)
  return `${name} Blueprint — Star Citizen Crafting | Dumper's Repo`
}

export function blueprintSeoDescription(bp: SeoBlueprint): string {
  const name = blueprintDisplayName(bp)
  const materials = listSeoMaterials(bp)
  const matSummary = materials
    .slice(0, 4)
    .map((m) => m.label)
    .join(', ')
  const missionCount = listSeoRewardMissions(bp).length
  const craft = formatCraftTime(bp)
  const parts = [
    `Star Citizen ${name} crafting blueprint`,
    craft !== '—' ? `craft time ${craft}` : null,
    matSummary ? `materials: ${matSummary}` : null,
    missionCount > 0 ? `${missionCount} reward mission${missionCount === 1 ? '' : 's'}` : null,
    "Open Dumper's Repo Offline Mode for the full tracker and DFP.",
  ].filter(Boolean)
  return parts.join(' — ')
}

export function buildBlueprintHowToJsonLd(
  bp: SeoBlueprint,
  pageUrl: string
): Record<string, unknown> {
  const name = blueprintDisplayName(bp)
  const materials = listSeoMaterials(bp)
  const totalTime = craftTimeIsoDuration(bp)
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `${name} Blueprint`,
    description: blueprintSeoDescription(bp),
    url: pageUrl,
    ...(totalTime ? { totalTime } : {}),
    yield: {
      '@type': 'QuantitativeValue',
      name,
      value: 1,
      unitText: 'item',
    },
    supply: materials.map((m) => ({
      '@type': 'HowToSupply',
      name: m.label,
      requiredQuantity: {
        '@type': 'QuantitativeValue',
        unitText: m.amountText,
      },
    })),
  }
}

export function buildBlueprintBreadcrumbJsonLd(
  bp: SeoBlueprint,
  pageUrl: string,
  catalogUrl: string
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'All Blueprints',
        item: catalogUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: blueprintDisplayName(bp),
        item: pageUrl,
      },
    ],
  }
}
