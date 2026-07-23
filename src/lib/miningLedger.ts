import { EXTRA_CATALOG_RESOURCES } from '../config/extraResources'
import { getResourceType, isGemResource } from '../config/resourceTypes'
import { pricingForResourceLine } from './orderPricing'
import type { BlueprintResourceRow } from './operations'

export const MINING_LEDGER_SCHEMA_VERSION = 1 as const
export const MINING_LEDGER_YIELD_FACTOR = 0.45

/** Salvage rows manually addable inside Mining runs (not refined Construction Material). */
export const LEDGER_SALVAGE_ROW_KEYS = [
  'rmc',
  'construction_material_pebbles',
  'construction_material_rubble',
  'construction_material_salvage',
] as const

const LEDGER_SALVAGE_ROW_KEY_SET = new Set<string>(LEDGER_SALVAGE_ROW_KEYS)

export const LEDGER_SALVAGE_CATALOG_ENTRIES: BlueprintResourceRow[] = EXTRA_CATALOG_RESOURCES.filter(
  (row) => LEDGER_SALVAGE_ROW_KEY_SET.has(row.resourceKey)
).map((row) => ({
  resource_key: row.resourceKey,
  label: row.label,
  synced_at: '',
}))

const REFINED_CONSTRUCTION_MATERIAL = {
  resourceKey: 'construction_material',
  resourceLabel: 'Construction Material',
} as const

export function isLedgerSalvageRowKey(resourceKey: string): boolean {
  return LEDGER_SALVAGE_ROW_KEY_SET.has(resourceKey)
}

/** RMC is collected and sold directly — no refine/yield step. */
export function isLedgerDirectSalvageRow(resourceKey: string): boolean {
  return resourceKey === 'rmc'
}

/** Pebbles / rubble / salvage refine into Construction Material. */
export function isLedgerRefinableSalvageRow(resourceKey: string): boolean {
  return (
    resourceKey.startsWith('construction_material_') && resourceKey !== REFINED_CONSTRUCTION_MATERIAL.resourceKey
  )
}

export function ledgerRowShowsYield(resourceKey: string): boolean {
  if (isGemResource(resourceKey)) return false
  if (isLedgerDirectSalvageRow(resourceKey)) return false
  return true
}

export function ledgerPricingResource(
  resourceKey: string,
  resourceLabel: string
): { resourceKey: string; resourceLabel: string } {
  if (isLedgerRefinableSalvageRow(resourceKey)) {
    return { ...REFINED_CONSTRUCTION_MATERIAL }
  }
  return { resourceKey, resourceLabel }
}

