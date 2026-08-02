import React, { useEffect, useMemo, useState } from 'react'
import { useBlueprintData } from '../routes/blueprints'
import MissionListingTags from './MissionListingTags'
import BlueprintMissionMeta from './BlueprintMissionMeta'
import BlueprintRewardMissionsModal from './BlueprintRewardMissionsModal'
import { getBrowseSystemsForMission } from '../lib/missionLocations'
import { formatBlueprintSpecLine } from '../lib/blueprintSpec'
import type { Region } from '../lib/missions'
import {
  getContractMissionBrowseCatalog,
  getRewardMissionsForBlueprint,
  type BlueprintRewardMission,
  type ContractMissionBrowseEntry,
} from '../lib/blueprintMissionRewards'
import { formatStandingRange } from '../lib/missionAcquisition'
import {
  makeBrowseMissionKey,
  readMissionTrackerUiState,
  stashBrowseMissionFromReward,
  writeMissionTrackerUiState,
  type BrowseSystem,
} from '../lib/missionTrackerUiState'
import { MissionDescriptionText } from '../lib/missionDescriptionFormat'

type BlueprintRecord = {
  file: string
  internalName?: string
  blueprintName?: string
  [key: string]: unknown
}

type MissionDisplay = ContractMissionBrowseEntry & {
  blueprintCount: number
}

function missionMatchesSearch(
  mission: Pick<ContractMissionBrowseEntry, 'title' | 'mission' | 'category'>,
  term: string
): boolean {
  if (mission.title.toLowerCase().includes(term)) return true
  if (mission.mission.toLowerCase().includes(term)) return true
  if (mission.category?.toLowerCase().includes(term)) return true
  return false
}

const SYSTEM_LABELS: Record<BrowseSystem, string> = {
  stanton: 'Stanton',
  pyro: 'Pyro',
  nyx: 'Nyx',
  unknown: 'Unknown Location',
}

const SYSTEM_FILTER_ORDER: BrowseSystem[] = ['stanton', 'pyro', 'nyx', 'unknown']

type SystemFilter = BrowseSystem | 'all'

const SYSTEM_COLORS: Record<BrowseSystem, { bg: string; border: string; text: string }> = {
  stanton: { bg: 'bg-blue-950/50', border: 'border-blue-500/40', text: 'text-blue-300' },
  pyro: { bg: 'bg-orange-950/50', border: 'border-orange-500/40', text: 'text-orange-300' },
  nyx: { bg: 'bg-purple-950/50', border: 'border-purple-500/40', text: 'text-purple-300' },
  unknown: { bg: 'site-badge-slate', border: '', text: 'text-slate-400' },
}

/** Filter chips shown beside System — excludes system/location and time/frequency tags. */
type BrowseTagKind =
  | 'lawful'
  | 'category'
  | 'career'
  | 'standing'
  | 'prereq'
  | 'nfr'
  | 'poolRoll'

interface BrowseTagFilter {
  id: string
  kind: BrowseTagKind
  label: string
  className: string
}

const TAG_KIND_ORDER: BrowseTagKind[] = [
  'lawful',
  'category',
  'career',
  'standing',
  'prereq',
  'nfr',
  'poolRoll',
]

const TAG_CHIP_CLASS: Record<BrowseTagKind, string> = {
  lawful: 'bg-green-950/50 text-green-300 border-green-500/40',
  category: 'bg-amber-950/50 text-amber-300 border-amber-500/40',
  career: 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40',
  standing: 'bg-cyan-950/50 text-cyan-300 border-cyan-500/40',
  prereq: 'bg-purple-950/50 text-purple-300 border-purple-500/40',
  nfr: 'bg-rose-950/50 text-rose-300 border-rose-500/45',
  poolRoll: 'bg-amber-950/40 text-amber-400/90 border-amber-500/30',
}

