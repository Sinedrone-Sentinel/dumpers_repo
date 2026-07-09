import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { setAnalyticsSubTool } from '../lib/analytics'
import { useMiningData, type MiningData } from '../hooks/useArchiveData'
import { useMiningTracker } from '../hooks/useMiningTracker'
import { useAuth } from '../contexts/AuthContext'
import { findOreByName, countGuideRarityBucket, buildLocationOresMap } from '../lib/miningDataHelpers'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import {
  LOCATION_SYSTEMS,
  MINING_RARITY_COLORS,
  MINING_RARITY_LABELS,
  MINING_RARITY_ORDER,
  MINING_SYSTEM_COLORS,
  ORE_SIGNATURES,
} from '../lib/miningConstants'
import {
  formatRsReading,
  getOreBaseSignature,
} from '../lib/miningSignatures'
import {
  depositTypeLabel,
  depositTypeUpper,
  getDepositTypes,
  getGuideLocationProfiles,
  getLocationProfile,
  getLocationSpawnTag,
  getOverallProfile,
  getOverallSpawnTag,
  getTrackerProfile,
  getTrackerProfileMissingMessage,
  getTrackerSubtitle,
  isLocationTrackerEntry,
} from '../lib/miningClusterProfiles'
import { isBroadGuideLocation } from '../lib/miningLocationAliases'
import TrackOreButtons from '../components/TrackOreButton'
import SiteTooltip from '../components/SiteTooltip'
import MiningLedgerTab from '../components/mining/MiningLedgerTab'
import { fetchMiningLedgerSiteStats, type MiningLedgerSiteStats } from '../lib/miningLedgerOps'
import { formatLedgerSiteStatsMessage } from '../lib/miningLedger'
import RockCalculator from '../components/mining/RockCalculator'
import {
  guideLocationChipTooltip,
  guideLocationOreTooltip,
  guideOreModalLocationTooltip,
  guideOreTitleTooltip,
  oreMineableStatsTooltipBlock,
  trackerCardTooltip,
  trackerChanceTooltip,
} from '../lib/miningTooltipContent'
import {
  getGuideLocationSpawnLabel,
  isGuideLocationListOnlyOre,
  isHandMineableType,
  matchesGuideRarityFilter,
  rsTrackerCardUnmappedNote,
} from '../lib/handMineables'
import { formatHandMineableHabitatAtSite } from '../lib/handMineableHabitats'
import type { DepositType, MiningTrackerEntry } from '../lib/localGuestCache'

type ViewMode = 'tracker' | 'guide' | 'ledger'

const miningTrackerRoute = getRouteApi('/mining-tracker')