export function ledgerOreGemCatalogEntries(catalog: BlueprintResourceRow[]): BlueprintResourceRow[] {
  return catalog
    .filter((row) => {
      const type = getResourceType(row.resource_key)
      return type === 'ore' || type === 'gem'
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function ledgerSalvageCatalogEntries(catalog: BlueprintResourceRow[]): BlueprintResourceRow[] {
  const byKey = new Map<string, BlueprintResourceRow>()
  for (const row of catalog) {
    if (isLedgerSalvageRowKey(row.resource_key)) {
      byKey.set(row.resource_key, row)
    }
  }
  for (const row of LEDGER_SALVAGE_CATALOG_ENTRIES) {
    if (!byKey.has(row.resource_key)) byKey.set(row.resource_key, row)
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Full mining-runs catalog (ore/gem + salvage) for price overrides. */
export function ledgerMiningCatalogEntries(catalog: BlueprintResourceRow[]): BlueprintResourceRow[] {
  return ledgerPriceOverrideCatalogEntries(catalog)
}

export function ledgerPriceOverrideCatalogEntries(
  catalog: BlueprintResourceRow[]
): BlueprintResourceRow[] {
  const byKey = new Map<string, BlueprintResourceRow>()
  for (const row of ledgerOreGemCatalogEntries(catalog)) {
    byKey.set(row.resource_key, row)
  }
  for (const row of ledgerSalvageCatalogEntries(catalog)) {
    byKey.set(row.resource_key, row)
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Default crew share count when a member is added (explicit 0 = alternate compensation). */
export const DEFAULT_CREW_SHARES = 1 as const
/** Ledger DFP always uses store-purchased Q0; row quality tracks mined band for merge/sorting only. */
export const MINING_LEDGER_PRICE_QUALITY = 0 as const

export interface MiningLedgerMiningRow {
  id: string
  resourceKey: string
  resourceLabel: string
  quality: number
  unrefinedCscu: number
  /** When set, used instead of estimated yield for actual profit column. */
  yieldActual: number | null
}

export interface MiningLedgerDeductible {
  id: string
  label: string
  cost: number
}

export interface MiningLedgerOtherProfit {
  id: string
  extra: string
  profit: number
}

/** Manual ore price per 100 cSCU yield, or gem price per whole gem; omit to use Purchased Q0 DFP default. */
export interface MiningLedgerPriceOverride {
  resourceKey: string
  resourceLabel: string
  pricePer100: number | null
}

export interface MiningLedgerCrewMember {
  id: string
  playerName: string
  /** Set when matched to a verified site member (autocomplete or RSI lookup). */
  linkedUserId: string | null
  shares: number
  role: string
  /** When shares = 0: how this member is compensated outside the pool split. */
  alternateCompensation: string
  isPaid: boolean
  /** Cumulative aUEC paid so far (partial or full); null/0 = none. */
  paidPayoutAuec: number | null
}

export type { CrewRsiAlertState } from './rsiHandleCheck'
export {
  CREW_RSI_INVALID_HANDLE_TOOLTIP,
  CREW_RSI_VALID_NOT_REGISTERED_TOOLTIP,
  CREW_RSI_VERIFIED_MEMBER_TOOLTIP,
} from './rsiHandleCheck'

/** @deprecated Use CREW_RSI_VALID_NOT_REGISTERED_TOOLTIP */
export { CREW_RSI_VALID_NOT_REGISTERED_TOOLTIP as UNKNOWN_CREW_MEMBER_TOOLTIP } from './rsiHandleCheck'

export interface MiningLedgerData {
  schemaVersion: typeof MINING_LEDGER_SCHEMA_VERSION
  /** Site user IDs already auto-added to crew once (creator + access grants). */
  seededCrewUserIds: string[]
  miningRows: MiningLedgerMiningRow[]
  deductibles: MiningLedgerDeductible[]
  otherProfits: MiningLedgerOtherProfit[]
  priceOverrides: MiningLedgerPriceOverride[]
  crew: MiningLedgerCrewMember[]
}

export interface MiningRowComputed {
  id: string
  resourceKey: string
  resourceLabel: string
  quality: number
  isGem: boolean
  unrefinedCscu: number
  yieldEstimate: number
  yieldActual: number
  profitEstimate: number
  profitActual: number
  /** Ore: aUEC per 100 cSCU yield. Gems: aUEC per whole gem. */
  pricePer100: number
}

export interface CrewMemberComputed {
  id: string
  playerName: string
  shares: number
  /** Excluded from pool split — uses alternateCompensation text instead. */
  noShareSplit: boolean
  role: string
  isPaid: boolean
  payoutEstimate: number
  payoutActual: number
  paidAuec: number
  outstandingEstimate: number
  outstandingActual: number
}

export interface MiningLedgerComputed {
  miningRows: MiningRowComputed[]
  pivotProfitEstimate: number
  pivotProfitActual: number
  /** Ore profit actual − deductibles + other profits; split by shares for crew payout actual. */
  totalPayout: number
  deductibleTotal: number
  otherProfitTotal: number
  poolEstimate: number
  poolActual: number
  totalShares: number
  /** Sum of shares for members with shares > 0 (pool split denominator). */
  splittingShares: number
  crew: CrewMemberComputed[]
  allCrewPaid: boolean
}

export interface MiningLedgerListItem {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
  creator_display: string | null
}

export interface MiningLedgerCollaborator {
  user_id: string
  rsi_handle: string | null
  display_name: string | null
  added_at: string
}

export interface MiningLedgerDetail extends MiningLedgerListItem {
  data: MiningLedgerData
  collaborators: MiningLedgerCollaborator[]
}

export function newLedgerRowId(): string {
  return crypto.randomUUID()
}

export function createEmptyMiningLedgerData(): MiningLedgerData {
  return {
    schemaVersion: MINING_LEDGER_SCHEMA_VERSION,
    seededCrewUserIds: [],
    miningRows: [],
    deductibles: [{ id: newLedgerRowId(), label: 'Refining', cost: 0 }],
    otherProfits: [],
    priceOverrides: [],
    crew: [],
  }
}

export function yieldEstimateFromUnrefined(
  resourceKey: string,
  unrefinedCscu: number
): number {
  if (isGemResource(resourceKey)) {
    return gemCountFromRow(unrefinedCscu)
  }
  if (isLedgerDirectSalvageRow(resourceKey)) {
    return roundLedgerCscu(unrefinedCscu)
  }
  return Math.round(unrefinedCscu * MINING_LEDGER_YIELD_FACTOR)
}

/** Whole gems sold as-is — no unrefined/refined split. */
export function crewPaidAuec(member: Pick<MiningLedgerCrewMember, 'paidPayoutAuec'>): number {
  const v = member.paidPayoutAuec
  if (v == null || !Number.isFinite(v)) return 0
  return Math.max(0, Math.round(v))
}

export function clampCrewPaidAuec(paid: number, payoutActual: number): number {
  const max = Math.max(0, Math.round(payoutActual))
  if (max <= 0) return 0
  return Math.min(Math.max(0, Math.round(paid)), max)
}

export function gemCountFromRow(unrefinedCscu: number): number {
  return Math.max(0, Math.trunc(unrefinedCscu))
}

/** cSCU amounts in ledger rows use 0.001 precision. */
export function roundLedgerCscu(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
}

/** Combine incoming mining rows with existing rows matching resourceKey + quality. */
export function mergeMiningRowsByResourceQuality(
  existing: MiningLedgerMiningRow[],
  incoming: MiningLedgerMiningRow[]
): { miningRows: MiningLedgerMiningRow[]; mergedCount: number; addedCount: number } {
  const rows = existing.map((row) => ({ ...row }))
  let mergedCount = 0
  let addedCount = 0

  for (const inc of incoming) {
    const matchIdx = rows.findIndex(
      (row) => row.resourceKey === inc.resourceKey && row.quality === inc.quality
    )
    if (matchIdx >= 0) {
      const prev = rows[matchIdx]
      rows[matchIdx] = {
        ...prev,
        resourceLabel: inc.resourceLabel || prev.resourceLabel,
        unrefinedCscu: roundLedgerCscu(prev.unrefinedCscu + inc.unrefinedCscu),
      }
      mergedCount++
    } else {
      rows.push(inc)
      addedCount++
    }
  }

  return { miningRows: rows, mergedCount, addedCount }
}

/** Parse crew shares; missing/invalid → DEFAULT_CREW_SHARES (explicit 0 kept for alternate pay). */
export function parseCrewShares(raw: unknown): number {
  if (raw === 0 || raw === '0') return 0
  if (raw == null || raw === '') return DEFAULT_CREW_SHARES
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CREW_SHARES
  return n
}

/**
 * Ore: profit = (yield cSCU / 100) × price per 100 cSCU.
 * Gems: profit = whole gem count × price per gem (never divided by 100).
 */
export function profitFromRowYield(
  resourceKey: string,
  yieldAmount: number,
  pricePer100: number
): number {
  if (!Number.isFinite(yieldAmount) || !Number.isFinite(pricePer100)) return 0
  if (isGemResource(resourceKey)) {
    return Math.trunc(Math.max(0, yieldAmount)) * pricePer100
  }
  return (yieldAmount / 100) * pricePer100
}

/**
 * Spreadsheet formula for ore: profit = (yield / 100) × price.
 * Yield is cSCU; price is aUEC per 100 cSCU of refined yield.
 */
export function profitFromYieldCscu(yieldCscu: number, pricePer100Cscu: number): number {
  if (!Number.isFinite(yieldCscu) || !Number.isFinite(pricePer100Cscu)) return 0
  return (yieldCscu / 100) * pricePer100Cscu
}

/** Purchased Q0 DFP per 100 cSCU yield for ore/salvage, or per gem for gems (qty=1). */
export function defaultPricePer100(resourceKey: string, resourceLabel: string): number {
  const pricing = ledgerPricingResource(resourceKey, resourceLabel)
  const { unitDfpAuec } = pricingForResourceLine(
    pricing.resourceKey,
    pricing.resourceLabel,
    MINING_LEDGER_PRICE_QUALITY,
    1
  )
  return unitDfpAuec
}

export function resolvePricePer100(
  resourceKey: string,
  resourceLabel: string,
  overrides: MiningLedgerPriceOverride[]
): number {
  const override = overrides.find((row) => row.resourceKey === resourceKey)
  if (override?.pricePer100 != null && Number.isFinite(override.pricePer100)) {
    return override.pricePer100
  }
  return defaultPricePer100(resourceKey, resourceLabel)
}

/** Add a verified site member to crew once per ledger (creator or access grant). */
export function seedCrewMemberOnce(
  data: MiningLedgerData,
  userId: string,
  playerName: string
): MiningLedgerData {
  const seeded = data.seededCrewUserIds ?? []
  if (seeded.includes(userId)) return data

  const alreadyOnCrew = data.crew.some((member) => member.linkedUserId === userId)
  const nextSeeded = [...seeded, userId]

  if (alreadyOnCrew) {
    return { ...data, seededCrewUserIds: nextSeeded }
  }

  return {
    ...data,
    seededCrewUserIds: nextSeeded,
    crew: [
      ...data.crew,
      {
        id: newLedgerRowId(),
        playerName,
        linkedUserId: userId,
        shares: DEFAULT_CREW_SHARES,
        role: '',
        alternateCompensation: '',
        isPaid: false,
        paidPayoutAuec: null,
      },
    ],
  }
}

export function computeMiningLedger(data: MiningLedgerData): MiningLedgerComputed {
  const miningRows: MiningRowComputed[] = data.miningRows.map((row) => {
    const isGem = isGemResource(row.resourceKey)
    const pricePer100 = resolvePricePer100(
      row.resourceKey,
      row.resourceLabel,
      data.priceOverrides
    )

    if (isGem) {
      const count = gemCountFromRow(row.unrefinedCscu)
      const profit = profitFromRowYield(row.resourceKey, count, pricePer100)
      return {
        id: row.id,
        resourceKey: row.resourceKey,
        resourceLabel: row.resourceLabel,
        quality: row.quality,
        isGem,
        unrefinedCscu: count,
        yieldEstimate: count,
        yieldActual: count,
        profitEstimate: profit,
        profitActual: profit,
        pricePer100,
      }
    }

    const yieldEst = yieldEstimateFromUnrefined(row.resourceKey, row.unrefinedCscu)
    const yieldAct = row.yieldActual ?? yieldEst
    return {
      id: row.id,
      resourceKey: row.resourceKey,
      resourceLabel: row.resourceLabel,
      quality: row.quality,
      isGem,
      unrefinedCscu: row.unrefinedCscu,
      yieldEstimate: yieldEst,
      yieldActual: yieldAct,
      profitEstimate: profitFromRowYield(row.resourceKey, yieldEst, pricePer100),
      profitActual: profitFromRowYield(row.resourceKey, yieldAct, pricePer100),
      pricePer100,
    }
  })

  const pivotProfitEstimate = miningRows.reduce((sum, row) => sum + row.profitEstimate, 0)
  const pivotProfitActual = miningRows.reduce((sum, row) => sum + row.profitActual, 0)

  const deductibleTotal = data.deductibles.reduce(
    (sum, row) => sum + (Number.isFinite(row.cost) ? row.cost : 0),
    0
  )
  const otherProfitTotal = data.otherProfits.reduce(
    (sum, row) => sum + (Number.isFinite(row.profit) ? row.profit : 0),
    0
  )

  const poolEstimate = -deductibleTotal + pivotProfitEstimate + otherProfitTotal
  /** Mining ore profit actual only (no deductibles or other profits). */
  const poolActual = pivotProfitActual
  /** Crew payout actual pool: ore profit actual − deductibles + other profits. */
  const totalPayout = -deductibleTotal + pivotProfitActual + otherProfitTotal

  const totalShares = data.crew.reduce(
    (sum, member) => sum + (Number.isFinite(member.shares) ? member.shares : 0),
    0
  )
  const splittingShares = data.crew.reduce((sum, member) => {
    const shares = Number.isFinite(member.shares) ? member.shares : 0
    return shares > 0 ? sum + shares : sum
  }, 0)

  const crew: CrewMemberComputed[] = data.crew.map((member) => {
    const shares = Number.isFinite(member.shares) ? member.shares : 0
    const noShareSplit = shares <= 0
    const payoutEstimate =
      !noShareSplit && splittingShares > 0
        ? (poolEstimate / splittingShares) * shares
        : 0
    const payoutActual =
      !noShareSplit && splittingShares > 0
        ? (totalPayout / splittingShares) * shares
        : 0
    const payoutActualRounded = Math.round(payoutActual)
    const payoutEstimateRounded = Math.round(payoutEstimate)
    const paidAuec = noShareSplit ? 0 : clampCrewPaidAuec(crewPaidAuec(member), payoutActualRounded)
    const settled = noShareSplit
      ? member.isPaid
      : member.isPaid ||
        (payoutActualRounded > 0 && paidAuec >= payoutActualRounded)
    return {
      id: member.id,
      playerName: member.playerName,
      shares,
      noShareSplit,
      role: member.role,
      isPaid: settled,
      payoutEstimate,
      payoutActual,
      paidAuec,
      outstandingEstimate:
        noShareSplit || settled ? 0 : Math.max(0, payoutEstimateRounded - paidAuec),
      outstandingActual:
        noShareSplit || settled ? 0 : Math.max(0, payoutActualRounded - paidAuec),
    }
  })

  const allCrewPaid =
    data.crew.length > 0 &&
    data.crew.every((member) => {
      const shares = Number.isFinite(member.shares) ? member.shares : 0
      if (shares <= 0) return member.isPaid
      const computedMember = crew.find((row) => row.id === member.id)
      return computedMember?.isPaid ?? false
    })

  return {
    miningRows,
    pivotProfitEstimate,
    pivotProfitActual,
    totalPayout,
    deductibleTotal,
    otherProfitTotal,
    poolEstimate,
    poolActual,
    totalShares,
    splittingShares,
    crew,
    allCrewPaid,
  }
}

export interface MiningLedgerExportPayload {
  exportedAt: string
  ledger: {
    id: string
    name: string
    orePriceQuality: typeof MINING_LEDGER_PRICE_QUALITY
  }
  computed: Omit<MiningLedgerComputed, 'crew'> & {
    crew: Omit<CrewMemberComputed, 'isPaid'>[]
  }
  data: Omit<MiningLedgerData, 'crew'> & {
    crew: Omit<MiningLedgerCrewMember, 'isPaid'>[]
  }
}

export function buildLedgerExportJson(
  ledgerId: string,
  ledgerName: string,
  data: MiningLedgerData,
  computed: MiningLedgerComputed
): MiningLedgerExportPayload {
  const exportData = ledgerDataWithoutPriceOverrides(data)
  return {
    exportedAt: new Date().toISOString(),
    ledger: {
      id: ledgerId,
      name: ledgerName,
      orePriceQuality: MINING_LEDGER_PRICE_QUALITY,
    },
    computed: {
      ...computed,
      crew: computed.crew.map(({ isPaid: _isPaid, ...rest }) => rest),
    },
    data: {
      ...exportData,
      crew: exportData.crew.map(({ isPaid: _isPaid, ...rest }) => rest),
    },
  }
}

/** Strip manual price overrides — exports use catalog Q0 defaults only. */
export function ledgerDataWithoutPriceOverrides(data: MiningLedgerData): MiningLedgerData {
  return { ...data, priceOverrides: [] }
}

export type ParseLedgerExportResult =
  | { ok: true; payload: MiningLedgerExportPayload; computed: MiningLedgerComputed }
  | { ok: false; error: string }

function normalizeImportedLedgerData(raw: Record<string, unknown>): MiningLedgerData {
  const empty = createEmptyMiningLedgerData()
  return {
    schemaVersion: MINING_LEDGER_SCHEMA_VERSION,
    seededCrewUserIds: Array.isArray(raw.seededCrewUserIds)
      ? raw.seededCrewUserIds.map(String)
      : [],
    miningRows: Array.isArray(raw.miningRows)
      ? (raw.miningRows as MiningLedgerMiningRow[])
      : [],
    deductibles: Array.isArray(raw.deductibles)
      ? (raw.deductibles as MiningLedgerDeductible[])
      : empty.deductibles,
    otherProfits: Array.isArray(raw.otherProfits)
      ? (raw.otherProfits as MiningLedgerOtherProfit[])
      : [],
    priceOverrides: [],
    crew: Array.isArray(raw.crew)
      ? (raw.crew as MiningLedgerCrewMember[]).map((row) => ({
          id: String(row.id),
          playerName: String(row.playerName ?? ''),
          linkedUserId:
            row.linkedUserId != null && row.linkedUserId !== ''
              ? String(row.linkedUserId)
              : null,
          shares: parseCrewShares(row.shares),
          role: String(row.role ?? ''),
          alternateCompensation: String(row.alternateCompensation ?? ''),
          isPaid: Boolean(row.isPaid),
          paidPayoutAuec:
            row.paidPayoutAuec != null && Number.isFinite(Number(row.paidPayoutAuec))
              ? Number(row.paidPayoutAuec)
              : null,
        }))
      : [],
  }
}

/** Validate and parse a downloaded Mining Ledger JSON export for read-only viewing. */
export function parseLedgerExportJson(raw: unknown): ParseLedgerExportResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'File is not a valid JSON object.' }
  }

  const root = raw as Record<string, unknown>
  const dataRaw = root.data
  if (!dataRaw || typeof dataRaw !== 'object') {
    return { ok: false, error: 'Missing ledger data section.' }
  }

  const dataObj = dataRaw as Record<string, unknown>
  if (!Array.isArray(dataObj.miningRows)) {
    return { ok: false, error: 'Invalid or missing mining rows (miningRows).' }
  }
  if (!Array.isArray(dataObj.crew)) {
    return { ok: false, error: 'Invalid or missing crew array.' }
  }

  const ledgerMeta =
    root.ledger && typeof root.ledger === 'object'
      ? (root.ledger as Record<string, unknown>)
      : null

  const hasExportShape =
    typeof root.exportedAt === 'string' ||
    (ledgerMeta != null && typeof ledgerMeta.name === 'string')

  if (!hasExportShape) {
    return {
      ok: false,
      error: 'Not a Mining Ledger export (expected exportedAt or ledger.name).',
    }
  }

  const data = ledgerDataWithoutPriceOverrides(normalizeImportedLedgerData(dataObj))
  const computed = computeMiningLedger(data)

  const payload: MiningLedgerExportPayload = {
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : '',
    ledger: {
      id: String(ledgerMeta?.id ?? ''),
      name: String(ledgerMeta?.name ?? 'Imported ledger'),
      orePriceQuality: MINING_LEDGER_PRICE_QUALITY,
    },
    computed: {
      ...computed,
      crew: computed.crew.map(({ isPaid: _isPaid, ...rest }) => rest),
    },
    data: {
      ...data,
      crew: data.crew.map(({ isPaid: _isPaid, ...rest }) => rest),
    },
  }

  return { ok: true, payload, computed }
}

export function downloadLedgerJson(payload: MiningLedgerExportPayload, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function copyPayoutAmount(value: number): Promise<void> {
  const text = String(Math.round(value))
  return navigator.clipboard.writeText(text)
}

export function formatLedgerMoney(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${Math.round(value).toLocaleString()} aUEC`
}

/** Round down slightly so billboard copy can truthfully say "over X aUEC". */
export function floorLedgerPayoutForOverDisplay(totalAuec: number): number {
  const total = Math.max(0, Math.round(totalAuec))
  if (total <= 0) return 0

  const step =
    total < 100 ? 10
    : total < 1_000 ? 100
    : total < 10_000 ? 1_000
    : total < 100_000 ? 10_000
    : total < 1_000_000 ? 100_000
    : 1_000_000

  let floored = Math.floor(total / step) * step
  if (floored >= total) {
    floored = Math.max(0, floored - step)
  }
  return floored
}

export function formatLedgerSiteStatsMessage(stats: {
  archivedLedgerCount: number
  crewMemberCount: number
  totalPayoutAuec: number
}): string {
  const ledgerVerb = stats.archivedLedgerCount === 1 ? 'has' : 'have'
  const ledgerNoun =
    stats.archivedLedgerCount === 1 ? 'Crew Ledger' : 'Crew Ledgers'
  const memberVerb = stats.crewMemberCount === 1 ? 'has' : 'have'
  const memberNoun =
    stats.crewMemberCount === 1 ? 'Crew Member' : 'Crew Members'
  const displayPayout = floorLedgerPayoutForOverDisplay(stats.totalPayoutAuec)

  return `${stats.archivedLedgerCount.toLocaleString()} ${ledgerNoun} ${ledgerVerb} been created and ${stats.crewMemberCount.toLocaleString()} ${memberNoun} ${memberVerb} been paid out over ${formatLedgerMoney(displayPayout)}.`
}

export function shortLedgerId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}
