import lookupData from '../data/blueprint-name-lookup.json'
import {
  findContractForLiveMission,
  getContractMissionLabel,
} from './blueprintMissionRewards'
import { formatMissionDisplayTitle } from './missionDisplay'
import { resolveMissionIsLawful } from './missionLawfulStatus'
import {
  formatRepReward,
  formatScenarioPointsRequirement,
} from './missionAcquisition'
import { categorizeRegions, type Region } from './missions'

export interface DumperActiveMission {
  user_id: string
  mission_guid: string
  contract_definition_id: string | null
  debug_name: string
  started_at: string
}

export interface LiveMissionRow {
  missionGuid: string
  displayLabel: string
  title: string
  faction: string | null
  rewardText: string | null
  isLawful: boolean
  category: string | null
  regions: Region[]
  subRegion: string | null
  system: string | null
  remainingCount: number
  hasZeroRemaining: boolean
}

export interface RemainingBlueprintRow {
  internalName: string
  blueprintName: string
  categoryName: string | null
}

const byContractDefinitionId = lookupData.byContractDefinitionId as Record<string, string[]>
const byInternalName = lookupData.byInternalName as Record<
  string,
  { blueprintName: string; categoryName: string | null }
>

function resolveBlueprintDisplayName(internalName: string): string {
  const entry = byInternalName[internalName]
  if (entry?.blueprintName) return entry.blueprintName
  return internalName
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function poolInternalNamesForContract(
  contractDefinitionId: string | null | undefined,
  debugName?: string | null
): string[] {
  const idKey = contractDefinitionId?.trim().toLowerCase()
  if (idKey) {
    const byId = byContractDefinitionId[idKey]
    if (byId?.length) return byId
  }
  const debugKey = debugName?.trim().toLowerCase()
  if (debugKey) return byContractDefinitionId[debugKey] ?? []
  return []
}

function resolveLiveMissionDisplay(mission: DumperActiveMission): Omit<
  LiveMissionRow,
  'missionGuid' | 'remainingCount' | 'hasZeroRemaining'
> {
  const contract = findContractForLiveMission(
    mission.contract_definition_id,
    mission.debug_name
  )

  if (contract) {
    const missionLabel = getContractMissionLabel(contract)
    const rewardText =
      contract.scenarioPointsRequired != null
        ? formatScenarioPointsRequirement(
            contract.scenarioPointsRequired,
            contract.scenarioProgressLabel
          )
        : formatRepReward(contract.repPoints, contract.repPoints)
    const displayLabel = rewardText ? `${missionLabel} · ${rewardText}` : missionLabel

    return {
      displayLabel,
      title: missionLabel.includes(': ')
        ? missionLabel.slice(missionLabel.indexOf(': ') + 2)
        : missionLabel,
      faction: contract.faction,
      rewardText,
      isLawful: resolveMissionIsLawful({
        factionKey: contract.factionKey,
        factionName: contract.faction,
        debugName: contract.debugName,
      }),
      category: contract.category,
      regions: categorizeRegions(contract.system ? [contract.system] : []),
      subRegion: contract.region,
      system: contract.system || null,
    }
  }

  const title = formatMissionDisplayTitle({
    debugName: mission.debug_name,
    title: mission.debug_name,
  })

  return {
    displayLabel: title,
    title,
    faction: null,
    rewardText: null,
    isLawful: true,
    category: null,
    regions: [],
    subRegion: null,
    system: null,
  }
}

export function computeLiveTrackerView(
  missions: DumperActiveMission[],
  acquiredBlueprints: Record<string, boolean>
): { missions: LiveMissionRow[]; remaining: RemainingBlueprintRow[] } {
  const acquiredSet = acquiredBlueprints
  const remainingByInternal = new Map<string, RemainingBlueprintRow>()

  const missionRows: LiveMissionRow[] = missions.map((mission) => {
    const pool = poolInternalNamesForContract(
      mission.contract_definition_id,
      mission.debug_name
    )
    const unacquired = pool.filter((internalName) => !acquiredSet[internalName])
    const display = resolveLiveMissionDisplay(mission)

    for (const internalName of unacquired) {
      if (remainingByInternal.has(internalName)) continue
      const entry = byInternalName[internalName]
      remainingByInternal.set(internalName, {
        internalName,
        blueprintName: entry?.blueprintName ?? resolveBlueprintDisplayName(internalName),
        categoryName: entry?.categoryName ?? null,
      })
    }

    return {
      missionGuid: mission.mission_guid,
      ...display,
      remainingCount: unacquired.length,
      hasZeroRemaining: pool.length > 0 && unacquired.length === 0,
    }
  })

  const remaining = Array.from(remainingByInternal.values()).sort((a, b) =>
    a.blueprintName.localeCompare(b.blueprintName)
  )

  missionRows.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))

  return { missions: missionRows, remaining }
}