function collectMissionBrowseTags(mission: MissionDisplay): BrowseTagFilter[] {
  const tags: BrowseTagFilter[] = []

  if (mission.isLawful) {
    tags.push({
      id: 'lawful:verified',
      kind: 'lawful',
      label: 'Verified',
      className: TAG_CHIP_CLASS.lawful,
    })
  } else {
    tags.push({
      id: 'lawful:unverified',
      kind: 'lawful',
      label: 'Unverified',
      className: 'bg-red-950/50 text-red-400 border-red-500/40',
    })
  }

  if (mission.category?.trim()) {
    const label = mission.category.trim()
    tags.push({
      id: `category:${label.toLowerCase()}`,
      kind: 'category',
      label,
      className: TAG_CHIP_CLASS.category,
    })
  }

  const career = mission.repCareerLabel?.trim()
  if (career) {
    tags.push({
      id: `career:${career.toLowerCase()}`,
      kind: 'career',
      label: career,
      className: TAG_CHIP_CLASS.career,
    })
  }

  const standing = formatStandingRange(mission.minStanding, mission.maxStanding)
  if (standing) {
    tags.push({
      id: `standing:${standing.toLowerCase()}`,
      kind: 'standing',
      label: standing,
      className:
        mission.minStanding?.minReputation === 0
          ? 'site-badge-slate text-slate-400'
          : TAG_CHIP_CLASS.standing,
    })
  }

  if (mission.prereqMissions?.length) {
    tags.push({
      id: 'prereq:prior',
      kind: 'prereq',
      label: 'Unlocked by prior mission',
      className: TAG_CHIP_CLASS.prereq,
    })
  }

  if (mission.notForRelease) {
    tags.push({
      id: 'nfr:flag',
      kind: 'nfr',
      label: 'NFR',
      className: TAG_CHIP_CLASS.nfr,
    })
  }

  if (mission.hasPartialPoolRoll) {
    tags.push({
      id: 'poolRoll:partial',
      kind: 'poolRoll',
      label: 'Partial pool roll',
      className: TAG_CHIP_CLASS.poolRoll,
    })
  }

  return tags
}

/** Selected tags: OR within the same kind, AND across kinds. */
function missionMatchesBrowseTags(
  mission: MissionDisplay,
  selectedIds: Set<string>,
  tagById: Map<string, BrowseTagFilter>
): boolean {
  if (selectedIds.size === 0) return true
  const missionIds = new Set(collectMissionBrowseTags(mission).map((tag) => tag.id))
  const selectedByKind = new Map<BrowseTagKind, string[]>()
  for (const id of selectedIds) {
    const tag = tagById.get(id)
    if (!tag) continue
    const list = selectedByKind.get(tag.kind) ?? []
    list.push(id)
    selectedByKind.set(tag.kind, list)
  }
  for (const ids of selectedByKind.values()) {
    if (!ids.some((id) => missionIds.has(id))) return false
  }
  return true
}

interface MissionGroup {
  title: string
  isLawful: boolean
  category: string | null
  variants: MissionDisplay[]
}

interface FactionBrowseData {
  missions: MissionDisplay[]
  hasLawful: boolean
  hasIllegal: boolean
  systems: Set<BrowseSystem>
}

function factionLawfulStatus(data: FactionBrowseData): 'lawful' | 'illegal' | 'mixed' {
  if (data.hasLawful && data.hasIllegal) return 'mixed'
  if (data.hasIllegal) return 'illegal'
  return 'lawful'
}

function countMissionTypesByLawful(missions: MissionDisplay[]): { lawful: number; illegal: number } {
  const lawfulTitles = new Set<string>()
  const illegalTitles = new Set<string>()
  for (const mission of missions) {
    if (mission.isLawful) lawfulTitles.add(mission.title)
    else illegalTitles.add(mission.title)
  }
  return { lawful: lawfulTitles.size, illegal: illegalTitles.size }
}

interface BrowseMissionsViewProps {
  acquiredBlueprints: Record<string, boolean>
  onAddToTracker: (blueprintId: string) => void
  onMarkAcquired: (blueprintId: string) => void | Promise<void>
  isOnTargetList: (blueprintId: string) => boolean
}

function getMissionBrowseSystems(
  mission: Pick<MissionDisplay, 'poolKeys' | 'system' | 'region' | 'locality'>
): BrowseSystem[] {
  return getBrowseSystemsForMission({
    poolKey: mission.poolKeys[0] ?? '',
    system: mission.system,
    subRegion: mission.region,
    localitySystems: mission.locality?.systems,
  })
}