export default function MiningTrackerRoute() {
  const { isGuestPreview } = useAuth()
  const { data, loading, error, refetch } = useMiningData()
  const { entries, addEntry, removeEntry, clearAll, isTracked } = useMiningTracker()
  const search = miningTrackerRoute.useSearch()

  const [viewMode, setViewMode] = useState<ViewMode>('tracker')
  const [oreSearch, setOreSearch] = useState('')
  const [selectedOreName, setSelectedOreName] = useState<string>('')
  const [listRarityFilter, setListRarityFilter] = useState<string>('')
  const [calculatorEntryId, setCalculatorEntryId] = useState<string | null>(null)
  const [calculatorLoadEntry, setCalculatorLoadEntry] = useState<MiningTrackerEntry | null>(null)
  const [calculatorLoadToken, setCalculatorLoadToken] = useState(0)
  
  // Guide view state
  const [guideRarityFilter, setGuideRarityFilter] = useState<string | null>(null)
  const [guideSearch, setGuideSearch] = useState('')
  const [guideViewMode, setGuideViewMode] = useState<'ores' | 'locations'>('ores')
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [selectedOre, setSelectedOre] = useState<MiningData | null>(null)
  const [selectedOreGuideLocation, setSelectedOreGuideLocation] = useState<string | null>(null)
  const [ledgerSiteStats, setLedgerSiteStats] = useState<MiningLedgerSiteStats | null>(null)

  const refreshLedgerSiteStats = useCallback(async () => {
    if (isGuestPreview) return
    const { data: stats } = await fetchMiningLedgerSiteStats()
    if (stats) setLedgerSiteStats(stats)
  }, [isGuestPreview])

  const openOreModal = useCallback((ore: MiningData, guideLocation?: string) => {
    setSelectedOre(ore)
    setSelectedOreGuideLocation(guideLocation ?? null)
  }, [])

  const closeOreModal = useCallback(() => {
    setSelectedOre(null)
    setSelectedOreGuideLocation(null)
  }, [])

  const allOreNames = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    return data
      .filter((o) => {
        if (seen.has(o.ore_name)) return false
        seen.add(o.ore_name)
        return getOreBaseSignature(o.ore_name) !== undefined
      })
      .sort((a, b) => a.ore_name.localeCompare(b.ore_name))
  }, [data])

  const searchOreResults = useMemo(() => {
    if (!data || oreSearch.length < 2) return []
    const term = oreSearch.toLowerCase()
    return allOreNames
      .filter((o) => o.ore_name.toLowerCase().includes(term))
      .slice(0, 15)
  }, [data, oreSearch, allOreNames])

  useEffect(() => {
    if (search.view === 'tracker') {
      setViewMode('tracker')
      setOreSearch('')
      setSelectedOreName('')
    } else if (search.view === 'guide') {
      setViewMode('guide')
    } else if (search.view === 'ledger') {
      setViewMode('ledger')
    }
  }, [search.view])

  useEffect(() => {
    const subTool =
      viewMode === 'guide' ? 'mining_guide' : viewMode === 'ledger' ? 'ledger' : 'rs_tracker'
    setAnalyticsSubTool(subTool)
  }, [viewMode])

  useEffect(() => {
    if (viewMode !== 'ledger' || isGuestPreview) return
    void refreshLedgerSiteStats()
  }, [viewMode, isGuestPreview, refreshLedgerSiteStats])

  useEffect(() => {
    if (!search.ore || !data || search.add !== true) return
    const ore = findOreByName(data, search.ore)
    if (!ore) return
    if (getOreBaseSignature(ore.ore_name) === undefined) return

    const types = getDepositTypes(ore.ore_name)
    const depositType = types.includes('surface') ? 'surface' : types[0]
    if (depositType && !isTracked(ore.ore_name, depositType)) {
      addEntry(ore.ore_name, ore.rarity, { depositType, profileMode: 'overall' })
    }
  }, [search.ore, search.add, data, addEntry, isTracked])

  const selectedOreData = useMemo(() => {
    if (!data) return null
    const name = selectedOreName || oreSearch
    if (!name) return null
    return findOreByName(data, name) ?? searchOreResults.find((o) => o.ore_name === name) ?? null
  }, [data, selectedOreName, oreSearch, searchOreResults])

  const untrackedDepositTypes = useMemo((): DepositType[] => {
    if (!selectedOreData) return []
    return getDepositTypes(selectedOreData.ore_name).filter(
      (type) => !isTracked(selectedOreData.ore_name, type)
    )
  }, [selectedOreData, isTracked])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (listRarityFilter && entry.rarity !== listRarityFilter) return false
      return true
    })
  }, [entries, listRarityFilter])

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => b.addedAt - a.addedAt)
  }, [filteredEntries])

  // Guide view computed data
  const groupedByRarity = useMemo(() => {
    if (!data) return {}
    return data.reduce<Record<string, MiningData[]>>((acc, item) => {
      if (!acc[item.rarity]) acc[item.rarity] = []
      acc[item.rarity].push(item)
      return acc
    }, {})
  }, [data])

  const locationOresMap = useMemo(() => buildLocationOresMap(data ?? []), [data])

  const allLocations = useMemo(() => {
    return Object.keys(locationOresMap).sort((a, b) => {
      const sysA = LOCATION_SYSTEMS[a] || 'Unknown'
      const sysB = LOCATION_SYSTEMS[b] || 'Unknown'
      if (sysA !== sysB) return sysA.localeCompare(sysB)
      return a.localeCompare(b)
    })
  }, [locationOresMap])

  const guideFilteredData = useMemo(() => {
    let filtered = data || []
    if (guideRarityFilter) {
      filtered = filtered.filter((item) =>
        matchesGuideRarityFilter(item.ore_name, item.rarity, guideRarityFilter)
      )
    }
    if (guideSearch) {
      const term = guideSearch.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.ore_name.toLowerCase().includes(term) ||
          item.locations?.some((loc) => loc.toLowerCase().includes(term))
      )
    }
    return filtered
  }, [data, guideRarityFilter, guideSearch])

  const guideFilteredLocations = useMemo(() => {
    if (!guideSearch) return allLocations
    const term = guideSearch.toLowerCase()
    return allLocations.filter(loc => 
      loc.toLowerCase().includes(term) ||
      locationOresMap[loc]?.some(ore => ore.ore_name.toLowerCase().includes(term))
    )
  }, [allLocations, locationOresMap, guideSearch])

  return (
    <FeaturePageLayout
      title="Mining Tracker"
      subtitle={
        viewMode === 'tracker'
          ? 'Cluster RS reference with spawn-weighted chance % for ores you are hunting.'
          : viewMode === 'guide'
            ? 'Browse all ores by rarity or find ores at specific locations.'
            : 'Track mining crew shares, payouts, and paid status for your runs.'
      }
      badge={isGuestPreview ? 'Local only' : undefined}
      meta={
        viewMode === 'tracker' ? (
          isGuestPreview ? (
            <span className="text-amber-400/90">
              Tracked ores save in this browser only. Sign in for acquired blueprint tracking and more.
            </span>
          ) : (
            <span>
              Base RS plus cluster rows with Chance % from game spawn data. Cluster RS = node count × base RS.
            </span>
          )
        ) : (
          <span>
            Use the Track button to add ores to your tracker. Only ores with mining signatures can be tracked.
          </span>
        )
      }
      actions={
        <div className="flex items-center gap-3">
          {viewMode === 'tracker' && entries.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-600/50 text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      }
    >
      {/* View Mode Switcher */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-lg w-fit">
          <button
            onClick={() => setViewMode('tracker')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
              viewMode === 'tracker' 
                ? 'site-filter-selected-orange' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            RS Tracker
          </button>
          <button
            onClick={() => setViewMode('guide')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
              viewMode === 'guide' 
                ? 'site-filter-selected-orange' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Mining Guide
          </button>
          <button
            onClick={() => setViewMode('ledger')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
              viewMode === 'ledger'
                ? 'site-filter-selected-orange'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Ledgers
          </button>
        </div>
        {viewMode === 'ledger' && ledgerSiteStats && !isGuestPreview && (
          <p className="text-sm text-amber-200/95 font-medium tracking-wide max-w-3xl">
            {formatLedgerSiteStatsMessage(ledgerSiteStats)}
          </p>
        )}
      </div>
      {loading && viewMode !== 'ledger' && (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {error && viewMode !== 'ledger' && (
        <div className="text-center py-12">
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && viewMode === 'tracker' && (
        <div className="flex gap-6 items-start min-w-[760px]">
          <div className="flex-1 min-w-0 space-y-6">
          <section className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <input
                type="text"
                value={oreSearch}
                onChange={(e) => {
                  setOreSearch(e.target.value)
                  setSelectedOreName('')
                }}
                placeholder="Search ore to add..."
                className="site-input w-full px-3 py-2 text-sm"
              />
              {oreSearch.length >= 2 && searchOreResults.length > 0 && (
                <select
                  value={selectedOreName}
                  onChange={(e) => setSelectedOreName(e.target.value)}
                  className="site-input w-full px-3 py-1.5 text-sm mt-1"
                  size={Math.min(searchOreResults.length + 1, 6)}
                >
                  <option value="">Select ore...</option>
                  {searchOreResults.map((ore) => {
                    const types = getDepositTypes(ore.ore_name)
                    const allTracked = types.length > 0 && types.every((t) => isTracked(ore.ore_name, t))
                    return (
                      <option key={ore.id} value={ore.ore_name} disabled={allTracked}>
                        {ore.ore_name} ({MINING_RARITY_LABELS[ore.rarity] ?? ore.rarity})
                        {allTracked ? ' — all tracked' : ''}
                      </option>
                    )
                  })}
                </select>
              )}
              {oreSearch.length >= 2 && searchOreResults.length === 0 && (
                <p className="text-xs text-slate-500 mt-1">No matches</p>
              )}
            </div>
            {selectedOreData && untrackedDepositTypes.length > 0 && (
              <TrackOreButtons oreName={selectedOreData.ore_name} rarity={selectedOreData.rarity} />
            )}
            {selectedOreData && untrackedDepositTypes.length === 0 && getDepositTypes(selectedOreData.ore_name).length > 0 && (
              <span className="text-xs text-slate-500 self-center">All deposit types tracked</span>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">
                Tracked ({sortedEntries.length}{sortedEntries.length !== entries.length ? `/${entries.length}` : ''})
              </h2>
              {entries.length > 0 && (
                <select
                  value={listRarityFilter}
                  onChange={(e) => setListRarityFilter(e.target.value)}
                  className="site-input px-2 py-1 text-xs"
                >
                  <option value="">All</option>
                  {MINING_RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {MINING_RARITY_LABELS[r]}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {sortedEntries.length === 0 ? (
              <div className="text-center py-6 rounded-lg border border-dashed border-slate-700/50">
                <p className="text-slate-500 text-sm">
                  {entries.length === 0 ? (
                    <>
                      No ores tracked.{' '}
                      <button
                        type="button"
                        onClick={() => setViewMode('guide')}
                        className="text-orange-400 hover:text-orange-300 underline"
                      >
                        Browse Mining Guide
                      </button>
                    </>
                  ) : (
                    'No entries match filter.'
                  )}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {sortedEntries.map((entry) => {
                  const colors = MINING_RARITY_COLORS[entry.rarity] || MINING_RARITY_COLORS.common
                  const display = getTrackerProfile(entry)
                  const subtitle = getTrackerSubtitle(entry)
                  const missingMessage = getTrackerProfileMissingMessage(entry)
                  const isLocationEntry = isLocationTrackerEntry(entry)

                  return (
                    <SiteTooltip
                      key={entry.id}
                      content={trackerCardTooltip(entry)}
                      side="bottom"
                      className="block"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setCalculatorEntryId(entry.id)
                          setCalculatorLoadEntry(entry)
                          setCalculatorLoadToken((t) => t + 1)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setCalculatorEntryId(entry.id)
                            setCalculatorLoadEntry(entry)
                            setCalculatorLoadToken((t) => t + 1)
                          }
                        }}
                        className={`p-4 rounded-xl border w-56 text-left relative cursor-pointer transition-shadow hover:brightness-110 ${colors.bg} ${colors.border} ${
                          calculatorEntryId === entry.id ? 'ring-2 ring-orange-400 ring-offset-1 ring-offset-slate-950' : ''
                        }`}
                        title="Load in Rock Calculator"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeEntry(entry.id)
                          }}
                          className="absolute top-2 right-2 p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800/60 rounded-lg transition-colors"
                          aria-label="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>

                        <div className="mb-3 pr-6">
                          <span className={`text-lg font-semibold ${colors.text}`}>
                            {entry.oreName}
                          </span>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                            {depositTypeUpper(entry.depositType)} · {MINING_RARITY_LABELS[entry.rarity] ?? entry.rarity}
                          </div>
                          {isLocationEntry && entry.locationName ? (
                            <div className="text-xs font-medium text-orange-300/90 mt-1">
                              At {entry.locationName}
                            </div>
                          ) : null}
                          <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div>
                        </div>

                        {display ? (
                          <div className="space-y-1">
                            <div className="text-2xl font-bold font-mono text-amber-300 tabular-nums">
                              {formatRsReading(display.baseRs)}
                            </div>
                            {display.rows.map((row) => (
                              <SiteTooltip
                                key={row.nodes}
                                content={trackerChanceTooltip(entry, row.nodes, row.rs, row.chancePercent)}
                                side="right"
                                className="block w-full"
                              >
                                <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                                  <span className="text-xl font-bold text-amber-300/90">
                                    {formatRsReading(row.rs)}
                                  </span>
                                  <span className="text-sm text-slate-400 shrink-0">
                                    {typeof row.chancePercent === 'number'
                                      ? `${row.chancePercent.toFixed(row.chancePercent % 1 === 0 ? 0 : 1)}%`
                                      : '—'}
                                  </span>
                                </div>
                              </SiteTooltip>
                            ))}
                          </div>
                        ) : isHandMineableType(entry.oreName) || !ORE_SIGNATURES[entry.oreName] ? (
                          <p className="text-xs text-slate-500">
                            {rsTrackerCardUnmappedNote(entry.oreName)}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {missingMessage ?? 'Spawn profile not on file'}
                          </p>
                        )}
                      </div>
                    </SiteTooltip>
                  )
                })}
              </div>
            )}
          </section>
          </div>

          <RockCalculator loadEntry={calculatorLoadEntry} loadToken={calculatorLoadToken} />
        </div>
      )}

      {viewMode === 'ledger' && (
        <MiningLedgerTab
          isGuestPreview={isGuestPreview}
          onLedgerArchived={refreshLedgerSiteStats}
        />
      )}

      {/* Mining Guide View */}
      {!loading && !error && data && viewMode === 'guide' && (
        <div className="space-y-6">
          {/* Guide view mode toggle */}
          <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-lg w-fit">
            <button
              onClick={() => setGuideViewMode('ores')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
                guideViewMode === 'ores' 
                  ? 'site-filter-selected-slate' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              By Ore
            </button>
            <button
              onClick={() => setGuideViewMode('locations')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
                guideViewMode === 'locations' 
                  ? 'site-filter-selected-slate' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              By Location
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={guideViewMode === 'ores' ? "Search ores or locations..." : "Search locations or ores..."}
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
                className="site-input w-full pl-9 pr-4 py-2 text-sm"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {guideViewMode === 'ores' && (
              <select
                value={guideRarityFilter || ''}
                onChange={(e) => setGuideRarityFilter(e.target.value || null)}
                className="site-input px-3 py-2 text-sm"
              >
                <option value="">All Rarities</option>
                {MINING_RARITY_ORDER.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {MINING_RARITY_LABELS[rarity]} ({data ? countGuideRarityBucket(data, rarity) : 0})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Stats summary - only in ore view */}
          {guideViewMode === 'ores' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {MINING_RARITY_ORDER.map((rarity) => {
                const colors = MINING_RARITY_COLORS[rarity]
                const count = data ? countGuideRarityBucket(data, rarity) : 0
                return (
                  <button
                    key={rarity}
                    onClick={() => setGuideRarityFilter(guideRarityFilter === rarity ? null : rarity)}
                    className={`
                      p-2 rounded-lg border text-center transition-all site-btn-shimmer
                      ${guideRarityFilter === rarity ? colors.bg + ' ' + colors.border + ' site-btn-burn' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'}
                    `}
                  >
                    <span className={`text-lg font-bold ${guideRarityFilter === rarity ? colors.text : 'text-white'}`}>
                      {count}
                    </span>
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider">
                      {MINING_RARITY_LABELS[rarity]}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Results */}
          {guideViewMode === 'ores' ? (
            <div className="space-y-3">
              {guideFilteredData.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No matching ores found.</p>
              ) : (
                guideFilteredData.map((item) => (
                  <GuideOreCard key={item.id} item={item} onLocationClick={setSelectedLocation} />
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {guideFilteredLocations.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No matching locations found.</p>
              ) : (
                guideFilteredLocations.map((location) => (
                  <GuideLocationCard
                    key={location}
                    location={location}
                    ores={locationOresMap[location] || []}
                    onOreClick={(ore) => openOreModal(ore, location)}
                    onLocationClick={setSelectedLocation}
                  />
                ))
              )}
            </div>
          )}

          {/* Location detail modal */}
          {selectedLocation && (
            <GuideLocationModal
              location={selectedLocation}
              ores={locationOresMap[selectedLocation] || []}
              onClose={() => setSelectedLocation(null)}
            />
          )}

          {/* Ore detail modal */}
          {selectedOre && (
            <GuideOreModal
              ore={selectedOre}
              guideLocationName={selectedOreGuideLocation ?? undefined}
              onClose={closeOreModal}
              onOpenTracker={() => {
                closeOreModal()
                setViewMode('tracker')
                setOreSearch('')
                setSelectedOreName('')
              }}
            />
          )}
        </div>
      )}
    </FeaturePageLayout>
  )
}

// ===== Guide View Helper Components =====

function getOreLocations(ore: MiningData): string[] {
  return ore.locations ?? []
}

function GuideOreCard({ item, onLocationClick }: { item: MiningData; onLocationClick: (loc: string) => void }) {
  const colors = MINING_RARITY_COLORS[item.rarity] || MINING_RARITY_COLORS.common
  const signature = ORE_SIGNATURES[item.ore_name]
  const locationListOnly = isGuideLocationListOnlyOre(item.ore_name, item.rarity)

  const locationChips = useMemo(() => {
    type Chip = {
      location: string
      depositType: DepositType
      spawnLabel: string
      spawnTier: string
      maxNodes: number
    }
    const chips: Chip[] = []

    if (locationListOnly) {
      const listLabel = getGuideLocationSpawnLabel(item.ore_name)
      for (const location of item.locations ?? []) {
        chips.push({
          location,
          depositType: 'surface',
          spawnLabel: listLabel,
          spawnTier: 'hand',
          maxNodes: 0,
        })
      }
      return {
        surface: chips.sort((a, b) => a.location.localeCompare(b.location)),
        asteroid: [] as Chip[],
      }
    }

    for (const location of item.locations ?? []) {
      if (isBroadGuideLocation(location)) {
        for (const depositType of getDepositTypes(item.ore_name)) {
          if (!getOverallProfile(item.ore_name, depositType)) continue
          const tag = getOverallSpawnTag(item.ore_name, depositType)
          const overall = getOverallProfile(item.ore_name, depositType)
          chips.push({
            location,
            depositType,
            spawnLabel: tag.label,
            spawnTier: tag.tier,
            maxNodes: overall?.maxNodes ?? 0,
          })
        }
        continue
      }
      const profiles = getGuideLocationProfiles(item.ore_name, location)
      if (profiles.length === 0) {
        chips.push({
          location,
          depositType: 'surface',
          spawnLabel: 'Broad spawn',
          spawnTier: 'broad',
          maxNodes: 0,
        })
        continue
      }
      for (const profile of profiles) {
        const tag = getLocationSpawnTag(item.ore_name, location, profile.depositType)
        chips.push({
          location,
          depositType: profile.depositType,
          spawnLabel: tag.label,
          spawnTier: tag.tier,
          maxNodes: profile.maxNodes,
        })
      }
    }
    const surface = chips.filter((c) => c.depositType === 'surface').sort((a, b) => {
      if (a.spawnTier === 'best') return -1
      if (b.spawnTier === 'best') return 1
      return a.location.localeCompare(b.location)
    })
    const asteroid = chips.filter((c) => c.depositType === 'asteroid').sort((a, b) => {
      if (a.spawnTier === 'best') return -1
      if (b.spawnTier === 'best') return 1
      return a.location.localeCompare(b.location)
    })
    return { surface, asteroid }
  }, [item.ore_name, item.locations, item.rarity, locationListOnly])

  const renderChip = (chip: {
    location: string
    depositType: DepositType
    spawnLabel: string
    maxNodes: number
  }) => {
    const system = LOCATION_SYSTEMS[chip.location]
    const systemColor = system ? MINING_SYSTEM_COLORS[system] : 'text-slate-400'
    const habitatLabel = locationListOnly
      ? formatHandMineableHabitatAtSite(item.ore_name, chip.location)
      : null
    return (
      <SiteTooltip
        key={`${chip.location}-${chip.depositType}`}
        content={
          locationListOnly
            ? guideLocationOreTooltip(item.ore_name, chip.location)
            : guideLocationChipTooltip(item.ore_name, chip.location, chip.depositType)
        }
        side="top"
      >
        <button
          onClick={() => onLocationClick(chip.location)}
          className="text-xs px-2 py-1 rounded bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors cursor-pointer text-left"
        >
          {!locationListOnly && (
            <span className="inline-block text-[9px] uppercase tracking-wider text-orange-300/80 mr-1">
              {chip.depositType === 'surface' ? 'Surface' : 'Asteroid'}
            </span>
          )}
          {chip.location}
          {system && (
            <span className={`ml-1 ${systemColor} opacity-70`}>({system})</span>
          )}
          <span className="block text-[10px] text-slate-500 mt-0.5">
            {chip.spawnLabel}
            {habitatLabel ? ` · ${habitatLabel}` : ''}
            {!locationListOnly && chip.maxNodes >= 2 ? ` · max ${chip.maxNodes}×` : ''}
          </span>
        </button>
      </SiteTooltip>
    )
  }
  
  return (
    <div className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between gap-4">
        <SiteTooltip content={guideOreTitleTooltip(item.ore_name)} side="top">
          <div>
            <h3 className={`font-semibold ${colors.text}`}>{item.ore_name}</h3>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                {MINING_RARITY_LABELS[item.rarity]}
              </span>
              {isHandMineableType(item.ore_name) && item.rarity !== 'handMineable' && (
                <span className="text-xs text-cyan-400/90 uppercase tracking-wider">
                  · Hand Mineable
                </span>
              )}
              {signature && (
                <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded">
                  RS {signature}
                </span>
              )}
            </div>
          </div>
        </SiteTooltip>
        <div className="flex items-center gap-2 shrink-0">
          {signature && (
            <TrackOreButtons oreName={item.ore_name} rarity={item.rarity} compact />
          )}
          <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
            {getOreLocations(item).length} location{getOreLocations(item).length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {locationListOnly ? (
        locationChips.surface.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Locations</div>
            <div className="flex flex-wrap gap-1.5">{locationChips.surface.map(renderChip)}</div>
          </div>
        )
      ) : (
        <>
          {locationChips.surface.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Surface</div>
              <div className="flex flex-wrap gap-1.5">{locationChips.surface.map(renderChip)}</div>
            </div>
          )}
          {locationChips.asteroid.length > 0 && (
            <div className={`mt-3 ${locationChips.surface.length > 0 ? 'pt-3 border-t border-slate-700/40' : ''}`}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Asteroid</div>
              <div className="flex flex-wrap gap-1.5">{locationChips.asteroid.map(renderChip)}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GuideLocationCard({
  location,
  ores,
  onOreClick,
  onLocationClick,
}: {
  location: string
  ores: MiningData[]
  onOreClick: (ore: MiningData, location: string) => void
  onLocationClick?: (location: string) => void
}) {
  const system = LOCATION_SYSTEMS[location]
  const systemColor = system ? MINING_SYSTEM_COLORS[system] : 'text-slate-400'
  
  const sortedOres = [...ores].sort((a, b) => {
    return MINING_RARITY_ORDER.indexOf(a.rarity) - MINING_RARITY_ORDER.indexOf(b.rarity)
  })
  
  return (
    <div className="p-4 rounded-lg border bg-slate-800/30 border-slate-700/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          {onLocationClick ? (
            <button
              type="button"
              onClick={() => onLocationClick(location)}
              className="font-semibold text-white hover:text-orange-300 transition-colors text-left"
            >
              {location}
            </button>
          ) : (
            <h3 className="font-semibold text-white">{location}</h3>
          )}
          {system && (
            <span className={`text-xs ${systemColor} uppercase tracking-wider`}>
              {system} System
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
          {ores.length} ore{ores.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sortedOres.map((ore) => {
          const colors = MINING_RARITY_COLORS[ore.rarity] || MINING_RARITY_COLORS.common
          const signature = ORE_SIGNATURES[ore.ore_name]
          const habitatLabel = formatHandMineableHabitatAtSite(ore.ore_name, location)
          const profile = getLocationProfile(ore.ore_name, location)
          const spawnTag = isBroadGuideLocation(location)
            ? getDepositTypes(ore.ore_name)
                .map((dt) => getOverallSpawnTag(ore.ore_name, dt))
                .find(Boolean)
            : profile
              ? getLocationSpawnTag(ore.ore_name, location, profile.depositType)
              : null
          return (
            <SiteTooltip
              key={ore.id}
              content={guideLocationOreTooltip(ore.ore_name, location)}
              side="top"
            >
              <button
                type="button"
                onClick={() => onOreClick(ore, location)}
                className={`text-xs px-2 py-1 rounded ${colors.bg} ${colors.text} border ${colors.border} hover:brightness-125 transition-all cursor-pointer text-left`}
              >
                {ore.ore_name}
                {signature && (
                  <span className="ml-1 text-amber-400/70 font-mono text-[10px]">
                    {signature}
                  </span>
                )}
                {spawnTag && (
                  <span className="block text-[10px] text-slate-400 mt-0.5">{spawnTag.label}</span>
                )}
                {habitatLabel && (
                  <span className="block text-[10px] text-cyan-400/80 mt-0.5">{habitatLabel}</span>
                )}
              </button>
            </SiteTooltip>
          )
        })}
      </div>
    </div>
  )
}

function GuideOreModal({
  ore,
  guideLocationName,
  onClose,
  onOpenTracker,
}: {
  ore: MiningData
  guideLocationName?: string
  onClose: () => void
  onOpenTracker: () => void
}) {
  useBodyScrollLock(true)

  const colors = MINING_RARITY_COLORS[ore.rarity] || MINING_RARITY_COLORS.common
  const signature = ORE_SIGNATURES[ore.ore_name]
  const locationListOnly = isGuideLocationListOnlyOre(ore.ore_name, ore.rarity)
  const listSpawnLabel = getGuideLocationSpawnLabel(ore.ore_name)
  const elementStatsBlock = oreMineableStatsTooltipBlock(ore.ore_name)
  const locationProfiles = guideLocationName
    ? isBroadGuideLocation(guideLocationName)
      ? []
      : getGuideLocationProfiles(ore.ore_name, guideLocationName)
    : []

  const sortedLocations = [...(ore.locations ?? [])].sort((a, b) => {
    const sysA = LOCATION_SYSTEMS[a] || 'Unknown'
    const sysB = LOCATION_SYSTEMS[b] || 'Unknown'
    if (sysA !== sysB) return sysA.localeCompare(sysB)
    return a.localeCompare(b)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className={`text-lg font-semibold ${colors.text}`}>{ore.ore_name}</h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">
                  {MINING_RARITY_LABELS[ore.rarity]}
                </span>
                {signature && (
                  <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                    RS {signature}
                  </span>
                )}
                {guideLocationName && (
                  <span className="text-xs text-orange-300/90 whitespace-nowrap">
                    At {guideLocationName}
                  </span>
                )}
              </div>
              {elementStatsBlock && (
                <div className="mt-1.5 text-xs">{elementStatsBlock}</div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {signature && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              {guideLocationName && locationProfiles.length > 0 ? (
                <TrackOreButtons
                  oreName={ore.ore_name}
                  rarity={ore.rarity}
                  profileMode="location"
                  locationName={guideLocationName}
                  showTrackerLink
                  stacked
                  tooltipSide="bottom"
                  onOpenTracker={onOpenTracker}
                />
              ) : (
                <TrackOreButtons
                  oreName={ore.ore_name}
                  rarity={ore.rarity}
                  locationName={guideLocationName}
                  showTrackerLink
                  stacked
                  tooltipSide="bottom"
                  onOpenTracker={onOpenTracker}
                />
              )}
            </div>
          )}
        </div>

        <div className="p-4 overflow-y-auto min-h-0 flex-1">
          <p className="text-sm text-slate-400 mb-4">
            Found at {getOreLocations(ore).length} location{getOreLocations(ore).length !== 1 ? 's' : ''}:
          </p>
          <div className="space-y-2">
            {sortedLocations.map((location) => {
              const system = LOCATION_SYSTEMS[location]
              const systemColor = system ? MINING_SYSTEM_COLORS[system] : 'text-slate-400'
              if (locationListOnly) {
                const habitatLabel = formatHandMineableHabitatAtSite(ore.ore_name, location)
                return (
                  <div
                    key={location}
                    className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50"
                  >
                    <span className="font-medium text-white">{location}</span>
                    {system && (
                      <span className={`block text-xs ${systemColor} mt-0.5`}>{system} System</span>
                    )}
                    <span className="block text-xs text-slate-500 mt-1">
                      {listSpawnLabel}
                      {habitatLabel ? ` · ${habitatLabel}` : ''}
                    </span>
                  </div>
                )
              }
              const profiles = getGuideLocationProfiles(ore.ore_name, location)
              if (profiles.length === 0 && isBroadGuideLocation(location)) {
                return getDepositTypes(ore.ore_name).map((depositType) => {
                  const overall = getOverallProfile(ore.ore_name, depositType)
                  if (!overall) return null
                  const tag = getOverallSpawnTag(ore.ore_name, depositType)
                  return (
                    <SiteTooltip
                      key={`${location}-${depositType}`}
                      content={guideLocationChipTooltip(ore.ore_name, location, depositType)}
                      side="top"
                      className="block w-full"
                    >
                      <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-medium text-white">{location}</span>
                            {system && (
                              <span className={`block text-xs ${systemColor} mt-0.5`}>{system} System</span>
                            )}
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-orange-300/80 shrink-0">
                            {depositType === 'surface' ? 'Surface' : 'Asteroid'}
                          </span>
                        </div>
                        <span className="block text-xs text-slate-400 mt-1">
                          {tag.label}
                          {overall.maxNodes >= 2 ? ` · max ${overall.maxNodes}×` : ''}
                        </span>
                      </div>
                    </SiteTooltip>
                  )
                })
              }
              if (profiles.length === 0) {
                return (
                  <div
                    key={location}
                    className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50"
                  >
                    <span className="font-medium text-white">{location}</span>
                    {system && (
                      <span className={`block text-xs ${systemColor} mt-0.5`}>{system} System</span>
                    )}
                    <span className="block text-xs text-slate-500 mt-1">Broad spawn</span>
                  </div>
                )
              }
              return profiles.map((profile) => (
                <SiteTooltip
                  key={`${location}-${profile.depositType}`}
                  content={guideOreModalLocationTooltip(ore.ore_name, location, profile.depositType)}
                  side="top"
                  className="block w-full"
                >
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-medium text-white">{location}</span>
                        {system && (
                          <span className={`block text-xs ${systemColor} mt-0.5`}>{system} System</span>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-orange-300/80 shrink-0">
                        {profile.depositType === 'surface' ? 'Surface' : 'Asteroid'}
                      </span>
                    </div>
                    <span className="block text-xs text-slate-400 mt-1">
                      {getLocationSpawnTag(ore.ore_name, location, profile.depositType).label}
                      {profile.maxNodes >= 2 ? ` · max ${profile.maxNodes}×` : ''}
                    </span>
                  </div>
                </SiteTooltip>
              ))
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function GuideLocationModal({ location, ores, onClose }: { location: string; ores: MiningData[]; onClose: () => void }) {
  useBodyScrollLock(true)
  
  const system = LOCATION_SYSTEMS[location]
  const systemColor = system ? MINING_SYSTEM_COLORS[system] : 'text-slate-400'
  
  const sortedOres = [...ores].sort((a, b) => {
    return MINING_RARITY_ORDER.indexOf(a.rarity) - MINING_RARITY_ORDER.indexOf(b.rarity)
  })
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{location}</h2>
            {system && (
              <span className={`text-sm ${systemColor}`}>{system} System</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <p className="text-sm text-slate-400 mb-4">
            {ores.length} ore{ores.length !== 1 ? 's' : ''} found at this location:
          </p>
          <div className="space-y-2">
            {sortedOres.map((ore) => {
              const colors = MINING_RARITY_COLORS[ore.rarity] || MINING_RARITY_COLORS.common
              const signature = ORE_SIGNATURES[ore.ore_name]
              const profile = getLocationProfile(ore.ore_name, location)
              return (
                <div
                  key={ore.id}
                  className={`p-3 rounded-lg ${colors.bg} border ${colors.border}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-medium ${colors.text}`}>{ore.ore_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {signature && (profile || isBroadGuideLocation(location)) && (
                        <TrackOreButtons
                          oreName={ore.ore_name}
                          rarity={ore.rarity}
                          compact
                          depositType={profile?.depositType}
                          locationName={location}
                        />
                      )}
                      {signature && (
                        <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-2 py-1 rounded">
                          RS {signature}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                    <span className="text-xs text-slate-500 uppercase">
                      {MINING_RARITY_LABELS[ore.rarity]}
                    </span>
                    {profile && (
                      <span className="text-[10px] text-slate-400">
                        {profile.depositType === 'surface' ? 'Surface' : 'Asteroid'} ·{' '}
                        {getLocationSpawnTag(ore.ore_name, location, profile.depositType).label}
                      </span>
                    )}
                  </div>
                  {!profile && isBroadGuideLocation(location) && (
                    <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                      {getDepositTypes(ore.ore_name).map((dt) => {
                        const overall = getOverallProfile(ore.ore_name, dt)
                        if (!overall) return null
                        return (
                          <div key={dt}>
                            {depositTypeLabel(dt)} · {getOverallSpawnTag(ore.ore_name, dt).label}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