/** Client-side stale check mirrors server 90s timeout (small buffer). */
export function isDumperWatchConnected(
  watchActive: boolean,
  lastPingAt: string | null | undefined
): boolean {
  if (!watchActive) return false
  if (!lastPingAt) return true
  const pingMs = Date.parse(lastPingAt)
  if (Number.isNaN(pingMs)) return watchActive
  return Date.now() - pingMs <= 95_000
}

export type DumperGameStatus =
  | 'tracking'
  | 'exit_menu'
  | 'quit_game'
  | 'crash_waiting'
  | 'reconnected'

export interface LiveTrackerStatusBar {
  status: DumperGameStatus
  message: string
  dotClass: string
  barClass: string
  textClass: string
  subMessage?: string
}

const STATUS_BAR: Record<DumperGameStatus, Omit<LiveTrackerStatusBar, 'status'>> = {
  tracking: {
    message: 'BP Dumper connected — live updates enabled',
    dotClass: 'bg-emerald-400',
    barClass: 'border-emerald-500/30 bg-emerald-950/30',
    textClass: 'text-emerald-100',
  },
  exit_menu: {
    message: 'Quit to menu — active missions cleared',
    subMessage: 'Mission lists resume when you load back into the PU.',
    dotClass: 'bg-amber-400',
    barClass: 'border-amber-500/30 bg-amber-950/30',
    textClass: 'text-amber-100',
  },
  quit_game: {
    message: 'Star Citizen closed — active missions cleared',
    subMessage: 'Launch the game and enter the PU to resume live tracking.',
    dotClass: 'bg-amber-400',
    barClass: 'border-amber-500/30 bg-amber-950/30',
    textClass: 'text-amber-100',
  },
  crash_waiting: {
    message: 'Game crash detected — waiting for you to reconnect',
    subMessage:
      'BP Dumper is still watching your log. Missions may restore if you rejoin within about an hour.',
    dotClass: 'bg-orange-400 animate-pulse',
    barClass: 'border-orange-500/30 bg-orange-950/30',
    textClass: 'text-orange-100',
  },
  reconnected: {
    message: 'Back online — live mission tracking resumed',
    dotClass: 'bg-emerald-400',
    barClass: 'border-emerald-500/30 bg-emerald-950/30',
    textClass: 'text-emerald-100',
  },
}

/** Brief flash after reconnect before settling on the default tracking message. */
export function resolveDisplayGameStatus(
  status: string | null | undefined,
  statusAt: string | null | undefined,
  now = Date.now()
): DumperGameStatus {
  const raw = (status as DumperGameStatus | null) ?? 'tracking'
  if (raw === 'reconnected' && statusAt) {
    const at = Date.parse(statusAt)
    if (!Number.isNaN(at) && now - at > 10_000) return 'tracking'
  }
  if (raw in STATUS_BAR) return raw
  return 'tracking'
}

export function getLiveTrackerStatusBar(
  status: string | null | undefined,
  statusAt: string | null | undefined,
  now = Date.now()
): LiveTrackerStatusBar {
  const resolved = resolveDisplayGameStatus(status, statusAt, now)
  return { status: resolved, ...STATUS_BAR[resolved] }
}

export function shouldHideLiveMissionLists(status: DumperGameStatus): boolean {
  return status === 'exit_menu' || status === 'quit_game'
}
