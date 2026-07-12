import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppModal from '../layout/AppModal'
import SiteTooltip from '../SiteTooltip'
import { useAuth } from '../../contexts/AuthContext'
import { useResourceCatalog } from '../../hooks/useResourceCatalog'
import { useMiningLedger } from '../../hooks/useMiningLedger'
import ResourceQualitySelect, {
  getDefaultQualityForResource,
} from '../ResourceQualitySelect'
import { SALVAGE_ORDER_MIN_QUALITY } from '../../config/extraResources'
import { isGemResource, resourceLabelClassName } from '../../config/resourceTypes'
import type { BlueprintResourceRow } from '../../lib/operations'
import {
  buildLedgerExportJson,
  clampCrewPaidAuec,
  computeMiningLedger,
  copyPayoutAmount,
  defaultPricePer100,
  DEFAULT_CREW_SHARES,
  downloadLedgerJson,
  formatLedgerMoney,
  isLedgerDirectSalvageRow,
  isLedgerRefinableSalvageRow,
  isLedgerSalvageRowKey,
  ledgerOreGemCatalogEntries,
  ledgerPriceOverrideCatalogEntries,
  ledgerSalvageCatalogEntries,
  ledgerRowShowsYield,
  newLedgerRowId,
  parseLedgerExportJson,
  seedCrewMemberOnce,
  shortLedgerId,
  type MiningLedgerComputed,
  type MiningLedgerCrewMember,
  type MiningLedgerData,
  type MiningLedgerDeductible,
  type MiningLedgerExportPayload,
  type MiningLedgerMiningRow,
  type MiningLedgerOtherProfit,
  type MiningLedgerPriceOverride,
} from '../../lib/miningLedger'
import {
  lookupRsiVerifiedMemberByHandle,
  searchVerifiedMembersForLedger,
  type VerifiedMemberSearchResult,
} from '../../lib/miningLedgerOps'
import {
  checkRsiHandleExistsOnRsi,
  CREW_RSI_INVALID_HANDLE_TOOLTIP,
  CREW_RSI_VALID_NOT_REGISTERED_TOOLTIP,
  CREW_RSI_VERIFIED_MEMBER_TOOLTIP,
  sanitizeRsiHandleInput,
  type CrewRsiAlertState,
} from '../../lib/rsiHandleCheck'
import { resolveLedgerQuality } from '../../lib/qualityBands'

interface MiningLedgerTabProps {
  isGuestPreview: boolean
  onLedgerArchived?: () => void
}

/** Section title row — no sticky band; tables scroll naturally below. */
const LEDGER_SECTION_HEAD =
  'flex flex-wrap items-start justify-between gap-2 mb-2'

const LEDGER_SECTION =
  'rounded-lg border border-slate-700/45 bg-slate-900/35 p-3 sm:p-4'

const LEDGER_SECTION_TITLE =
  'text-base font-semibold text-white tracking-tight flex items-center gap-2'

const LEDGER_SECTION_ACCENT =
  'w-1 h-4 rounded-full bg-orange-500/75 shrink-0'

const LEDGER_INFO_TEXT =
  'text-xs text-slate-400 leading-relaxed mb-3 pl-3 border-l-2 border-slate-600/60'

const LEDGER_TABLE_HEAD =
  'text-[10px] uppercase tracking-wider text-slate-400 font-semibold'

const LEDGER_SUMMARY_CARD =
  'p-3 rounded-lg border border-slate-700/50 bg-slate-800/40 min-w-[7.5rem]'

const LEDGER_SUMMARY_LABEL =
  'text-[10px] uppercase tracking-wider text-slate-400 font-medium block mb-1'

const LEDGER_SUMMARY_VALUE =
  'text-sm font-semibold font-mono tabular-nums text-slate-50 block'

const LEDGER_SUMMARY_HINT =
  'text-[10px] text-slate-500 italic block mt-1 leading-snug'

const LEDGER_COMPUTED = 'font-mono text-slate-300 tabular-nums'
const LEDGER_ESTIMATE = 'font-mono text-slate-400 tabular-nums'
const LEDGER_MONEY = 'font-mono text-amber-300 tabular-nums font-medium'

const LEDGER_ADD_BTN =
  'inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md border border-orange-500/45 bg-orange-950/40 text-orange-200 hover:bg-orange-500/15 hover:border-orange-400/55 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

/** Horizontal scroll for wide tables only — no vertical clipping inside sections. */
const LEDGER_TABLE_SCROLL = 'overflow-x-auto overflow-y-visible'

type SortDir = 'asc' | 'desc'
type MiningRunSortKey = 'resource' | 'quality'

const LEDGER_SECTION_ACCENT_SALVAGE =
  'w-1 h-4 rounded-full bg-emerald-500/75 shrink-0'

function searchResourceCatalog(
  entries: BlueprintResourceRow[],
  query: string
): BlueprintResourceRow[] {
  const sorted = [...entries].sort((a, b) => a.label.localeCompare(b.label))
  const q = query.trim().toLowerCase()
  if (!q) return sorted.slice(0, 30)
  return sorted
    .filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.resource_key.toLowerCase().includes(q)
    )
    .slice(0, 30)
}

function ledgerAmountUnitLabel(resourceKey: string): string {
  if (isGemResource(resourceKey)) return 'gems'
  if (isLedgerDirectSalvageRow(resourceKey)) return 'SCU'
  if (isLedgerRefinableSalvageRow(resourceKey)) return 'SCU unref.'
  return 'cSCU unref.'
}

function defaultRowQuality(resourceKey: string, resourceLabel: string): number {
  if (isLedgerSalvageRowKey(resourceKey)) return SALVAGE_ORDER_MIN_QUALITY
  return Number(getDefaultQualityForResource(resourceKey, resourceLabel))
}

function createEmptyMiningRow(entry: BlueprintResourceRow | undefined): MiningLedgerMiningRow {
  const resourceKey = entry?.resource_key ?? ''
  const resourceLabel = entry?.label ?? ''
  return {
    id: newLedgerRowId(),
    resourceKey,
    resourceLabel,
    quality: defaultRowQuality(resourceKey, resourceLabel),
    unrefinedCscu: 0,
    yieldActual: null,
  }
}

function sortIndexedMiningRows(
  miningRows: MiningLedgerMiningRow[],
  sort: { key: MiningRunSortKey; dir: SortDir } | null
): { row: MiningLedgerMiningRow; index: number }[] {
  const indexed = miningRows.map((row, index) => ({ row, index }))
  if (!sort) return indexed

  const { key, dir } = sort
  const mul = dir === 'asc' ? 1 : -1

  return [...indexed].sort((a, b) => {
    const cmp =
      key === 'resource'
        ? (() => {
            const byLabel = a.row.resourceLabel.localeCompare(b.row.resourceLabel, undefined, {
              sensitivity: 'base',
            })
            return byLabel !== 0 ? byLabel : a.row.resourceKey.localeCompare(b.row.resourceKey)
          })()
        : a.row.quality - b.row.quality
    if (cmp !== 0) return cmp * mul
    return a.index - b.index
  })
}

function miningRowResourcePatch(
  prevRow: MiningLedgerMiningRow,
  resourceKey: string,
  resourceLabel: string
): Partial<MiningLedgerMiningRow> {
  const nextIsGem = isGemResource(resourceKey)
  const nextDirectSalvage = isLedgerDirectSalvageRow(resourceKey)
  return {
    resourceKey,
    resourceLabel,
    quality: defaultRowQuality(resourceKey, resourceLabel),
    unrefinedCscu: nextIsGem
      ? Math.max(0, Math.trunc(prevRow.unrefinedCscu))
      : prevRow.unrefinedCscu,
    yieldActual: nextIsGem || nextDirectSalvage ? null : prevRow.yieldActual,
  }
}

function LedgerSortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <th className="py-1.5 pr-2">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 text-left ${LEDGER_TABLE_HEAD} hover:text-slate-200 transition-colors`}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span>{label}</span>
        <span className={active ? 'text-orange-400' : 'text-slate-600'} aria-hidden>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function MiningResourceField({
  resourceKey,
  resourceLabel,
  catalogEntries,
  searchPlaceholder,
  onChange,
}: {
  resourceKey: string
  resourceLabel: string
  catalogEntries: BlueprintResourceRow[]
  searchPlaceholder: string
  onChange: (resourceKey: string, resourceLabel: string) => void
}) {
  const [query, setQuery] = useState(resourceLabel)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setQuery(resourceLabel)
  }, [resourceKey, resourceLabel])

  const options = useMemo(
    () => searchResourceCatalog(catalogEntries, query),
    [catalogEntries, query]
  )

  useEffect(() => {
    if (
      focused &&
      inputRef.current &&
      document.activeElement === inputRef.current &&
      options.length > 0
    ) {
      setOpen(true)
    }
  }, [options, focused])

  const handleSelect = (entry: BlueprintResourceRow) => {
    onChangeRef.current(entry.resource_key, entry.label)
    setQuery(entry.label)
    setOpen(false)
  }

  return (
    <div className="w-[8.5rem] max-w-[8.5rem] shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          const exact = catalogEntries.find(
            (entry) => entry.label.toLowerCase() === next.trim().toLowerCase()
          )
          if (exact) {
            onChangeRef.current(exact.resource_key, exact.label)
          }
        }}
        onBlur={() => {
          setFocused(false)
          window.setTimeout(() => {
            setOpen(false)
            setQuery(resourceLabel)
          }, 150)
        }}
        onFocus={(e) => {
          setFocused(true)
          if (e.isTrusted && options.length > 0) setOpen(true)
        }}
        placeholder={searchPlaceholder}
        className={`site-input w-full px-1 py-0.5 text-xs truncate ${resourceLabelClassName(resourceKey)}`}
        spellCheck={false}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <ul className="relative z-30 mt-1 w-[8.5rem] max-w-[8.5rem] rounded-lg border border-slate-600 bg-slate-900 shadow-lg max-h-48 overflow-y-auto">
          {options.map((entry) => (
            <li key={entry.resource_key}>
              <button
                type="button"
                className={`w-full px-2 py-1.5 text-left text-xs hover:bg-slate-800 truncate ${resourceLabelClassName(entry.resource_key)}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(entry)}
              >
                {entry.label}
                {isGemResource(entry.resource_key) ? (
                  <span className="text-slate-500 ml-1 font-normal">gem</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LedgerMiningRunsTable({
  sortedRows,
  catalogEntries,
  searchPlaceholder,
  computed,
  miningRunSort,
  showQualityColumn,
  onToggleSort,
  onPatchRow,
  onRemoveRow,
}: {
  sortedRows: { row: MiningLedgerMiningRow; index: number }[]
  catalogEntries: BlueprintResourceRow[]
  searchPlaceholder: string
  computed: MiningLedgerComputed
  miningRunSort: { key: MiningRunSortKey; dir: SortDir } | null
  showQualityColumn: boolean
  onToggleSort: (key: MiningRunSortKey) => void
  onPatchRow: (id: string, patch: Partial<MiningLedgerMiningRow>) => void
  onRemoveRow: (id: string) => void
}) {
  const colSpan = showQualityColumn ? 8 : 7

  return (
    <div className={LEDGER_TABLE_SCROLL}>
      <table
        className={`w-full text-xs table-fixed ${showQualityColumn ? 'min-w-[52rem]' : 'min-w-[44rem]'}`}
      >
        <colgroup>
          <col style={{ width: '9rem' }} />
          {showQualityColumn ? <col style={{ width: '9rem' }} /> : null}
          <col style={{ width: '6.5rem' }} />
          <col style={{ width: '6.5rem' }} />
          <col style={{ width: '6.5rem' }} />
          <col style={{ width: '7.5rem' }} />
          <col style={{ width: '7.5rem' }} />
          <col style={{ width: '2rem' }} />
        </colgroup>
        <thead>
          <tr className="text-left border-b border-slate-600/50">
            <LedgerSortHeader
              label="Resource"
              active={miningRunSort?.key === 'resource'}
              dir={miningRunSort?.key === 'resource' ? miningRunSort.dir : 'asc'}
              onClick={() => onToggleSort('resource')}
            />
            {showQualityColumn ? (
              <LedgerSortHeader
                label="Q"
                active={miningRunSort?.key === 'quality'}
                dir={miningRunSort?.key === 'quality' ? miningRunSort.dir : 'asc'}
                onClick={() => onToggleSort('quality')}
              />
            ) : null}
            <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Unrefined / Count</th>
            <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Yield est.</th>
            <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Yield act.</th>
            <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Profit est.</th>
            <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Profit act.</th>
            <th className="py-1.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="py-4 text-center text-slate-500 text-xs">
                No rows yet — use + Add row above.
              </td>
            </tr>
          ) : (
            sortedRows.map(({ row }) => {
              const calc = computed.miningRows.find((r) => r.id === row.id)
              const isGem = calc?.isGem ?? isGemResource(row.resourceKey)
              const showYield = ledgerRowShowsYield(row.resourceKey)
              const amountUnit = ledgerAmountUnitLabel(row.resourceKey)
              return (
                <tr key={row.id} className="border-b border-slate-800/60">
                  <td className="py-1 pr-2">
                    <MiningResourceField
                      resourceKey={row.resourceKey}
                      resourceLabel={row.resourceLabel}
                      catalogEntries={catalogEntries}
                      searchPlaceholder={searchPlaceholder}
                      onChange={(resourceKey, resourceLabel) =>
                        onPatchRow(row.id, miningRowResourcePatch(row, resourceKey, resourceLabel))
                      }
                    />
                  </td>
                  {showQualityColumn ? (
                    <td className="py-1 pr-2">
                      <ResourceQualitySelect
                        resourceKey={row.resourceKey}
                        resourceLabel={row.resourceLabel}
                        quality={String(row.quality)}
                        onQualityChange={(q) =>
                          onPatchRow(row.id, {
                            quality: resolveLedgerQuality(
                              row.resourceKey,
                              row.resourceLabel,
                              Number(q)
                            ),
                          })
                        }
                      />
                    </td>
                  ) : null}
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      value={row.unrefinedCscu || ''}
                      onChange={(e) =>
                        onPatchRow(row.id, {
                          unrefinedCscu: isGem
                            ? Math.max(0, Math.trunc(Number(e.target.value) || 0))
                            : Number(e.target.value) || 0,
                          ...(isGem || !showYield ? { yieldActual: null } : {}),
                        })
                      }
                      className="site-input w-[6rem] max-w-[6rem] shrink-0 px-1 py-0.5 text-xs"
                      min={0}
                      step={isGem ? 1 : 'any'}
                    />
                    <span className="text-[10px] text-slate-500 ml-0.5 font-medium">
                      {amountUnit}
                    </span>
                  </td>
                  <td
                    className={`py-1 pr-2 ${LEDGER_ESTIMATE} whitespace-nowrap overflow-hidden text-ellipsis`}
                  >
                    {showYield ? (calc?.yieldEstimate ?? '—') : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    {showYield ? (
                      <input
                        type="number"
                        value={row.yieldActual ?? ''}
                        placeholder={String(calc?.yieldEstimate ?? '')}
                        onChange={(e) =>
                          onPatchRow(row.id, {
                            yieldActual:
                              e.target.value === '' ? null : Number(e.target.value) || 0,
                          })
                        }
                        className="site-input w-[6rem] max-w-[6rem] shrink-0 px-1 py-0.5 text-xs"
                        min={0}
                        step="any"
                      />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td
                    className={`py-1 pr-2 ${LEDGER_ESTIMATE} whitespace-nowrap overflow-hidden text-ellipsis`}
                  >
                    {isGem ? '—' : calc ? formatLedgerMoney(calc.profitEstimate) : '—'}
                  </td>
                  <td
                    className={`py-1 pr-2 ${LEDGER_MONEY} whitespace-nowrap overflow-hidden text-ellipsis`}
                  >
                    {calc ? formatLedgerMoney(calc.profitActual) : '—'}
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.id)}
                      className="text-slate-500 hover:text-red-400"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function ensurePriceOverrides(
  data: MiningLedgerData,
  miningCatalogEntries: BlueprintResourceRow[]
): MiningLedgerPriceOverride[] {
  const byKey = new Map(data.priceOverrides.map((row) => [row.resourceKey, row]))
  for (const entry of miningCatalogEntries) {
    if (!byKey.has(entry.resource_key)) {
      byKey.set(entry.resource_key, {
        resourceKey: entry.resource_key,
        resourceLabel: entry.label,
        pricePer100: null,
      })
    }
  }
  return [...byKey.values()].sort((a, b) => a.resourceLabel.localeCompare(b.resourceLabel))
}

function CrewRsiAlertIcon({ state }: { state: CrewRsiAlertState }) {
  if (state === 'idle' || state === 'checking') {
    if (state === 'checking') {
      return (
        <span className="shrink-0 w-4 h-4 border-2 border-slate-500/40 border-t-slate-400 rounded-full animate-spin" />
      )
    }
    return null
  }

  if (state === 'verified_member') {
    return (
      <SiteTooltip content={CREW_RSI_VERIFIED_MEMBER_TOOLTIP} side="top">
        <span className="shrink-0 text-emerald-400 cursor-help" aria-label="Verified site member">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </span>
      </SiteTooltip>
    )
  }

  if (state === 'valid_not_registered') {
    return (
      <SiteTooltip content={CREW_RSI_VALID_NOT_REGISTERED_TOOLTIP} side="top">
        <span className="shrink-0 text-amber-400 cursor-help" aria-label="Valid RSI, not on site">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </span>
      </SiteTooltip>
    )
  }

  return (
    <SiteTooltip content={CREW_RSI_INVALID_HANDLE_TOOLTIP} side="top">
      <span className="shrink-0 text-red-400 cursor-help" aria-label="Invalid RSI handle">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </span>
    </SiteTooltip>
  )
}

function CrewPlayerNameField({
  value,
  linkedUserId,
  onChange,
  onAlertStateChange,
}: {
  value: string
  linkedUserId: string | null
  onChange: (name: string, linkedUserId: string | null) => void
  onAlertStateChange?: (state: CrewRsiAlertState) => void
}) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<VerifiedMemberSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [alertState, setAlertState] = useState<CrewRsiAlertState>('idle')
  const skipValidationRef = useRef(false)
  const validateSeqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (linkedUserId && value.trim()) {
      setAlertState('verified_member')
    }
  }, [linkedUserId, value])

  useEffect(() => {
    onAlertStateChange?.(alertState)
  }, [alertState, onAlertStateChange])

  useEffect(() => {
    const trimmed = query.trim()
    if (linkedUserId || trimmed.length < 2) {
      setOptions([])
      setOpen(false)
      if (!linkedUserId) setAlertState('idle')
      return
    }
    const timeout = setTimeout(async () => {
      const { data } = await searchVerifiedMembersForLedger(trimmed)
      setOptions(data)
      if (
        focused &&
        !linkedUserId &&
        inputRef.current &&
        document.activeElement === inputRef.current
      ) {
        setOpen(data.length > 0)
      }
    }, 250)
    return () => clearTimeout(timeout)
  }, [query, linkedUserId, focused])

  useEffect(() => {
    if (skipValidationRef.current) {
      skipValidationRef.current = false
      return
    }

    const handle = sanitizeRsiHandleInput(query.trim())
    if (!handle || handle.length < 2) {
      if (!linkedUserId) setAlertState('idle')
      return
    }

    if (linkedUserId) {
      setAlertState('verified_member')
      return
    }

    const seq = ++validateSeqRef.current
    setAlertState('checking')

    const timeout = setTimeout(async () => {
      const { valid } = await checkRsiHandleExistsOnRsi(handle)
      if (seq !== validateSeqRef.current) return

      if (!valid) {
        setAlertState('invalid_rsi')
        return
      }

      const { data: member } = await lookupRsiVerifiedMemberByHandle(handle)
      if (seq !== validateSeqRef.current) return

      if (member) {
        const label = member.rsi_handle || member.display_name || handle
        skipValidationRef.current = true
        onChangeRef.current(label, member.id)
        setQuery(label)
        setAlertState('verified_member')
      } else {
        setAlertState('valid_not_registered')
      }
    }, 600)

    return () => clearTimeout(timeout)
  }, [query, linkedUserId])

  return (
    <div className="w-44 max-w-44 shrink-0">
      <div className="flex items-center gap-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            const next = sanitizeRsiHandleInput(e.target.value)
            setQuery(next)
            onChange(next, null)
          }}
          onBlur={() => {
            setFocused(false)
            window.setTimeout(() => setOpen(false), 150)
          }}
          onFocus={(e) => {
            setFocused(true)
            if (
              e.isTrusted &&
              options.length > 0 &&
              !linkedUserId
            ) {
              setOpen(true)
            }
          }}
          placeholder="RSI handle"
          className="site-input flex-1 min-w-0 w-0 px-2 py-1 text-xs"
          spellCheck={false}
          autoComplete="off"
        />
        <CrewRsiAlertIcon state={alertState} />
      </div>
      {open && options.length > 0 && (
        <ul className="relative z-30 mt-1 w-44 max-w-44 rounded-lg border border-slate-600 bg-slate-900 shadow-lg">
          {options.map((member) => {
            const label = member.rsi_handle || member.display_name || 'Unknown'
            return (
              <li key={member.id}>
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-slate-800 text-white truncate"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    skipValidationRef.current = true
                    onChange(label, member.id)
                    setQuery(label)
                    setAlertState('verified_member')
                    setOpen(false)
                  }}
                >
                  {label}
                  {member.rsi_handle &&
                  member.display_name &&
                  member.display_name !== member.rsi_handle ? (
                    <span className="text-slate-500 ml-1">({member.display_name})</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function formatImportedLedgerAmount(row: {
  isGem: boolean
  resourceKey: string
  unrefinedCscu: number
}): string {
  if (row.isGem) {
    const n = row.unrefinedCscu
    return `${n} ${n === 1 ? 'gem' : 'gems'}`
  }
  if (isLedgerDirectSalvageRow(row.resourceKey) || isLedgerRefinableSalvageRow(row.resourceKey)) {
    return `${row.unrefinedCscu} SCU`
  }
  return `${row.unrefinedCscu} cSCU unrefined`
}

function ImportedLedgerViewModal({
  payload,
  computed,
  onClose,
}: {
  payload: MiningLedgerExportPayload
  computed: MiningLedgerComputed
  onClose: () => void
}) {
  const exportedLabel = payload.exportedAt
    ? new Date(payload.exportedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null

  const visibleDeductibles = payload.data.deductibles.filter((row) => row.cost !== 0)
  const visibleOtherProfits = payload.data.otherProfits.filter((row) => row.profit !== 0)

  return (
    <AppModal
      title={payload.ledger.name || 'Imported ledger'}
      subtitle={
        exportedLabel ? `Exported ${exportedLabel} · read-only` : 'Read-only export'
      }
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Pool (actual)</span>
            <span className="text-white font-mono tabular-nums">
              {formatLedgerMoney(computed.poolActual)}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Total payout</span>
            <span className="text-amber-300 font-mono tabular-nums">
              {formatLedgerMoney(computed.totalPayout)}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Splitting shares</span>
            <span className="text-white font-mono tabular-nums">{computed.splittingShares}</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Ore pricing</span>
            <span className="text-slate-200 text-[11px] leading-snug">
              Purchased (Q0) DFP
            </span>
          </div>
        </div>

        {computed.miningRows.some((row) => isLedgerSalvageRowKey(row.resourceKey)) && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-1">Salvage</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700/50">
                  <th className="py-1 pr-2 font-medium">Resource</th>
                  <th className="py-1 pr-2 font-medium">Amount</th>
                  <th className="py-1 pr-2 font-medium">Profit act.</th>
                </tr>
              </thead>
              <tbody>
                {computed.miningRows
                  .filter((row) => isLedgerSalvageRowKey(row.resourceKey))
                  .map((row) => (
                    <tr key={row.id} className="border-b border-slate-800/60">
                      <td className={`py-1.5 pr-2 ${resourceLabelClassName(row.resourceKey)}`}>
                        {row.resourceLabel}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-200">
                        {formatImportedLedgerAmount(row)}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-amber-300 tabular-nums">
                        {formatLedgerMoney(row.profitActual)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}

        {computed.miningRows.some((row) => !isLedgerSalvageRowKey(row.resourceKey)) && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-1">Ore / gems</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700/50">
                  <th className="py-1 pr-2 font-medium">Resource</th>
                  <th className="py-1 pr-2 font-medium">Q</th>
                  <th className="py-1 pr-2 font-medium">Amount</th>
                  <th className="py-1 pr-2 font-medium">Profit act.</th>
                </tr>
              </thead>
              <tbody>
                {computed.miningRows
                  .filter((row) => !isLedgerSalvageRowKey(row.resourceKey))
                  .map((row) => (
                    <tr key={row.id} className="border-b border-slate-800/60">
                      <td className={`py-1.5 pr-2 ${resourceLabelClassName(row.resourceKey)}`}>
                        {row.resourceLabel}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-slate-200">
                        {row.quality}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-200">
                        {formatImportedLedgerAmount(row)}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-amber-300 tabular-nums">
                        {formatLedgerMoney(row.profitActual)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}

        {visibleDeductibles.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-1">Deductibles</h3>
            <ul className="space-y-1">
              {visibleDeductibles.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 text-slate-200">
                  <span>{row.label || '—'}</span>
                  <span className="font-mono tabular-nums text-red-400 shrink-0">
                    −{formatLedgerMoney(row.cost)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {visibleOtherProfits.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-1">Other profits</h3>
            <ul className="space-y-1">
              {visibleOtherProfits.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 text-slate-200">
                  <span>{row.extra || '—'}</span>
                  <span className="font-mono tabular-nums text-emerald-400 shrink-0">
                    +{formatLedgerMoney(row.profit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {computed.crew.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-white mb-1">Crew</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700/50">
                  <th className="py-1 pr-2 font-medium">Member</th>
                  <th className="py-1 pr-2 font-medium">Shares</th>
                  <th className="py-1 pr-2 font-medium">Role</th>
                  <th className="py-1 pr-2 font-medium">Payout act.</th>
                  <th className="py-1 pr-2 font-medium">Paid</th>
                  <th className="py-1 pr-2 font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {computed.crew.map((member) => {
                  const crewRow = payload.data.crew.find((c) => c.id === member.id) as
                    | (typeof payload.data.crew)[number]
                    | undefined
                  const alternate = crewRow?.alternateCompensation?.trim()
                  return (
                    <tr key={member.id} className="border-b border-slate-800/60">
                      <td className="py-1.5 pr-2 text-slate-100">{member.playerName || '—'}</td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-slate-200">
                        {member.shares}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-300">{member.role || '—'}</td>
                      <td className="py-1.5 pr-2">
                        {member.noShareSplit ? (
                          <span className="text-slate-200">{alternate || '—'}</span>
                        ) : (
                          <span className="font-mono text-amber-300 tabular-nums">
                            {formatLedgerMoney(member.payoutActual)}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-slate-200">
                        {member.noShareSplit
                          ? '—'
                          : member.paidAuec > 0
                            ? formatLedgerMoney(member.paidAuec)
                            : '0 aUEC'}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-slate-200">
                        {member.noShareSplit
                          ? '—'
                          : formatLedgerMoney(member.outstandingActual)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Amounts use Purchased (Q0) catalog DFP at view time. Price override tables from exports are
          not loaded.
        </p>
      </div>
    </AppModal>
  )
}

export default function MiningLedgerTab({
  isGuestPreview,
  onLedgerArchived,
}: MiningLedgerTabProps) {
  const { user, profile } = useAuth()
  const isRsiVerified = profile?.rsi_handle_verified ?? false
  const { catalog, loading: catalogLoading } = useResourceCatalog()
  const {
    ledgers,
    activeId,
    detail,
    data,
    ledgerName,
    loading,
    saving,
    error,
    setError,
    updateData,
    updateName,
    createLedger,
    selectLedger,
    closeLedger,
    addCollaborator,
    removeCollaborator,
  } = useMiningLedger()

  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeModalDismissed, setCloseModalDismissed] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newLedgerName, setNewLedgerName] = useState('')
  const [showAccessModal, setShowAccessModal] = useState(false)
  const [collabSearch, setCollabSearch] = useState('')
  const [collabOptions, setCollabOptions] = useState<VerifiedMemberSearchResult[]>([])
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [salvageRunSort, setSalvageRunSort] = useState<{
    key: MiningRunSortKey
    dir: SortDir
  } | null>(null)
  const [oreGemRunSort, setOreGemRunSort] = useState<{
    key: MiningRunSortKey
    dir: SortDir
  } | null>(null)
  const [crewRsiById, setCrewRsiById] = useState<Record<string, CrewRsiAlertState>>({})
  const [importedLedgerView, setImportedLedgerView] = useState<{
    payload: MiningLedgerExportPayload
    computed: MiningLedgerComputed
  } | null>(null)
  const importJsonInputRef = useRef<HTMLInputElement>(null)

  const salvageCatalogEntries = useMemo(() => ledgerSalvageCatalogEntries(catalog), [catalog])
  const oreGemCatalogEntries = useMemo(() => ledgerOreGemCatalogEntries(catalog), [catalog])
  const priceOverrideCatalogEntries = useMemo(
    () => ledgerPriceOverrideCatalogEntries(catalog),
    [catalog]
  )
  const computed = useMemo(() => computeMiningLedger(data), [data])
  const isLedgerCreator = Boolean(user && detail && detail.created_by === user.id)

  const salvageRows = useMemo(
    () => data.miningRows.filter((row) => isLedgerSalvageRowKey(row.resourceKey)),
    [data.miningRows]
  )
  const oreGemRows = useMemo(
    () => data.miningRows.filter((row) => !isLedgerSalvageRowKey(row.resourceKey)),
    [data.miningRows]
  )

  const sortedSalvageRows = useMemo(
    () => sortIndexedMiningRows(salvageRows, salvageRunSort),
    [salvageRows, salvageRunSort]
  )
  const sortedOreGemRows = useMemo(
    () => sortIndexedMiningRows(oreGemRows, oreGemRunSort),
    [oreGemRows, oreGemRunSort]
  )

  const sortedCrew = useMemo(
    () =>
      [...computed.crew]
        .map((member, index) => ({ member, index }))
        .sort((a, b) => {
          if (a.member.isPaid !== b.member.isPaid) return a.member.isPaid ? 1 : -1
          return a.index - b.index
        })
        .map(({ member }) => member),
    [computed.crew]
  )

  const toggleSalvageRunSort = useCallback((key: MiningRunSortKey) => {
    if (key === 'quality') return
    setSalvageRunSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }, [])

  const toggleOreGemRunSort = useCallback((key: MiningRunSortKey) => {
    setOreGemRunSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }, [])

  useEffect(() => {
    setSalvageRunSort(null)
    setOreGemRunSort(null)
    setCrewRsiById({})
  }, [activeId])

  const handleCrewRsiState = useCallback((crewId: string, state: CrewRsiAlertState) => {
    setCrewRsiById((prev) => (prev[crewId] === state ? prev : { ...prev, [crewId]: state }))
  }, [])

  const handleImportJsonFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      try {
        const text = await file.text()
        const parsed: unknown = JSON.parse(text)
        const result = parseLedgerExportJson(parsed)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(null)
        setImportedLedgerView({
          payload: result.payload,
          computed: result.computed,
        })
      } catch {
        setError('Could not read JSON file — check that it is valid Mining Ledger export JSON.')
      }
    },
    [setError]
  )

  useEffect(() => {
    if (computed.allCrewPaid && activeId && data.crew.length > 0 && !closeModalDismissed) {
      setShowCloseModal(true)
    }
    if (!computed.allCrewPaid) {
      setCloseModalDismissed(false)
    }
  }, [computed.allCrewPaid, activeId, data.crew.length, closeModalDismissed])

  useEffect(() => {
    if (collabSearch.trim().length < 2) {
      setCollabOptions([])
      return
    }
    const timeout = setTimeout(async () => {
      const { data: results } = await searchVerifiedMembersForLedger(collabSearch.trim())
      setCollabOptions(results)
    }, 250)
    return () => clearTimeout(timeout)
  }, [collabSearch])

  const seedPriceTable = useCallback(() => {
    updateData((prev) => ({
      ...prev,
      priceOverrides: ensurePriceOverrides(prev, priceOverrideCatalogEntries),
    }))
  }, [priceOverrideCatalogEntries, updateData])

  useEffect(() => {
    if (!activeId || priceOverrideCatalogEntries.length === 0) return
    updateData((prev) => {
      const merged = ensurePriceOverrides(prev, priceOverrideCatalogEntries)
      const prevKeys = new Set(prev.priceOverrides.map((row) => row.resourceKey))
      const hasNew = priceOverrideCatalogEntries.some((entry) => !prevKeys.has(entry.resource_key))
      if (!hasNew && prev.priceOverrides.length > 0) return prev
      return { ...prev, priceOverrides: merged }
    })
  }, [activeId, priceOverrideCatalogEntries, updateData])

  const handleExport = useCallback(() => {
    if (!activeId) return
    const payload = buildLedgerExportJson(activeId, ledgerName, data, computed)
    const safeName = ledgerName.replace(/[^\w-]+/g, '_').slice(0, 40) || 'ledger'
    downloadLedgerJson(payload, `mining-ledger-${safeName}-${shortLedgerId(activeId)}.json`)
  }, [activeId, ledgerName, data, computed])

  const handleCloseConfirm = async () => {
    if (!activeId) return
    handleExport()
    const { error: closeError } = await closeLedger({ recordArchiveStats: true })
    setShowCloseModal(false)
    if (closeError) setError(closeError)
    else onLedgerArchived?.()
  }

  const handleDeleteLedger = async () => {
    const { error: deleteError } = await closeLedger({ recordArchiveStats: false })
    setShowDeleteModal(false)
    if (deleteError) setError(deleteError)
  }

  const handleCreateLedger = async () => {
    const name = newLedgerName.trim()
    if (!name || !user) return
    const playerName =
      profile?.rsi_handle?.trim() ||
      profile?.display_name?.trim() ||
      user.email?.split('@')[0] ||
      'Unknown'
    const id = await createLedger(name, { userId: user.id, playerName })
    if (id) {
      setShowNewModal(false)
      setNewLedgerName('')
    }
  }

  const patchCrew = (id: string, patch: Partial<MiningLedgerCrewMember>) => {
    updateData((prev) => ({
      ...prev,
      crew: prev.crew.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }))
  }

  const patchMiningRow = (id: string, patch: Partial<MiningLedgerMiningRow>) => {
    updateData((prev) => ({
      ...prev,
      miningRows: prev.miningRows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }))
  }

  if (isGuestPreview) {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-slate-700/50">
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Mining crew ledgers require a signed-in account with a verified RSI Handle. Sign in and
          verify your handle in Settings to create ledgers and track crew payouts.
        </p>
      </div>
    )
  }

  if (!isRsiVerified) {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-amber-500/30 bg-amber-950/10">
        <p className="text-slate-300 text-sm max-w-md mx-auto">
          Mining crew ledgers are available to members with a{' '}
          <strong className="text-amber-300/90">verified RSI Handle</strong> on Dumper&apos;s Repo.
          Open <strong className="text-white">Settings</strong> from the user menu to validate
          your handle, then return here.
        </p>
      </div>
    )
  }

  if (loading || catalogLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 pb-3 border-b border-slate-700/40">
        <div className="min-w-[200px]">
          <label className={`${LEDGER_SUMMARY_LABEL} mb-1.5`}>
            Ledgers
          </label>
          <select
            value={activeId ?? ''}
            onChange={(e) => void selectLedger(e.target.value)}
            className="site-input w-full px-2 py-1.5 text-sm"
            disabled={ledgers.length === 0}
          >
            {ledgers.length === 0 ? (
              <option value="">No ledgers yet</option>
            ) : (
              ledgers.map((ledger) => (
                <option key={ledger.id} value={ledger.id}>
                  {ledger.name} ({shortLedgerId(ledger.id)})
                </option>
              ))
            )}
          </select>
        </div>
        <div className="flex-1 min-w-[160px] max-w-xs">
          <label className={`${LEDGER_SUMMARY_LABEL} mb-1.5`}>
            Display name
          </label>
          <input
            type="text"
            value={ledgerName}
            onChange={(e) => updateName(e.target.value)}
            disabled={!activeId}
            className="site-input w-full px-2 py-1.5 text-sm"
            maxLength={120}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="px-3 py-1.5 text-xs rounded-lg border border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
        >
          New ledger
        </button>
        <button
          type="button"
          onClick={() => importJsonInputRef.current?.click()}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
        >
          View JSON export
        </button>
        <input
          ref={importJsonInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleImportJsonFile(e)}
        />
        {activeId && (
          <>
            {isLedgerCreator && (
              <button
                type="button"
                onClick={() => setShowAccessModal(true)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Manage access
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              Delete ledger
            </button>
          </>
        )}
        {saving && <span className="text-xs text-slate-500 self-center">Saving…</span>}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {copyToast && (
        <p className="text-xs text-emerald-400">{copyToast}</p>
      )}

      {!activeId ? (
        <div className="text-center py-10 rounded-lg border border-dashed border-slate-700/50">
          <p className="text-slate-500 text-sm mb-3">No ledger selected. Create one to get started.</p>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 text-sm rounded-lg bg-orange-600/80 hover:bg-orange-600 text-white"
          >
            Create ledger
          </button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className={`${LEDGER_TABLE_SCROLL} grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs min-w-0`}>
            <div className={LEDGER_SUMMARY_CARD}>
              <span className={LEDGER_SUMMARY_LABEL}>Pool (est.)</span>
              <span className={LEDGER_SUMMARY_VALUE}>{formatLedgerMoney(computed.poolEstimate)}</span>
              <span className={LEDGER_SUMMARY_HINT}>From yield est. × Q0 prices</span>
            </div>
            <div className={LEDGER_SUMMARY_CARD}>
              <span className={LEDGER_SUMMARY_LABEL}>Pool (actual)</span>
              <span className={LEDGER_SUMMARY_VALUE}>{formatLedgerMoney(computed.poolActual)}</span>
              <span className={LEDGER_SUMMARY_HINT}>Ore profit act. only</span>
            </div>
            <div className={LEDGER_SUMMARY_CARD}>
              <span className={LEDGER_SUMMARY_LABEL}>Total payout</span>
              <span className={`${LEDGER_SUMMARY_VALUE} text-amber-300`}>
                {formatLedgerMoney(computed.totalPayout)}
              </span>
              <span className={LEDGER_SUMMARY_HINT}>Ore − deductibles + extras</span>
            </div>
            <div className={LEDGER_SUMMARY_CARD}>
              <span className={LEDGER_SUMMARY_LABEL}>Splitting shares</span>
              <span className={LEDGER_SUMMARY_VALUE}>{computed.splittingShares}</span>
              {computed.splittingShares !== computed.totalShares && (
                <span className={LEDGER_SUMMARY_HINT}>
                  {computed.totalShares} incl. 0-share
                </span>
              )}
            </div>
            <div className={LEDGER_SUMMARY_CARD}>
              <span className={LEDGER_SUMMARY_LABEL}>Ore pricing</span>
              <span className="text-sm text-slate-200 font-medium">Purchased (Q0) DFP</span>
              <span className={LEDGER_SUMMARY_HINT}>Catalog defaults unless overridden</span>
            </div>
          </div>

          {/* Salvage */}
          <section className={LEDGER_SECTION}>
            <div className={LEDGER_SECTION_HEAD}>
              <h3 className={LEDGER_SECTION_TITLE}>
                <span className={LEDGER_SECTION_ACCENT_SALVAGE} aria-hidden />
                Salvage
              </h3>
              <button
                type="button"
                onClick={() =>
                  updateData((prev) => ({
                    ...prev,
                    miningRows: [...prev.miningRows, createEmptyMiningRow(salvageCatalogEntries[0])],
                  }))
                }
                className={LEDGER_ADD_BTN}
                disabled={salvageCatalogEntries.length === 0}
              >
                + Add row
              </button>
            </div>
            <p className={LEDGER_INFO_TEXT}>
              RMC is sold as collected (SCU, no yield step). Construction pebbles, rubble, and
              salvage refine into Construction Material — unrefined SCU → yield est. (45%) → yield
              act. Salvage has no quality tier (Q0 only).
            </p>
            <LedgerMiningRunsTable
              sortedRows={sortedSalvageRows}
              catalogEntries={salvageCatalogEntries}
              searchPlaceholder="Search salvage"
              computed={computed}
              miningRunSort={salvageRunSort}
              showQualityColumn={false}
              onToggleSort={toggleSalvageRunSort}
              onPatchRow={patchMiningRow}
              onRemoveRow={(id) =>
                updateData((prev) => ({
                  ...prev,
                  miningRows: prev.miningRows.filter((r) => r.id !== id),
                }))
              }
            />
          </section>

          {/* Ore / gems */}
          <section className={LEDGER_SECTION}>
            <div className={LEDGER_SECTION_HEAD}>
              <h3 className={LEDGER_SECTION_TITLE}>
                <span className={LEDGER_SECTION_ACCENT} aria-hidden />
                Ore / gems
              </h3>
              <button
                type="button"
                onClick={() =>
                  updateData((prev) => ({
                    ...prev,
                    miningRows: [...prev.miningRows, createEmptyMiningRow(oreGemCatalogEntries[0])],
                  }))
                }
                className={LEDGER_ADD_BTN}
                disabled={oreGemCatalogEntries.length === 0}
              >
                + Add row
              </button>
            </div>
            <p className={LEDGER_INFO_TEXT}>
              Ore: unrefined cSCU → yield est. (45% refine) → yield act. Gems are sold as-is —
              enter a whole gem count only; no yield columns.
            </p>
            <LedgerMiningRunsTable
              sortedRows={sortedOreGemRows}
              catalogEntries={oreGemCatalogEntries}
              searchPlaceholder="Search ore / gem"
              computed={computed}
              miningRunSort={oreGemRunSort}
              showQualityColumn
              onToggleSort={toggleOreGemRunSort}
              onPatchRow={patchMiningRow}
              onRemoveRow={(id) =>
                updateData((prev) => ({
                  ...prev,
                  miningRows: prev.miningRows.filter((r) => r.id !== id),
                }))
              }
            />
          </section>

          {/* Crew */}
          <section className={LEDGER_SECTION}>
            <div className={LEDGER_SECTION_HEAD}>
              <div className="min-w-0 flex-1">
                <h3 className={LEDGER_SECTION_TITLE}>
                  <span className={LEDGER_SECTION_ACCENT} aria-hidden />
                  Crew
                </h3>
                <p className={`${LEDGER_INFO_TEXT} mb-0 mt-2`}>
                  Pool splits among members with shares &gt; 0 only. Record partial payments in{' '}
                  <span className="text-slate-300 font-medium">Paid so far</span>;{' '}
                  <span className="text-slate-300 font-medium">Outstanding</span> updates
                  automatically. Check <span className="text-slate-300 font-medium">Paid</span> when
                  fully settled. Members at 0 shares use alternate compensation instead of aUEC
                  payout.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateData((prev) => ({
                    ...prev,
                    crew: [
                      ...prev.crew,
                      {
                        id: newLedgerRowId(),
                        playerName: '',
                        linkedUserId: null,
                        shares: DEFAULT_CREW_SHARES,
                        role: '',
                        alternateCompensation: '',
                        isPaid: false,
                        paidPayoutAuec: null,
                      },
                    ],
                  }))
                }
                className={LEDGER_ADD_BTN}
              >
                + Add member
              </button>
            </div>
            <div className={LEDGER_TABLE_SCROLL}>
            <table className="w-full min-w-[62rem] text-xs table-fixed">
              <colgroup>
                <col style={{ width: '11rem' }} />
                <col style={{ width: '4rem' }} />
                <col style={{ width: '6rem' }} />
                <col style={{ width: '7rem' }} />
                <col style={{ width: '7rem' }} />
                <col style={{ width: '7rem' }} />
                <col style={{ width: '7rem' }} />
                <col style={{ width: '2.5rem' }} />
                <col style={{ width: '2rem' }} />
              </colgroup>
              <thead>
                <tr className="text-left border-b border-slate-600/50">
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Member</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Shares</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Role</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Payout est.</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Payout act.</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Paid so far</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Outstanding</th>
                  <th className={`py-1.5 pr-2 ${LEDGER_TABLE_HEAD}`}>Paid</th>
                  <th className="py-1.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {sortedCrew.map((member) => {
                  const row = data.crew.find((c) => c.id === member.id)
                  if (!row) return null
                  return (
                    <tr key={member.id} className="border-b border-slate-800/60 align-top">
                      <td className="py-1 pr-2 w-44 max-w-44 align-top">
                        <CrewPlayerNameField
                          value={row.playerName}
                          linkedUserId={row.linkedUserId}
                          onChange={(name, linkedUserId) =>
                            patchCrew(row.id, { playerName: name, linkedUserId })
                          }
                          onAlertStateChange={(state) => handleCrewRsiState(row.id, state)}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          value={row.shares}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') return
                            const nextShares = Math.max(0, Number(raw) || 0)
                            patchCrew(row.id, {
                              shares: nextShares,
                              ...(nextShares <= 0
                                ? {
                                    paidPayoutAuec: null,
                                    alternateCompensation: row.alternateCompensation ?? '',
                                  }
                                : { alternateCompensation: '' }),
                            })
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '') {
                              patchCrew(row.id, {
                                shares: DEFAULT_CREW_SHARES,
                                alternateCompensation: '',
                              })
                            }
                          }}
                          className="site-input w-16 max-w-16 shrink-0 px-1 py-0.5 text-xs"
                          min={0}
                          step="any"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="text"
                          value={row.role}
                          onChange={(e) => patchCrew(row.id, { role: e.target.value })}
                          className="site-input w-24 max-w-24 shrink-0 px-1 py-0.5 text-xs"
                        />
                      </td>
                      {member.noShareSplit ? (
                        <td colSpan={2} className="py-1 pr-2">
                          <input
                            type="text"
                            value={row.alternateCompensation}
                            onChange={(e) =>
                              patchCrew(row.id, { alternateCompensation: e.target.value })
                            }
                            placeholder="Alternate compensation (not from pool split)"
                            className="site-input w-full min-w-0 px-2 py-1 text-xs"
                          />
                        </td>
                      ) : (
                        <>
                          <td className={`py-1 pr-2 ${LEDGER_ESTIMATE} whitespace-nowrap overflow-hidden text-ellipsis`}>
                            {formatLedgerMoney(member.payoutEstimate)}
                          </td>
                          <td className="py-1 pr-2 whitespace-nowrap overflow-hidden text-ellipsis">
                            <button
                              type="button"
                              onClick={async () => {
                                await copyPayoutAmount(member.payoutActual)
                                setCopyToast(
                                  `Copied ${Math.round(member.payoutActual).toLocaleString()} to clipboard`
                                )
                                window.setTimeout(() => setCopyToast(null), 2000)
                              }}
                              className={`${LEDGER_MONEY} hover:text-amber-200 cursor-copy whitespace-nowrap`}
                              title="Click to copy payout amount"
                            >
                              {formatLedgerMoney(member.payoutActual)}
                            </button>
                          </td>
                        </>
                      )}
                      <td className="py-1 pr-2">
                        {member.noShareSplit ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <input
                            type="number"
                            value={row.paidPayoutAuec ?? ''}
                            placeholder="0"
                            onChange={(e) => {
                              const raw = e.target.value
                              const nextPaid =
                                raw === ''
                                  ? null
                                  : clampCrewPaidAuec(
                                      Number(raw) || 0,
                                      member.payoutActual
                                    )
                              const payoutRounded = Math.round(member.payoutActual)
                              patchCrew(row.id, {
                                paidPayoutAuec: nextPaid,
                                isPaid:
                                  nextPaid != null &&
                                  payoutRounded > 0 &&
                                  nextPaid >= payoutRounded,
                              })
                            }}
                            className="site-input w-[6.5rem] max-w-[6.5rem] shrink-0 px-1 py-0.5 text-xs font-mono tabular-nums"
                            min={0}
                            step={1}
                          />
                        )}
                      </td>
                      <td className={`py-1 pr-2 ${LEDGER_COMPUTED} whitespace-nowrap overflow-hidden text-ellipsis`}>
                        {member.noShareSplit ? (
                          '—'
                        ) : member.outstandingActual > 0 ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await copyPayoutAmount(member.outstandingActual)
                              setCopyToast(
                                `Copied ${Math.round(member.outstandingActual).toLocaleString()} to clipboard`
                              )
                              window.setTimeout(() => setCopyToast(null), 2000)
                            }}
                            className="hover:text-amber-200 cursor-copy whitespace-nowrap"
                            title="Click to copy outstanding amount"
                          >
                            {formatLedgerMoney(member.outstandingActual)}
                          </button>
                        ) : (
                          formatLedgerMoney(0)
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        {(() => {
                          const rsiState =
                            crewRsiById[row.id] ??
                            (row.linkedUserId ? 'verified_member' : 'idle')
                          const blockPaid = rsiState === 'invalid_rsi'
                          const paidCheckbox = (
                            <input
                              type="checkbox"
                              checked={member.isPaid}
                              disabled={blockPaid}
                              onChange={(e) => {
                                if (e.target.checked && blockPaid) return
                                if (member.noShareSplit) {
                                  patchCrew(row.id, { isPaid: e.target.checked })
                                  return
                                }
                                if (e.target.checked) {
                                  patchCrew(row.id, {
                                    isPaid: true,
                                    paidPayoutAuec: Math.round(member.payoutActual),
                                  })
                                } else {
                                  patchCrew(row.id, { isPaid: false })
                                }
                              }}
                              className="rounded border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label={
                                blockPaid
                                  ? 'Cannot mark paid — invalid RSI handle'
                                  : member.noShareSplit
                                    ? 'Mark alternate compensation settled'
                                    : 'Mark fully paid'
                              }
                            />
                          )
                          if (!blockPaid) return paidCheckbox
                          return (
                            <SiteTooltip content={CREW_RSI_INVALID_HANDLE_TOOLTIP} side="top">
                              <span className="inline-flex">{paidCheckbox}</span>
                            </SiteTooltip>
                          )
                        })()}
                      </td>
                      <td className="py-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateData((prev) => ({
                              ...prev,
                              crew: prev.crew.filter((c) => c.id !== row.id),
                            }))
                          }
                          className="text-slate-500 hover:text-red-400"
                          aria-label="Remove member"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </section>

          {/* Deductibles + Other profits */}
          <div className="grid sm:grid-cols-2 gap-4">
            <section className={LEDGER_SECTION}>
              <div className={LEDGER_SECTION_HEAD}>
                <h3 className={LEDGER_SECTION_TITLE}>
                  <span className={LEDGER_SECTION_ACCENT} aria-hidden />
                  Deductibles
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    updateData((prev) => ({
                      ...prev,
                      deductibles: [
                        ...prev.deductibles,
                        { id: newLedgerRowId(), label: '', cost: 0 },
                      ],
                    }))
                  }
                  className={LEDGER_ADD_BTN}
                >
                  + Add
                </button>
              </div>
              {data.deductibles.map((row: MiningLedgerDeductible) => (
                <div key={row.id} className="flex gap-2 mb-1 items-center">
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        deductibles: prev.deductibles.map((d) =>
                          d.id === row.id ? { ...d, label: e.target.value } : d
                        ),
                      }))
                    }
                    placeholder="Label"
                    className="site-input flex-1 px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    value={row.cost || ''}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        deductibles: prev.deductibles.map((d) =>
                          d.id === row.id ? { ...d, cost: Number(e.target.value) || 0 } : d
                        ),
                      }))
                    }
                    className="site-input w-24 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateData((prev) => ({
                        ...prev,
                        deductibles: prev.deductibles.filter((d) => d.id !== row.id),
                      }))
                    }
                    className="text-slate-500 hover:text-red-400 shrink-0 px-1"
                    aria-label="Remove deductible"
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
            <section className={LEDGER_SECTION}>
              <div className={LEDGER_SECTION_HEAD}>
                <h3 className={LEDGER_SECTION_TITLE}>
                  <span className={LEDGER_SECTION_ACCENT} aria-hidden />
                  Other profits
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    updateData((prev) => ({
                      ...prev,
                      otherProfits: [
                        ...prev.otherProfits,
                        { id: newLedgerRowId(), extra: '', profit: 0 },
                      ],
                    }))
                  }
                  className={LEDGER_ADD_BTN}
                >
                  + Add
                </button>
              </div>
              {data.otherProfits.map((row: MiningLedgerOtherProfit) => (
                <div key={row.id} className="flex gap-2 mb-1 items-center">
                  <input
                    type="text"
                    value={row.extra}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        otherProfits: prev.otherProfits.map((d) =>
                          d.id === row.id ? { ...d, extra: e.target.value } : d
                        ),
                      }))
                    }
                    placeholder="Extra"
                    className="site-input flex-1 px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    value={row.profit || ''}
                    onChange={(e) =>
                      updateData((prev) => ({
                        ...prev,
                        otherProfits: prev.otherProfits.map((d) =>
                          d.id === row.id ? { ...d, profit: Number(e.target.value) || 0 } : d
                        ),
                      }))
                    }
                    className="site-input w-24 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateData((prev) => ({
                        ...prev,
                        otherProfits: prev.otherProfits.filter((d) => d.id !== row.id),
                      }))
                    }
                    className="text-slate-500 hover:text-red-400 shrink-0 px-1"
                    aria-label="Remove extra profit"
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
          </div>

          {/* Price list */}
          <section className={LEDGER_SECTION}>
            <div className={LEDGER_SECTION_HEAD}>
              <h3 className={LEDGER_SECTION_TITLE}>
                <span className={LEDGER_SECTION_ACCENT} aria-hidden />
                Resource prices (Purchased Q0)
              </h3>
              <button
                type="button"
                onClick={seedPriceTable}
                className="text-xs text-slate-400 hover:text-orange-300 transition-colors"
              >
                Reset from catalog
              </button>
            </div>
            <p className={LEDGER_INFO_TEXT}>
              Ore and construction salvage defaults: Purchased (Q0) DFP per 100 cSCU yield — profit
              = (yield cSCU ÷ 100) × price. Construction pebbles/rubble/salvage price against
              refined Construction Material. RMC uses direct SCU × per-SCU DFP. Gems: whole gem count
              × per-gem DFP. Override any row manually, or Reset from catalog if values look 100×
              too high.
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-slate-600/50">
                  <th className={`py-1.5 ${LEDGER_TABLE_HEAD}`}>Resource</th>
                  <th className={`py-1.5 ${LEDGER_TABLE_HEAD}`}>Price</th>
                </tr>
              </thead>
              <tbody>
                {ensurePriceOverrides(data, priceOverrideCatalogEntries).map((row) => {
                  const isGem = isGemResource(row.resourceKey)
                  const isRefinableSalvage = isLedgerRefinableSalvageRow(row.resourceKey)
                  const isDirectSalvage = isLedgerDirectSalvageRow(row.resourceKey)
                  const defaultPrice = defaultPricePer100(row.resourceKey, row.resourceLabel)
                  const effective =
                    row.pricePer100 != null && Number.isFinite(row.pricePer100)
                      ? row.pricePer100
                      : defaultPrice
                  return (
                    <tr key={row.resourceKey} className="border-b border-slate-800/40">
                      <td className={`py-1.5 pr-2 font-medium text-slate-200 ${resourceLabelClassName(row.resourceKey)}`}>
                        {row.resourceLabel}
                      </td>
                      <td className="py-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <input
                            type="number"
                            value={row.pricePer100 ?? ''}
                            placeholder={String(Math.round(defaultPrice))}
                            onChange={(e) => {
                              const val = e.target.value
                              updateData((prev) => {
                                const next = ensurePriceOverrides(prev, priceOverrideCatalogEntries).map((p) =>
                                  p.resourceKey === row.resourceKey
                                    ? {
                                        ...p,
                                        pricePer100: val === '' ? null : Number(val) || 0,
                                      }
                                    : p
                                )
                                return { ...prev, priceOverrides: next }
                              })
                            }}
                            className="site-input w-32 px-2 py-0.5 text-xs font-mono text-slate-100"
                            min={0}
                            step={isGem ? 1 : 'any'}
                          />
                          <span className="text-slate-500 tabular-nums text-[10px] font-medium">
                            {isGem
                              ? 'aUEC / gem'
                              : isDirectSalvage
                                ? 'aUEC / SCU'
                                : 'aUEC / 100 cSCU'}
                          </span>
                          {row.pricePer100 == null && (
                            <span className="text-slate-500 tabular-nums text-[10px] italic">
                              default ({Math.round(effective).toLocaleString()}
                              {isRefinableSalvage ? ', refined CM' : ''})
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {showNewModal && (
        <AppModal title="New ledger" onClose={() => setShowNewModal(false)} size="sm">
          <label className="text-xs text-slate-400 block mb-1">Ledger name</label>
          <input
            type="text"
            value={newLedgerName}
            onChange={(e) => setNewLedgerName(e.target.value)}
            placeholder="e.g. March Quantanium run"
            className="site-input w-full px-3 py-2 text-sm mb-4"
            maxLength={120}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="px-3 py-1.5 text-sm text-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreateLedger()}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
            >
              Create
            </button>
          </div>
        </AppModal>
      )}

      {showDeleteModal && (
        <AppModal
          title="Delete ledger"
          subtitle={ledgerName ? `"${ledgerName}"` : undefined}
          onClose={() => setShowDeleteModal(false)}
          size="sm"
        >
          <p className="text-sm text-slate-300 mb-4">
            Permanently delete this ledger from the site? This cannot be undone. Use{' '}
            <strong className="text-white">Export JSON</strong> first if you need a copy.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="px-3 py-1.5 text-sm text-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteLedger()}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              Delete ledger
            </button>
          </div>
        </AppModal>
      )}

      {showCloseModal && (
        <AppModal
          title="Close ledger"
          subtitle="All crew members have been paid"
          onClose={() => {
            setShowCloseModal(false)
            setCloseModalDismissed(true)
          }}
          size="sm"
        >
          <p className="text-sm text-slate-300 mb-4">
            All crew members have been paid. Click OK to close out the ledger. This will download a
            final JSON export and remove the ledger from the site.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCloseModal(false)
                setCloseModalDismissed(true)
              }}
              className="px-3 py-1.5 text-sm text-slate-400"
            >
              Not yet
            </button>
            <button
              type="button"
              onClick={() => void handleCloseConfirm()}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
            >
              OK
            </button>
          </div>
        </AppModal>
      )}

      {showAccessModal && detail && isLedgerCreator && (
        <AppModal
          title="Ledger access"
          subtitle="RSI-verified members only — per-ledger access"
          onClose={() => {
            setShowAccessModal(false)
            setCollabSearch('')
          }}
          size="md"
        >
          <p className="text-xs text-slate-500 mb-3">
            Collaborators can view, edit, and close this ledger. Access does not apply to other
            ledgers.
          </p>
          <label className="text-xs text-slate-400 block mb-1">Add RSI-verified member</label>
          <input
            type="text"
            value={collabSearch}
            onChange={(e) => setCollabSearch(e.target.value)}
            placeholder="Search RSI handle…"
            className="site-input w-full px-3 py-2 text-sm mb-2"
          />
          {collabOptions.length > 0 && (
            <ul className="mb-4 border border-slate-700/50 rounded-lg overflow-hidden">
              {collabOptions.map((member) => {
                const label = member.rsi_handle || member.display_name || 'Unknown'
                const already = detail.collaborators.some((c) => c.user_id === member.id)
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={async () => {
                        const label = member.rsi_handle || member.display_name || 'Unknown'
                        const { error: addError } = await addCollaborator(member.id)
                        if (addError) {
                          setError(addError)
                          return
                        }
                        updateData((prev) => seedCrewMemberOnce(prev, member.id, label))
                        setCollabSearch('')
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-700/80 hover:text-white disabled:text-slate-400 disabled:hover:bg-transparent"
                    >
                      <span className={already ? 'text-slate-400' : 'text-white'}>{label}</span>
                      {already ? (
                        <span className="text-slate-500"> (already added)</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Current access
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="text-slate-100">
              {detail.creator_display ?? 'Creator'}{' '}
              <span className="text-slate-500">(creator)</span>
            </li>
            {detail.collaborators.map((collab) => (
              <li
                key={collab.user_id}
                className="flex items-center justify-between gap-2 text-slate-100"
              >
                <span className="font-medium">
                  {collab.rsi_handle || collab.display_name || collab.user_id}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const { error: removeError } = await removeCollaborator(collab.user_id)
                    if (removeError) setError(removeError)
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
            {detail.collaborators.length === 0 && (
              <li className="text-slate-500 text-xs">No collaborators yet.</li>
            )}
          </ul>
        </AppModal>
      )}

      {importedLedgerView && (
        <ImportedLedgerViewModal
          payload={importedLedgerView.payload}
          computed={importedLedgerView.computed}
          onClose={() => setImportedLedgerView(null)}
        />
      )}
    </div>
  )
}
