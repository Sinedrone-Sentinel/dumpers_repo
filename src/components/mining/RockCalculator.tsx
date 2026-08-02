import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ORE_SIGNATURES } from '../../lib/miningConstants'
import {
  depositTypeLabel,
  getDepositTypes,
  getRockCalculatorLocationOptions,
  resolveRockCalculatorLocationFromEntry,
  getRockCompositionProfile,
  type CompositionPart,
  type DepositType,
} from '../../lib/miningClusterProfiles'
import { normalizeMiningOreName } from '../../lib/handMineables'
import { resolveOcrOreName } from '../../lib/miningOreCanonical'
import type { MiningTrackerEntry } from '../../lib/localGuestCache'
import {
  buildDefaultPercentSlots,
  buildDefaultQualitySlots,
  calculateMaterialDfpValue,
  calculateMaterialScu,
  compositionSlotKey,
  computeDerivedInertPercent,
  formatCompositionRangeHint,
  formatMaterialScu,
  formatRockDfpValue,
  formatRockQualityOptionLabel,
  formatRockQualitySelectTitle,
  formatScannerBandLabel,
  formatScannerBandTooltip,
  isInertElement,
  isPercentOverLimit,
  oreResourceKeyFromElementName,
  parsePercentInput,
  parseQualitySlotValue,
  parseRockPropertyInput,
  parseTotalScuInput,
  sumPercentages,
  withInertCompositionPart,
} from '../../lib/rockCalculator'
import {
  getDefaultBandQuality,
  getLedgerQualityOptions,
  getResourceBands,
  PURCHASED_STOCK_QUALITY,
  resolveLedgerQuality,
} from '../../lib/qualityBands'
import {
  appendCalculatorRowsToLedger,
  buildCalculatorLedgerRows,
  formatCalculatorLedgerMergeMessage,
} from '../../lib/rockCalculatorLedger'
import { fetchMiningLedgers } from '../../lib/miningLedgerOps'
import type { MiningLedgerListItem } from '../../lib/miningLedger'
import { useAuth } from '../../contexts/AuthContext'
import { useResourceCatalog } from '../../hooks/useResourceCatalog'
import { getMineableElementStatHints } from '../../lib/mineableElementStats'
import { buildWindowBarModel } from '../../lib/miningWindowDisplay'
import WindowSizeBar from './WindowSizeBar'
import { formatRequiredPower } from '../../lib/miningBreakability'
import {
  applyGadgetsToRockStats,
  formatGadgetModifierPercent,
  getMiningGadgetsByNames,
  listMiningGadgets,
} from '../../lib/miningGadgets'
import type { RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'
import SiteTooltip from '../SiteTooltip'
import {
  CREW_HEAD_PLAN_BUTTON_TOOLTIP,
  SMART_CRACKER_BUTTON_TOOLTIP,
  SOLO_HEAD_PLAN_BUTTON_TOOLTIP,
} from '../../lib/miningTooltipContent'
import MoleCrewModeCheckbox from './MoleCrewModeCheckbox'

const RS_ORE_NAMES = [...new Set(Object.keys(ORE_SIGNATURES).map(normalizeMiningOreName))].sort(
  (a, b) => a.localeCompare(b)
)

function searchRsOres(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return RS_ORE_NAMES.slice(0, 20)
  return RS_ORE_NAMES.filter((name) => name.toLowerCase().includes(q)).slice(0, 20)
}

interface RockCalculatorProps {
  loadEntry: MiningTrackerEntry | null
  loadToken: number
  onRockTargetChange?: (target: RockBreakabilityTarget) => void
  onOpenSmartCracker?: () => void
  moleCrewModeAvailable?: boolean
  moleCrewMode?: boolean
  onMoleCrewModeChange?: (crew: boolean) => void
  headPlanEnabled?: boolean
  headPlanLabel?: 'CHP' | 'SHP'
  onHeadPlanClick?: () => void
  /** Crew mode: opens the crew head plan for a 2-person or full (3+) crew. */
  onCrewSizeHeadPlanClick?: (size: 2 | 3) => void
}

/** Fixed widths for value columns — material name stacks above % in the first column. */
const MATERIAL_PERCENT_W = 'w-[5rem]'
const MATERIAL_QUALITY_W = 'w-[3.5rem] min-w-[3.5rem]'
const MATERIAL_SCU_W = 'w-[3.25rem]'
const MATERIAL_DFP_W = 'w-[4.75rem]'
const MATERIAL_VALUES_ROW = 'flex items-end justify-end gap-1.5 shrink-0'

export default function RockCalculator({
  loadEntry,
  loadToken,
  onRockTargetChange,
  onOpenSmartCracker,
  moleCrewModeAvailable = false,
  moleCrewMode = false,
  onMoleCrewModeChange,
  headPlanEnabled = false,
  headPlanLabel = 'CHP',
  onHeadPlanClick,
  onCrewSizeHeadPlanClick,
}: RockCalculatorProps) {
  const { user, profile, isGuestPreview } = useAuth()
  const isRsiVerified = Boolean(user && !isGuestPreview && profile?.rsi_handle_verified)
  const { catalog } = useResourceCatalog()

  const [oreName, setOreName] = useState('')
  const [depositType, setDepositType] = useState<DepositType>('asteroid')
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined)
  const [totalScuInput, setTotalScuInput] = useState('')
  const [scannerMassInput, setScannerMassInput] = useState('')
  const [instabilityInput, setInstabilityInput] = useState('')
  const [resistanceInput, setResistanceInput] = useState('')
  const [percentBySlot, setPercentBySlot] = useState<Record<string, string>>({})
  const [qualityBySlot, setQualityBySlot] = useState<Record<string, string>>({})
  const [gadgetSlot1, setGadgetSlot1] = useState('')
  const [gadgetSlot2, setGadgetSlot2] = useState('')

  const [ledgers, setLedgers] = useState<MiningLedgerListItem[]>([])
  const [selectedLedgerId, setSelectedLedgerId] = useState('')
  const [ledgerSaving, setLedgerSaving] = useState(false)
  const [ledgerToast, setLedgerToast] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadEntryRef = useRef(loadEntry)
  loadEntryRef.current = loadEntry

  useEffect(() => {
    if (!loadEntry) return
    const entryDeposit: DepositType =
      loadEntry.depositType === 'asteroid' ? 'asteroid' : 'surface'
    setOreName(loadEntry.oreName)
    setDepositType(entryDeposit)
    setSearchQuery(loadEntry.oreName)
    setTotalScuInput('')
    setScannerMassInput('')
    setInstabilityInput('')
    setResistanceInput('')
  }, [loadEntry, loadToken])

  useEffect(() => {
    if (!isRsiVerified) return
    void fetchMiningLedgers().then(({ data }) => setLedgers(data))
  }, [isRsiVerified])

  useEffect(() => {
    if (!ledgerToast) return
    const timer = window.setTimeout(() => setLedgerToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [ledgerToast])

  const searchOptions = useMemo(() => searchRsOres(searchQuery), [searchQuery])

  const statHints = useMemo(
    () => (oreName ? getMineableElementStatHints(oreName) : { instability: null, resistance: null }),
    [oreName]
  )

  const scannerMass = parseRockPropertyInput(scannerMassInput)
  const scannerResistance = parseRockPropertyInput(resistanceInput)
  const scannerInstability = parseRockPropertyInput(instabilityInput)

  const gadgetOptions = useMemo(() => listMiningGadgets(), [])
  const selectedGadgets = useMemo(
    () => getMiningGadgetsByNames([gadgetSlot1, gadgetSlot2]),
    [gadgetSlot1, gadgetSlot2]
  )
  // Gadgets modify the rock's BASE stats before any head/module math applies.
  const gadgetAdjusted = useMemo(
    () =>
      applyGadgetsToRockStats(
        { resistancePercent: scannerResistance, instability: scannerInstability },
        selectedGadgets
      ),
    [scannerResistance, scannerInstability, selectedGadgets]
  )
  const adjustedResistance = gadgetAdjusted.resistancePercent
  const adjustedInstability = gadgetAdjusted.instability

  const gadgetSummary = useMemo(() => {
    if (!selectedGadgets.length) return null
    const parts: string[] = []
    if (
      scannerResistance != null &&
      adjustedResistance != null &&
      Math.round(scannerResistance) !== Math.round(adjustedResistance)
    ) {
      parts.push(`Res ${Math.round(scannerResistance)}→${Math.round(adjustedResistance)}%`)
    }
    if (
      scannerInstability != null &&
      adjustedInstability != null &&
      Math.round(scannerInstability) !== Math.round(adjustedInstability)
    ) {
      parts.push(`Inst ${Math.round(scannerInstability)}→${Math.round(adjustedInstability)}`)
    }
    return parts.length ? parts.join(' · ') : null
  }, [selectedGadgets, scannerResistance, adjustedResistance, scannerInstability, adjustedInstability])

  const requiredPowerLabel = formatRequiredPower(scannerMass, adjustedResistance, adjustedInstability)
  const windowBarModel = useMemo(() => (oreName ? buildWindowBarModel(oreName) : null), [oreName])

  useEffect(() => {
    setScannerMassInput('')
    setInstabilityInput('')
    setResistanceInput('')
  }, [oreName, depositType, selectedLocation])

  useEffect(() => {
    if (searchFocused && searchRef.current && document.activeElement === searchRef.current) {
      if (searchOptions.length > 0) setSearchOpen(true)
    }
  }, [searchOptions, searchFocused])

  const availableDepositTypes = useMemo(
    () => (oreName ? getDepositTypes(oreName) : []),
    [oreName]
  )

  const locationOptions = useMemo(
    () => (oreName ? getRockCalculatorLocationOptions(oreName, depositType) : []),
    [oreName, depositType]
  )

  useEffect(() => {
    if (locationOptions.length === 0) {
      setSelectedLocation(undefined)
      return
    }

    const match = resolveRockCalculatorLocationFromEntry(
      loadEntryRef.current,
      oreName,
      depositType,
      locationOptions
    )

    setSelectedLocation(match?.value ?? locationOptions[0].value)
  }, [oreName, depositType, loadToken, locationOptions])

  const composition = useMemo(() => {
    if (!oreName || !selectedLocation) return null
    return getRockCompositionProfile(oreName, depositType, {
      profileMode: 'location',
      locationName: selectedLocation,
    })
  }, [oreName, depositType, selectedLocation])

  const calculatorParts = useMemo(() => {
    if (!composition?.compositionParts.length) return []
    return withInertCompositionPart(composition.compositionParts)
  }, [composition?.compositionParts])

  const compositionKey = useMemo(() => {
    if (!calculatorParts.length) return null
    return [
      oreName,
      depositType,
      selectedLocation ?? '',
      calculatorParts.map((p) => p.elementName).join('|'),
    ].join(':')
  }, [calculatorParts, oreName, depositType, selectedLocation])

  useEffect(() => {
    if (!calculatorParts.length) return
    setPercentBySlot(buildDefaultPercentSlots(calculatorParts))
    setQualityBySlot(buildDefaultQualitySlots(calculatorParts))
  }, [compositionKey, loadToken, calculatorParts])

  const totalScu = parseTotalScuInput(totalScuInput)

  const materialRows = useMemo(() => {
    if (!calculatorParts.length) return []

    const baseRows = calculatorParts.map((part, index) => {
      const slotKey = compositionSlotKey(index, part)
      const isInert = isInertElement(part.elementName)
      const percent = isInert ? 0 : parsePercentInput(percentBySlot[slotKey] ?? '0')
      const resourceKey = oreResourceKeyFromElementName(part.elementName)
      const quality = isInert
        ? PURCHASED_STOCK_QUALITY
        : resolveLedgerQuality(
            resourceKey,
            part.elementName,
            parseQualitySlotValue(qualityBySlot[slotKey] ?? '')
          )
      return {
        slotKey,
        part,
        index,
        percent,
        quality,
        isInert,
        label: formatScannerBandLabel(part, index, calculatorParts),
        bandTooltip: formatScannerBandTooltip(part, index, calculatorParts),
        rangeHint: formatCompositionRangeHint(part),
      }
    })

    const valuablePercentTotal = sumPercentages(
      baseRows.filter((row) => !row.isInert).map((row) => row.percent)
    )
    const derivedInertPercent = computeDerivedInertPercent(valuablePercentTotal)

    return baseRows.map((row) => {
      const percent = row.isInert ? derivedInertPercent : row.percent
      const scu = totalScu != null ? calculateMaterialScu(totalScu, percent) : null
      const dfp =
        totalScu != null && scu != null
          ? calculateMaterialDfpValue(row.part.elementName, scu)
          : null
      return { ...row, percent, scu, dfp }
    })
  }, [calculatorParts, percentBySlot, qualityBySlot, totalScu])

  useEffect(() => {
    const valuableMaterials = materialRows
      .filter((row) => !row.isInert && row.percent > 0)
      .map((row) => ({
        elementName: row.part.elementName,
        percent: row.percent,
        quality: row.quality,
        label: row.label,
      }))

    onRockTargetChange?.({
      scannerMass,
      resistancePercent: adjustedResistance,
      instability: adjustedInstability,
      oreName: oreName || null,
      totalScu,
      materials: valuableMaterials.length ? valuableMaterials : null,
      selectedGadgetNames: selectedGadgets.length
        ? selectedGadgets.map((gadget) => gadget.name)
        : null,
    })
  }, [
    scannerMass,
    adjustedResistance,
    adjustedInstability,
    oreName,
    totalScu,
    materialRows,
    selectedGadgets,
    onRockTargetChange,
  ])

  const valuablePercentTotal = sumPercentages(
    materialRows.filter((row) => !row.isInert).map((row) => row.percent)
  )
  const derivedInertPercent = computeDerivedInertPercent(valuablePercentTotal)
  const percentTotal = valuablePercentTotal + derivedInertPercent
  const percentOver = isPercentOverLimit(valuablePercentTotal)

  const hasLedgerRowsToAdd = materialRows.some(
    (row) => !row.isInert && row.percent > 0 && (row.scu ?? 0) > 0
  )
  const canAddToLedger =
    isRsiVerified &&
    selectedLedgerId !== '' &&
    totalScu != null &&
    hasLedgerRowsToAdd &&
    !ledgerSaving

  const handleAddToLedger = useCallback(async () => {
    if (!canAddToLedger) return
    setLedgerSaving(true)
    setLedgerToast(null)

    const rows = buildCalculatorLedgerRows(
      materialRows.map((row) => ({
        elementName: row.part.elementName,
        scu: row.scu ?? 0,
        percent: row.percent,
        quality: row.quality,
      })),
      catalog
    )

    const { error, mergedCount, addedCount } = await appendCalculatorRowsToLedger(
      selectedLedgerId,
      rows
    )
    setLedgerSaving(false)

    if (error) {
      setLedgerToast(error)
      return
    }
    setLedgerToast(formatCalculatorLedgerMergeMessage(mergedCount, addedCount))
  }, [canAddToLedger, materialRows, catalog, selectedLedgerId])

  const handleSelectOre = (name: string) => {
    setOreName(name)
    setSearchQuery(name)
    setSearchOpen(false)
    setTotalScuInput('')
    setScannerMassInput('')
    setInstabilityInput('')
    setResistanceInput('')
    const types = getDepositTypes(name)
    if (types.length === 1) {
      setDepositType(types[0])
    } else if (!types.includes(depositType)) {
      setDepositType(types.includes('asteroid') ? 'asteroid' : types[0] ?? 'asteroid')
    }
  }

  const handleDepositTypeChange = (next: DepositType) => {
    setDepositType(next)
  }

  const showDepositToggle = availableDepositTypes.length > 1
  const selectedLocationLabel =
    locationOptions.find((opt) => opt.value === selectedLocation)?.label ?? composition?.sourceLabel

  return (
    <aside className="w-full shrink-0">
      <div className="site-surface overflow-hidden">
        <div className="px-3 py-2.5 bg-orange-950/20 border-b border-orange-500/15 min-h-[3.25rem]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Rock Calculator
              </p>
              {moleCrewModeAvailable && onMoleCrewModeChange ? (
                <MoleCrewModeCheckbox
                  crewMode={moleCrewMode}
                  onCrewModeChange={onMoleCrewModeChange}
                />
              ) : null}
              {oreName ? (
                <>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-white leading-tight">{oreName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 uppercase tracking-wide">
                      {depositTypeLabel(depositType)}
                    </span>
                  </div>
                  {selectedLocationLabel ? (
                    <p
                      className="text-[11px] text-slate-500 mt-0.5 truncate"
                      title={selectedLocationLabel}
                    >
                      {selectedLocationLabel}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            {onOpenSmartCracker ? (
              <div className="flex flex-col items-end gap-1 shrink-0">
                <SiteTooltip
                  content={SMART_CRACKER_BUTTON_TOOLTIP}
                  side="left"
                  panelClassName="max-w-[16rem]"
                >
                  <button
                    type="button"
                    onClick={onOpenSmartCracker}
                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-orange-600/90 text-white hover:bg-orange-500 transition-colors"
                  >
                    Smart Cracker
                  </button>
                </SiteTooltip>
                <div className="flex items-center justify-end gap-1">
                  {headPlanLabel === 'CHP' && onCrewSizeHeadPlanClick ? (
                    <SiteTooltip
                      content={CREW_HEAD_PLAN_BUTTON_TOOLTIP}
                      side="left"
                      panelClassName="max-w-[16rem]"
                    >
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onCrewSizeHeadPlanClick(2)}
                          disabled={!headPlanEnabled}
                          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/50 transition-colors border border-cyan-800/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-cyan-950/50"
                        >
                          2X CHP
                        </button>
                        <button
                          type="button"
                          onClick={() => onCrewSizeHeadPlanClick(3)}
                          disabled={!headPlanEnabled}
                          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/50 transition-colors border border-cyan-800/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-cyan-950/50"
                        >
                          3X+ CHP
                        </button>
                      </span>
                    </SiteTooltip>
                  ) : onHeadPlanClick ? (
                    <SiteTooltip
                      content={
                        headPlanLabel === 'SHP'
                          ? SOLO_HEAD_PLAN_BUTTON_TOOLTIP
                          : CREW_HEAD_PLAN_BUTTON_TOOLTIP
                      }
                      side="left"
                      panelClassName="max-w-[16rem]"
                    >
                      <button
                        type="button"
                        onClick={onHeadPlanClick}
                        disabled={!headPlanEnabled}
                        className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/50 transition-colors border border-cyan-800/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-cyan-950/50"
                      >
                        {headPlanLabel}
                      </button>
                    </SiteTooltip>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-3 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Ore &amp; location
            </label>
            <div className="flex gap-1.5 overflow-visible">
              <div className="relative flex-1 min-w-0 overflow-visible">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    const exact = RS_ORE_NAMES.find(
                      (name) => name.toLowerCase() === e.target.value.trim().toLowerCase()
                    )
                    if (exact) handleSelectOre(exact)
                  }}
                  onFocus={(e) => {
                    setSearchFocused(true)
                    if (e.isTrusted && searchOptions.length > 0) setSearchOpen(true)
                  }}
                  onBlur={() => {
                    setSearchFocused(false)
                    window.setTimeout(() => {
                      setSearchOpen(false)
                      if (oreName) setSearchQuery(oreName)
                    }, 150)
                  }}
                  placeholder="Search ore..."
                  className="site-input w-full px-2 py-1.5 text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
                {searchOpen && searchOptions.length > 0 && (
                  <ul className="site-dropdown-list left-0 right-0 w-auto max-h-48 overscroll-contain">
                    {searchOptions.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          className="site-dropdown-item px-2 py-1.5"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectOre(name)}
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <select
                value={selectedLocation ?? ''}
                onChange={(e) => setSelectedLocation(e.target.value)}
                disabled={!oreName || locationOptions.length === 0}
                className="site-input w-[6.75rem] shrink-0 px-1.5 py-1.5 text-xs truncate disabled:opacity-40"
                title="Spawn location"
                aria-label="Spawn location"
              >
                {locationOptions.length === 0 ? (
                  <option value="">—</option>
                ) : (
                  locationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {isRsiVerified && (
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                Mining ledger
              </label>
              <div className="flex gap-1.5">
                <select
                  value={selectedLedgerId}
                  onChange={(e) => setSelectedLedgerId(e.target.value)}
                  className="site-input flex-1 min-w-0 px-1.5 py-1.5 text-xs truncate"
                  aria-label="Select mining ledger"
                >
                  <option value="">No Ledger Selected</option>
                  {ledgers.map((ledger) => (
                    <option key={ledger.id} value={ledger.id}>
                      {ledger.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleAddToLedger()}
                  disabled={!canAddToLedger}
                  className="shrink-0 px-2 py-1.5 text-[10px] font-semibold rounded-md bg-orange-600/90 text-white hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {ledgerSaving ? 'Adding…' : 'Add to Ledger'}
                </button>
              </div>
              {ledgerToast ? (
                <p
                  className={`mt-1 text-[10px] ${
                    /^(Added|Merged)/.test(ledgerToast) ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {ledgerToast}
                </p>
              ) : null}
            </div>
          )}

          {showDepositToggle && (
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                Deposit type
              </label>
              <div className="site-chip-strip gap-1 p-0.5">
                {availableDepositTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleDepositTypeChange(type)}
                    className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      depositType === type
                        ? 'site-filter-selected-orange'
                        : 'site-filter-idle'
                    }`}
                  >
                    {depositTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {oreName ? (
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Scanner rock stats
                </label>
                <div className="mb-2">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] text-slate-400">Gadgets in use</span>
                    {gadgetSummary ? (
                      <span
                        className="text-[9px] text-cyan-300/90 tabular-nums truncate"
                        title="Rock base stats after gadgets"
                      >
                        {gadgetSummary}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-1.5">
                    <GadgetSelect
                      value={gadgetSlot1}
                      otherValue={gadgetSlot2}
                      options={gadgetOptions}
                      onChange={setGadgetSlot1}
                      ariaLabel="First mining gadget"
                    />
                    <GadgetSelect
                      value={gadgetSlot2}
                      otherValue={gadgetSlot1}
                      options={gadgetOptions}
                      onChange={setGadgetSlot2}
                      ariaLabel="Second mining gadget"
                    />
                  </div>
                </div>
                <span className="block text-[10px] text-slate-400 mb-0.5">Mass</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={scannerMassInput}
                  onChange={(e) => setScannerMassInput(e.target.value)}
                  placeholder="124756"
                  className="site-input w-full px-2 py-1.5 text-sm font-mono tabular-nums"
                  aria-label="Rock mass from scanner"
                />
              </div>
              <div className="flex gap-1.5">
                <div className="flex-1 min-w-0">
                  <span className="block text-[10px] text-slate-400 mb-0.5">Instability</span>
                  {statHints.instability ? (
                    <span
                      className="block text-[9px] leading-tight text-slate-500 tabular-nums mb-0.5"
                      title="Expected instability from game data"
                    >
                      Exp. {statHints.instability}
                    </span>
                  ) : null}
                  <input
                    type="number"
                    step={0.01}
                    inputMode="decimal"
                    value={instabilityInput}
                    onChange={(e) => setInstabilityInput(e.target.value)}
                    placeholder="952.25"
                    className="site-input w-full px-2 py-1.5 text-sm font-mono tabular-nums"
                    aria-label="Rock instability from scanner"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-[10px] text-slate-400 mb-0.5">Resistance (%)</span>
                  {statHints.resistance ? (
                    <span
                      className="block text-[9px] leading-tight text-slate-500 tabular-nums mb-0.5"
                      title="Expected resistance from game data (HUD % scale)"
                    >
                      Exp. {statHints.resistance}%
                    </span>
                  ) : null}
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={resistanceInput}
                      onChange={(e) => setResistanceInput(e.target.value)}
                      placeholder="50"
                      className="site-input w-full px-2 py-1.5 pr-6 text-sm font-mono tabular-nums"
                      aria-label="Rock resistance percent from scanner"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </div>
              {requiredPowerLabel ? (
                <p className="text-[11px] text-cyan-300/90 font-medium tabular-nums">
                  Power required {requiredPowerLabel}
                </p>
              ) : null}
              {windowBarModel ? (
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Estimated window size
                  </p>
                  <WindowSizeBar model={windowBarModel} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Total rock SCU
            </label>
            <input
              type="number"
              min={0}
              step={0.001}
              inputMode="decimal"
              value={totalScuInput}
              onChange={(e) => setTotalScuInput(e.target.value)}
              placeholder="0.000"
              className="site-input w-full px-2 py-1.5 text-sm font-mono tabular-nums"
            />
          </div>

          {oreName && selectedLocation && !calculatorParts.length ? (
            <p className="text-xs text-slate-500 py-2">
              No composition data for this profile.
            </p>
          ) : null}

          {materialRows.length > 0 ? (
            <div className="space-y-2">
              <div
                className={`${MATERIAL_VALUES_ROW} text-[9px] uppercase tracking-wide text-slate-600`}
              >
                <span className={`${MATERIAL_PERCENT_W} text-left`}>Material</span>
                <span className={`${MATERIAL_QUALITY_W} text-center`}>Q</span>
                <span className={`${MATERIAL_SCU_W} text-right`}>cSCU</span>
                <span className={`${MATERIAL_DFP_W} text-right`}>DFP</span>
              </div>
              <ul className="space-y-2">
                {materialRows.map((row) => (
                  <li key={row.slotKey}>
                    <div className={MATERIAL_VALUES_ROW}>
                      <div className={`${MATERIAL_PERCENT_W} shrink-0 space-y-0.5`}>
                        <span
                          className="block text-[10px] leading-tight text-slate-200 truncate"
                          title={
                            row.bandTooltip
                              ? `${row.label} (${row.bandTooltip})`
                              : row.label
                          }
                        >
                          {row.label}
                        </span>
                        {row.rangeHint ? (
                          <span
                            className="block text-[9px] leading-tight text-slate-500 tabular-nums"
                            title="Typical composition range for this material"
                          >
                            {row.rangeHint}
                          </span>
                        ) : null}
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            inputMode="decimal"
                            value={
                              row.isInert
                                ? row.percent.toFixed(1)
                                : (percentBySlot[row.slotKey] ?? '0')
                            }
                            readOnly={row.isInert}
                            disabled={row.isInert}
                            onChange={
                              row.isInert
                                ? undefined
                                : (e) =>
                                    setPercentBySlot((prev) => ({
                                      ...prev,
                                      [row.slotKey]: e.target.value,
                                    }))
                            }
                            className={`site-input w-full px-1 py-1 pr-3.5 text-[10px] font-mono tabular-nums text-right ${
                              row.isInert ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                            aria-label={
                              row.isInert
                                ? `${row.label} percentage (auto-calculated)`
                                : `${row.label} percentage`
                            }
                            title={
                              row.isInert
                                ? 'Auto-calculated as 100% minus other materials'
                                : undefined
                            }
                          />
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">
                            %
                          </span>
                        </div>
                      </div>
                      <div className={`${MATERIAL_QUALITY_W} shrink-0`}>
                        <MaterialQualitySelect
                          elementName={row.part.elementName}
                          value={String(row.quality)}
                          onChange={(next) =>
                            setQualityBySlot((prev) => ({ ...prev, [row.slotKey]: next }))
                          }
                          isInert={row.isInert}
                        />
                      </div>
                      <span
                        className={`${MATERIAL_SCU_W} text-right text-[10px] font-mono tabular-nums text-amber-300 shrink-0 pb-1`}
                        title="cSCU in rock"
                      >
                        {totalScu != null ? formatMaterialScu(row.scu ?? 0) : '—'}
                      </span>
                      <span
                        className={`${MATERIAL_DFP_W} text-right text-[10px] font-mono tabular-nums text-emerald-300 shrink-0 pb-1`}
                        title="Purchased Q0 DFP"
                      >
                        {totalScu != null ? formatRockDfpValue(row.dfp ?? 0) : '—'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-600">
                DFP uses Purchased (Q0) catalog prices. Q band applies to ledger export only
                (Band 2 default; matching ore + quality merges cSCU). Inert % is auto-calculated
                and is not added to the ledger.
              </p>
            </div>
          ) : null}

          {materialRows.length > 0 && (
            <div
              className={`pt-2 border-t border-slate-800 text-xs ${
                percentOver ? 'text-red-400' : 'text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>Total entered</span>
                <span className="font-mono tabular-nums font-medium">
                  {percentTotal.toFixed(1)}%
                </span>
              </div>
              {!percentOver && derivedInertPercent > 0 ? (
                <p className="mt-1 text-slate-500">
                  Inert auto: {derivedInertPercent.toFixed(1)}%
                </p>
              ) : null}
              {percentOver ? (
                <p className="mt-1 text-red-400/90">
                  Material percentages exceed 100% — check your scan values.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function formatGadgetEffect(gadget: {
  resistanceModifier: number
  instabilityModifier: number
}): string {
  const parts: string[] = []
  if (gadget.resistanceModifier !== 0) {
    parts.push(`${formatGadgetModifierPercent(gadget.resistanceModifier)} resist`)
  }
  if (gadget.instabilityModifier !== 0) {
    parts.push(`${formatGadgetModifierPercent(gadget.instabilityModifier)} instab`)
  }
  return parts.join(', ')
}

interface GadgetSelectProps {
  value: string
  otherValue: string
  options: ReturnType<typeof listMiningGadgets>
  onChange: (value: string) => void
  ariaLabel: string
}

function GadgetSelect({ value, otherValue, options, onChange, ariaLabel }: GadgetSelectProps) {
  const selected = options.find((gadget) => gadget.name === value)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="site-input flex-1 min-w-0 px-1.5 py-1.5 text-xs truncate"
      aria-label={ariaLabel}
      title={selected ? `${selected.displayName}: ${formatGadgetEffect(selected)}` : 'No gadget'}
    >
      <option value="">None</option>
      {options.map((gadget) => (
        <option
          key={gadget.name}
          value={gadget.name}
          disabled={gadget.name === otherValue && otherValue !== ''}
        >
          {gadget.displayName}
        </option>
      ))}
    </select>
  )
}

const MATERIAL_QUALITY_SELECT_CLASS =
  'site-input w-full min-w-0 px-1 py-1 text-[10px] font-mono text-center tabular-nums'

const MATERIAL_QUALITY_INPUT_CLASS =
  'site-input w-full min-w-0 px-1 py-1 text-[10px] font-mono text-center tabular-nums'

interface MaterialQualitySelectProps {
  elementName: string
  value: string
  onChange: (value: string) => void
  isInert?: boolean
}

function MaterialQualitySelect({
  elementName,
  value,
  onChange,
  isInert = false,
}: MaterialQualitySelectProps) {
  if (isInert) {
    return (
      <select
        value={String(PURCHASED_STOCK_QUALITY)}
        disabled
        className={`${MATERIAL_QUALITY_SELECT_CLASS} opacity-60 cursor-not-allowed`}
        aria-label="Inert quality (not applicable)"
        title="Purchased (Q0)"
      >
        <option value={PURCHASED_STOCK_QUALITY}>
          {formatRockQualityOptionLabel(PURCHASED_STOCK_QUALITY)}
        </option>
      </select>
    )
  }

  const canonicalElement = resolveOcrOreName(elementName).name
  const resourceKey = oreResourceKeyFromElementName(canonicalElement)
  const qualityOptions = getLedgerQualityOptions(resourceKey, canonicalElement)
  const parsed = Number.parseInt(value, 10)
  const resolvedQuality = Number.isFinite(parsed)
    ? resolveLedgerQuality(resourceKey, canonicalElement, parsed)
    : getDefaultBandQuality(canonicalElement)
  const resolvedValue = String(resolvedQuality)
  const title = formatRockQualitySelectTitle(resolvedQuality)

  if (qualityOptions.length > 0 && getResourceBands(canonicalElement)) {
    return (
      <select
        value={resolvedValue}
        onChange={(e) => onChange(e.target.value)}
        className={MATERIAL_QUALITY_SELECT_CLASS}
        aria-label={`${elementName} quality`}
        title={title}
      >
        {qualityOptions.map((qualityOption) => (
          <option key={qualityOption} value={qualityOption}>
            {formatRockQualityOptionLabel(qualityOption)}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      type="number"
      min={0}
      max={1000}
      step={1}
      value={resolvedValue}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') {
          onChange('0')
          return
        }
        const parsedInput = Number.parseInt(raw, 10)
        if (!Number.isFinite(parsedInput)) return
        onChange(String(Math.min(1000, Math.max(0, parsedInput))))
      }}
      className={MATERIAL_QUALITY_INPUT_CLASS}
      aria-label={`${elementName} quality (0–1000)`}
      title="No game Q bands for this resource — enter Q0–Q1000"
    />
  )
}