function missionMatchesSystem(mission: MissionDisplay, systemFilter: SystemFilter): boolean {
  if (systemFilter === 'all') return true
  return getMissionBrowseSystems(mission).includes(systemFilter)
}

function groupMissionsByTitle(missions: MissionDisplay[]): MissionGroup[] {
  const map = new Map<string, MissionGroup>()

  for (const mission of missions) {
    const existing = map.get(mission.title)
    if (existing) {
      existing.variants.push(mission)
      existing.isLawful = existing.isLawful && mission.isLawful
    } else {
      map.set(mission.title, {
        title: mission.title,
        isLawful: mission.isLawful,
        category: mission.category,
        variants: [mission],
      })
    }
  }

  for (const group of map.values()) {
    group.variants.sort((a, b) => {
      const regionCompare = (a.region || '').localeCompare(b.region || '')
      if (regionCompare !== 0) return regionCompare
      const repCompare = (a.minStanding?.minReputation ?? 0) - (b.minStanding?.minReputation ?? 0)
      if (repCompare !== 0) return repCompare
      return (a.poolKeys[0] || '').localeCompare(b.poolKeys[0] || '')
    })
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title))
}

export default function BrowseMissionsView({
  acquiredBlueprints,
  onAddToTracker,
  onMarkAcquired,
  isOnTargetList,
}: BrowseMissionsViewProps) {
  const { data: blueprints = [] } = useBlueprintData()
  const [selectedFaction, setSelectedFaction] = useState<string | null>(
    () => readMissionTrackerUiState().browse.selectedFaction
  )
  const [selectedMissionKey, setSelectedMissionKey] = useState<string | null>(
    () => readMissionTrackerUiState().browse.selectedMissionKey
  )
  const [searchTerm, setSearchTerm] = useState(() => readMissionTrackerUiState().browse.searchTerm)
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('all')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [missionsModalBlueprint, setMissionsModalBlueprint] = useState<{
    id: string
    name: string
  } | null>(null)

  const missions = useMemo((): MissionDisplay[] => {
    return getContractMissionBrowseCatalog().map((contract) => ({
      ...contract,
      blueprintCount: contract.blueprints.length,
    }))
  }, [])

  const blueprintsByInternalName = useMemo(() => {
    const map: Record<string, BlueprintRecord> = {}
    for (const bp of blueprints as BlueprintRecord[]) {
      if (bp.internalName) {
        map[bp.internalName.toLowerCase()] = bp
      }
      if (bp.file) {
        map[bp.file.toLowerCase()] = bp
      }
      const fileMatch = bp.file?.match(/bp_craft_([^/\\]+?)(?:_scitem)?\.json$/i)
      if (fileMatch) {
        map[fileMatch[1].toLowerCase()] = bp
      }
    }
    return map
  }, [blueprints])

  const missionsByFaction = useMemo(() => {
    const map: Record<string, FactionBrowseData> = {}

    for (const m of missions) {
      if (!map[m.faction]) {
        map[m.faction] = { missions: [], hasLawful: false, hasIllegal: false, systems: new Set() }
      }
      map[m.faction].missions.push(m)
      if (m.isLawful) map[m.faction].hasLawful = true
      else map[m.faction].hasIllegal = true
      for (const system of getMissionBrowseSystems(m)) {
        map[m.faction].systems.add(system)
      }
    }

    return map
  }, [missions])

  const availableSystems = useMemo(() => {
    const present = new Set<BrowseSystem>()
    for (const data of Object.values(missionsByFaction)) {
      for (const system of data.systems) present.add(system)
    }
    return SYSTEM_FILTER_ORDER.filter((system) => present.has(system))
  }, [missionsByFaction])

  const selectedMission = useMemo(() => {
    if (!selectedMissionKey) return null
    return missions.find((mission) => makeBrowseMissionKey(mission) === selectedMissionKey) ?? null
  }, [missions, selectedMissionKey])

  useEffect(() => {
    writeMissionTrackerUiState({
      browse: {
        selectedFaction,
        selectedMissionKey,
        searchTerm,
      },
    })
  }, [selectedFaction, selectedMissionKey, searchTerm])

  useEffect(() => {
    setSelectedTagIds([])
  }, [selectedFaction])

  const selectedFactionData = selectedFaction ? missionsByFaction[selectedFaction] : null
  const isMixedFaction = selectedFactionData
    ? factionLawfulStatus(selectedFactionData) === 'mixed'
    : false

  const filteredFactionList = useMemo(() => {
    let entries = Object.entries(missionsByFaction)

    if (systemFilter !== 'all') {
      entries = entries.filter(([, data]) => data.systems.has(systemFilter))
    }

    if (!searchTerm) return entries

    const term = searchTerm.toLowerCase()
    return entries.filter(([faction, data]) =>
      faction.toLowerCase().includes(term) ||
      data.missions.some((m) => missionMatchesSearch(m, term))
    )
  }, [missionsByFaction, searchTerm, systemFilter])

  const availableFactionTags = useMemo((): BrowseTagFilter[] => {
    if (!selectedFaction) return []
    const factionMissions = missionsByFaction[selectedFaction]?.missions || []
    const pool =
      systemFilter === 'all'
        ? factionMissions
        : factionMissions.filter((m) => missionMatchesSystem(m, systemFilter))

    const byId = new Map<string, BrowseTagFilter>()
    for (const mission of pool) {
      for (const tag of collectMissionBrowseTags(mission)) {
        if (!byId.has(tag.id)) byId.set(tag.id, tag)
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const kindDiff = TAG_KIND_ORDER.indexOf(a.kind) - TAG_KIND_ORDER.indexOf(b.kind)
      if (kindDiff !== 0) return kindDiff
      return a.label.localeCompare(b.label)
    })
  }, [selectedFaction, missionsByFaction, systemFilter])

  const availableFactionTagById = useMemo(() => {
    const map = new Map<string, BrowseTagFilter>()
    for (const tag of availableFactionTags) map.set(tag.id, tag)
    return map
  }, [availableFactionTags])

  // Drop tag selections that vanish when the system filter changes
  useEffect(() => {
    setSelectedTagIds((prev) => {
      if (prev.length === 0) return prev
      const allowed = new Set(availableFactionTags.map((tag) => tag.id))
      const next = prev.filter((id) => allowed.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [availableFactionTags])

  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds])

  const selectedFactionMissionGroups = useMemo((): MissionGroup[] => {
    if (!selectedFaction) return []
    const factionMissions = missionsByFaction[selectedFaction]?.missions || []

    let filtered = factionMissions
    if (systemFilter !== 'all') {
      filtered = filtered.filter((m) => missionMatchesSystem(m, systemFilter))
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter((m) => missionMatchesSearch(m, term))
    }
    if (selectedTagIdSet.size > 0) {
      filtered = filtered.filter((m) =>
        missionMatchesBrowseTags(m, selectedTagIdSet, availableFactionTagById)
      )
    }

    return groupMissionsByTitle(filtered)
  }, [
    selectedFaction,
    missionsByFaction,
    searchTerm,
    systemFilter,
    selectedTagIdSet,
    availableFactionTagById,
  ])

  const lawfulMissionGroups = useMemo(
    () => selectedFactionMissionGroups.filter((group) => group.isLawful),
    [selectedFactionMissionGroups]
  )

  const illegalMissionGroups = useMemo(
    () => selectedFactionMissionGroups.filter((group) => !group.isLawful),
    [selectedFactionMissionGroups]
  )

  const getMissionBlueprintStats = (mission: MissionDisplay) => {
    const acquiredCount = mission.blueprints.filter((bp) => {
      const fullBp = blueprintsByInternalName[bp.name.toLowerCase()]
      return fullBp && acquiredBlueprints[fullBp.internalName]
    }).length
    return { acquiredCount, total: mission.blueprints.length }
  }

  const selectedMissionBlueprints = useMemo(() => {
    if (!selectedMission) return []

    return selectedMission.blueprints.map((bp) => {
      const bpName = bp.name.toLowerCase()
      const fullBp = blueprintsByInternalName[bpName]
      const isAcquired = fullBp ? !!acquiredBlueprints[fullBp.internalName] : false
      const isTracked = fullBp ? isOnTargetList(fullBp.internalName) : false

      return {
        ...bp,
        fullBlueprint: fullBp,
        displayName: (fullBp?.blueprintName as string) || bp.name.replace(/_/g, ' '),
        isAcquired,
        isTracked,
      }
    }).sort((a, b) => {
      if (a.isAcquired !== b.isAcquired) return a.isAcquired ? 1 : -1
      return a.displayName.localeCompare(b.displayName)
    })
  }, [selectedMission, blueprintsByInternalName, acquiredBlueprints, isOnTargetList])

  const blueprintStats = useMemo(() => {
    const total = selectedMissionBlueprints.length
    const acquired = selectedMissionBlueprints.filter(b => b.isAcquired).length
    return { total, acquired }
  }, [selectedMissionBlueprints])

  const missionsModalList = useMemo(() => {
    if (!missionsModalBlueprint) return []
    return getRewardMissionsForBlueprint(missionsModalBlueprint.id)
  }, [missionsModalBlueprint])

  const navigateToRewardMission = (reward: BlueprintRewardMission) => {
    if (!stashBrowseMissionFromReward(reward)) return

    setSelectedFaction(readMissionTrackerUiState().browse.selectedFaction)
    setSelectedMissionKey(readMissionTrackerUiState().browse.selectedMissionKey)
    setSearchTerm('')
    setMissionsModalBlueprint(null)
  }

  const handleBack = () => {
    if (selectedMissionKey) {
      setSelectedMissionKey(null)
    } else if (selectedFaction) {
      setSelectedFaction(null)
    }
  }

  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; onClick: () => void }[] = [
      { label: 'Factions', onClick: () => { setSelectedFaction(null); setSelectedMissionKey(null) } },
    ]

    if (selectedFaction) {
      crumbs.push({
        label: selectedFaction,
        onClick: () => { setSelectedMissionKey(null) },
      })
    }

    if (selectedMission) {
      crumbs.push({
        label: selectedMission.title.length > 40 ? selectedMission.title.slice(0, 40) + '...' : selectedMission.title,
        onClick: () => {},
      })
    }

    return crumbs
  }, [selectedFaction, selectedMission])

  const renderMissionTags = (mission: MissionDisplay) => {
    const systemRegion = mission.system?.toLowerCase()
    const regions: Region[] =
      systemRegion === 'stanton' || systemRegion === 'pyro' || systemRegion === 'nyx'
        ? [systemRegion]
        : []

    return (
      <MissionListingTags
        isLawful={mission.isLawful}
        showVerifiedBadge
        category={mission.category}
        regions={regions}
        subRegion={mission.region}
        system={mission.system}
        poolKey={mission.poolKeys[0]}
        locality={mission.locality}
        minStanding={mission.minStanding}
        maxStanding={mission.maxStanding}
        repCareerLabel={mission.repCareerLabel}
        repEffects={mission.repEffects}
        repPoints={mission.repPoints}
        missionFaction={mission.faction}
        missionTitle={mission.title}
        prereqMissions={mission.prereqMissions}
        poolRollChance={mission.hasPartialPoolRoll ? mission.minPoolChance : null}
        frequency={mission.frequency}
        notForRelease={mission.notForRelease}
      />
    )
  }

  const renderVariantRow = (mission: MissionDisplay) => {
    const { acquiredCount, total } = getMissionBlueprintStats(mission)

    return (
      <button
        key={mission.entryKey}
        onClick={() => setSelectedMissionKey(makeBrowseMissionKey(mission))}
        className="site-dropdown-item w-full px-3 py-2.5 text-left flex items-start justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          {renderMissionTags(mission)}
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-sm font-medium ${
            acquiredCount === total ? 'text-green-400' : 'text-amber-400'
          }`}>
            {acquiredCount}/{total}
          </span>
          <p className="text-[10px] text-slate-500">blueprints</p>
        </div>
      </button>
    )
  }

  const renderMissionGroup = (group: MissionGroup) => {
    if (group.variants.length === 1) {
      const mission = group.variants[0]
      const { acquiredCount, total } = getMissionBlueprintStats(mission)

      return (
        <button
          key={mission.entryKey}
          onClick={() => setSelectedMissionKey(makeBrowseMissionKey(mission))}
          className={`w-full p-3 site-surface text-left transition-all ${
            mission.isLawful
              ? 'border-green-500/20 hover:border-green-500/40'
              : 'border-red-500/20 hover:border-red-500/40'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h4 className={`font-medium text-sm ${mission.isLawful ? 'text-green-300' : 'text-red-400'}`}>
                {mission.title}
              </h4>
              <div className="mt-1.5">
                {renderMissionTags(mission)}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className={`text-sm font-medium ${
                acquiredCount === total ? 'text-green-400' : 'text-amber-400'
              }`}>
                {acquiredCount}/{total}
              </span>
              <p className="text-[10px] text-slate-500">blueprints</p>
            </div>
          </div>
        </button>
      )
    }

    return (
      <div
        key={group.title}
        className={`rounded-lg border overflow-hidden ${
          group.isLawful ? 'border-green-500/20' : 'border-red-500/20'
        }`}
      >
        <div className={`px-3 py-2.5 border-b ${
          group.isLawful ? 'border-green-500/10 bg-green-950/10' : 'border-red-500/10 bg-red-950/10'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className={`font-medium text-sm ${group.isLawful ? 'text-green-300' : 'text-red-400'}`}>
                {group.title}
              </h4>
              {group.category && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-amber-950/50 text-amber-300 border border-amber-500/40 rounded">
                  {group.category}
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-slate-500 pt-0.5">
              {group.variants.length} variant{group.variants.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="divide-y divide-slate-800/80">
          {group.variants.map(mission => renderVariantRow(mission))}
        </div>
      </div>
    )
  }

  const renderMissionSection = (
    title: string,
    tone: 'lawful' | 'illegal',
    groups: MissionGroup[]
  ) => {
    if (groups.length === 0) return null

    const headerClass = tone === 'lawful'
      ? 'text-green-300 border-green-500/30 bg-green-950/20'
      : 'text-red-300 border-red-500/30 bg-red-950/20'

    return (
      <section className="space-y-2">
        <div className={`rounded-lg border px-3 py-2 ${headerClass}`}>
          <h3 className="text-sm font-semibold">
            {title}
            <span className="ml-2 text-xs font-normal opacity-80">
              {groups.length} mission type{groups.length !== 1 ? 's' : ''}
            </span>
          </h3>
        </div>
        <div className="space-y-2">
          {groups.map((group) => renderMissionGroup(group))}
        </div>
      </section>
    )
  }

  const renderSystemFilter = () => {
    if (availableSystems.length <= 1) return null

    const buttonClass = (active: boolean) =>
      active
        ? 'site-filter-selected-orange'
        : 'text-slate-400 hover:text-white'

    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">System</span>
        <div className="flex flex-wrap items-center gap-1 p-1 site-chip-strip w-fit">
          <button
            type="button"
            onClick={() => setSystemFilter('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${buttonClass(systemFilter === 'all')}`}
          >
            All
          </button>
          {availableSystems.map((system) => (
            <button
              key={system}
              type="button"
              onClick={() => setSystemFilter(system)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${buttonClass(systemFilter === system)}`}
            >
              {SYSTEM_LABELS[system]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const renderFactionTagFilters = () => {
    if (availableFactionTags.length === 0) return null

    return (
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide shrink-0">
          Tags
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {availableFactionTags.map((tag) => {
            const active = selectedTagIdSet.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTagFilter(tag.id)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors site-btn-shimmer ${
                  active
                    ? `${tag.className} ring-1 ring-orange-400/70`
                    : 'site-filter-idle text-[10px] px-1.5 py-0.5'
                }`}
                title={
                  active
                    ? `Remove filter: ${tag.label}`
                    : `Filter by: ${tag.label}`
                }
              >
                {tag.label}
              </button>
            )
          })}
          {selectedTagIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTagIds([])}
              className="site-btn-ghost text-[10px] px-1.5 py-0.5"
            >
              Clear tags
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-slate-600">›</span>}
            <button
              onClick={crumb.onClick}
              className={`${
                idx === breadcrumbs.length - 1
                  ? 'text-orange-400 cursor-default'
                  : 'text-slate-400 hover:text-white'
              }`}
              disabled={idx === breadcrumbs.length - 1}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {!selectedFaction && !selectedMission && (
        <>
          <div className="relative">
            <input
              type="text"
              placeholder="Search missions or factions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="site-input w-full pl-9 pr-4 py-2 text-sm"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {renderSystemFilter()}

          {filteredFactionList.length === 0 && (
            <p className="text-sm text-slate-500 py-6 text-center">
              No factions have missions{systemFilter !== 'all' ? ` in ${SYSTEM_LABELS[systemFilter]}` : ''}.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFactionList
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([faction, data]) => {
                const displayMissions =
                  systemFilter === 'all'
                    ? data.missions
                    : data.missions.filter((m) => missionMatchesSystem(m, systemFilter))
                const status = factionLawfulStatus(data)
                const typeCounts = countMissionTypesByLawful(displayMissions)
                const contractCount = displayMissions.length
                const systemsArray =
                  systemFilter === 'all' ? Array.from(data.systems) : [systemFilter]
                const cardClass =
                  status === 'mixed'
                    ? 'site-surface hover:border-orange-500/30'
                    : status === 'lawful'
                      ? 'bg-green-950/30 border-green-500/30 hover:border-green-500/50'
                      : 'bg-red-950/30 border-red-500/30 hover:border-red-500/50'
                return (
                  <button
                    key={faction}
                    onClick={() => setSelectedFaction(faction)}
                    className={`relative p-3 rounded-lg border text-left transition-all hover:scale-[1.01] overflow-hidden ${cardClass}`}
                  >
                    {status === 'mixed' && (
                      <>
                        <span className="absolute inset-y-0 left-0 w-1 bg-green-500/80" aria-hidden />
                        <span className="absolute inset-y-0 right-0 w-1 bg-red-500/80" aria-hidden />
                      </>
                    )}
                    <h4
                      className={`font-medium pl-1 ${
                        status === 'mixed'
                          ? 'text-slate-100'
                          : status === 'lawful'
                            ? 'text-green-300'
                            : 'text-red-400'
                      }`}
                    >
                      {faction}
                    </h4>
                    {status === 'mixed' && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-950/50 text-green-300 border border-green-500/40 rounded">
                          {typeCounts.lawful} verified
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-950/50 text-red-400 border border-red-500/40 rounded">
                          {typeCounts.illegal} unverified
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap pl-1">
                      {systemsArray.map(sys => (
                        <span
                          key={sys}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${SYSTEM_COLORS[sys].bg} ${SYSTEM_COLORS[sys].border} ${SYSTEM_COLORS[sys].text}`}
                        >
                          {SYSTEM_LABELS[sys]}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 pl-1">
                      {typeCounts.lawful + typeCounts.illegal} mission type
                      {typeCounts.lawful + typeCounts.illegal !== 1 ? 's' : ''} · {contractCount}{' '}
                      contract variant{contractCount !== 1 ? 's' : ''}
                    </p>
                  </button>
                )
              })}
          </div>
        </>
      )}

      {selectedFaction && !selectedMission && (
        <>
          <div className="relative">
            <input
              type="text"
              placeholder="Search missions in this faction..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="site-input w-full pl-9 pr-4 py-2 text-sm"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {renderSystemFilter()}
            {renderFactionTagFilters()}
          </div>

          {selectedFactionMissionGroups.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No missions match your search
              {selectedTagIds.length > 0 ? ' or selected tags' : ''}.
            </p>
          ) : isMixedFaction ? (
            <div className="space-y-6">
              {renderMissionSection('Verified missions', 'lawful', lawfulMissionGroups)}
              {renderMissionSection('Unverified missions', 'illegal', illegalMissionGroups)}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedFactionMissionGroups.map((group) => renderMissionGroup(group))}
            </div>
          )}
        </>
      )}

      {selectedMission && (
        <div className="site-panel space-y-4 pl-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className={`text-base font-semibold ${selectedMission.isLawful ? 'text-green-300' : 'text-red-400'}`}>
                {selectedMission.title}
              </h3>
              <div className="mt-2">
                {renderMissionTags(selectedMission)}
              </div>
              {selectedMission.description ? (
                <details
                  key={selectedMission.entryKey}
                  className="site-surface mt-3 px-3 py-2 group"
                >
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                    <span>Mission text</span>
                    <span className="text-slate-500 font-normal normal-case tracking-normal text-xs">
                      <span className="group-open:hidden">Show</span>
                      <span className="hidden group-open:inline">Hide</span>
                    </span>
                  </summary>
                  <div className="pb-2 pt-1 site-divider mt-1">
                    <MissionDescriptionText text={selectedMission.description} />
                    <p className="mt-2 text-[11px] text-slate-500">
                      Violet chips are filled in by the game when you take the contract (location,
                      destination, amounts, etc.).
                    </p>
                  </div>
                </details>
              ) : null}
              <p className="text-sm text-slate-400 mt-3">
                Blueprint rewards from this contract
              </p>
              <p className="text-lg font-semibold mt-0.5">
                <span className={blueprintStats.acquired === blueprintStats.total ? 'text-green-400' : 'text-amber-400'}>
                  {blueprintStats.acquired}
                </span>
                <span className="text-slate-500">/{blueprintStats.total}</span>
                <span className="text-slate-500 text-sm ml-2">acquired</span>
              </p>
            </div>
            <button
              onClick={handleBack}
              className="site-btn-secondary shrink-0 px-3 py-1.5 text-sm"
            >
              ← Back
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedMissionBlueprints.map(bp => {
              const specLine = bp.fullBlueprint ? formatBlueprintSpecLine(bp.fullBlueprint) : null
              return (
              <div
                key={bp.name}
                className={`p-3 rounded-lg border transition-all ${
                  bp.isAcquired
                    ? 'bg-green-950/20 border-green-500/20 opacity-60'
                    : bp.isTracked
                      ? 'bg-amber-950/30 border-amber-500/30'
                      : 'site-surface hover:border-orange-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      bp.isAcquired ? 'text-green-400 line-through' : 'text-white'
                    }`}>
                      {bp.displayName}
                    </p>
                    {specLine && (
                      <p
                        className="text-xs text-slate-400 leading-snug mt-0.5 truncate"
                        title={specLine}
                      >
                        {specLine}
                      </p>
                    )}
                    <BlueprintMissionMeta
                      isAcquired={bp.isAcquired}
                      isTracked={bp.isTracked}
                      dropChance={bp.dropChance}
                    />
                  </div>
                  {!bp.isAcquired && bp.fullBlueprint && (
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getRewardMissionsForBlueprint(bp.fullBlueprint.internalName).length > 0 && (
                        <div className="flex items-center gap-1">
                          {!bp.isTracked && (
                            <button
                              type="button"
                              onClick={() => onAddToTracker(bp.fullBlueprint!.internalName)}
                              className="px-2 py-1 text-[10px] font-medium text-amber-300 border border-amber-500/40 rounded hover:bg-amber-950/40 transition-colors"
                            >
                              Track
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setMissionsModalBlueprint({
                                id: bp.fullBlueprint!.internalName,
                                name: bp.displayName,
                              })
                            }
                            className="px-2 py-1 text-[10px] font-medium text-sky-300 border border-sky-500/40 rounded hover:bg-sky-950/40 transition-colors"
                          >
                            Missions
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void onMarkAcquired(bp.fullBlueprint!.internalName)}
                        className="px-2 py-1 text-[10px] font-bold text-emerald-900 bg-emerald-500 hover:bg-emerald-400 border border-emerald-400 rounded shadow-sm transition-colors"
                      >
                        ✓ Got It!
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}
      {missionsModalBlueprint && (
        <BlueprintRewardMissionsModal
          blueprintName={missionsModalBlueprint.name}
          missions={missionsModalList}
          onClose={() => setMissionsModalBlueprint(null)}
          onSelectMission={navigateToRewardMission}
        />
      )}
    </div>
  )
}
