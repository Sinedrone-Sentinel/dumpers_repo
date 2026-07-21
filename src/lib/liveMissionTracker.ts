import lookupData from '../data/blueprint-name-lookup.json'
import {
  findContractForLiveMission,
  findMissionHintByTitle,
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
  hasBlueprintPool: boolean
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

const REP_PROGRESS_SUFFIX_RE = /^(.+?)\s*\[(\d+)\s*\/\s*(\d+)\s*(?:rep|Rep|REP)?\]\s*$/
const REP_AWARD_SUFFIX_RE = /^(.+?)\s*\[(\d+)\s*(?:rep|Rep|REP)\]\s*$/
const LOG_NOISE_TAIL_RE = /\s:\s*"\s*\[\d+\]\s*To Queue|\[\d+\]\s*To Queue/i

/** Strip HTML and Game.log queue noise from contract accept notification text. */
export function sanitizeLiveMissionRawLabel(raw: string | null | undefined): string {
  let text = (raw || '').trim()
  if (!text) return ''

  text = text.replace(/<[^>]+>/g, '')

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
      rewardText: formatRepReward(rep, rep),
    }
  }

  const title = formatMissionDisplayTitle({ debugName: trimmed, title: trimmed })
  return { title, rewardText: null }
}

function resolveLiveMissionDisplay(mission: DumperActiveMission): Omit<
  LiveMissionRow,
  'missionGuid' | 'remainingCount' | 'hasZeroRemaining' | 'hasBlueprintPool'
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

  const parsed = parseLiveMissionLabel(mission.debug_name)
  const hint = findMissionHintByTitle(parsed.title)
  const missionLabel = hint ? `${hint.faction}: ${parsed.title}` : parsed.title
  const displayLabel = parsed.rewardText ? `${missionLabel} · ${parsed.rewardText}` : missionLabel

  return {
    displayLabel,
    title: parsed.title,
    faction: hint?.faction ?? null,
    rewardText: parsed.rewardText,
    isLawful: hint?.isLawful ?? true,
    category: hint?.category ?? null,
    regions: categorizeRegions(hint?.system ? [hint.system] : []),
    subRegion: hint?.region ?? null,
    system: hint?.system || null,
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
    const hasBlueprintPool = pool.length > 0
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
      hasZeroRemaining: hasBlueprintPool && unacquired.length === 0,
      hasBlueprintPool,
    }
  })

  const remaining = Array.from(remainingByInternal.values()).sort((a, b) =>
    a.blueprintName.localeCompare(b.blueprintName)
  )

  missionRows.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))

  return { missions: missionRows, remaining }
}

/** Crash recovery window mirrors in-game save-state retention (~1 hour). */
export const CRASH_RECOVERY_WINDOW_MS = 60 * 60 * 1000

/** Server clears watch sessions after this window (see cleanup_stale_dumper_sessions). */
export const DUMPER_WATCH_STALE_MS = 125_000

/** Client-side stale check — slightly above server timeout (small buffer). */
export function isDumperWatchConnected(
  watchActive: boolean,
  lastPingAt: string | null | undefined
): boolean {
  if (!watchActive) return false
  if (!lastPingAt) return true
  const pingMs = Date.parse(lastPingAt)
  if (Number.isNaN(pingMs)) return watchActive
  return Date.now() - pingMs <= DUMPER_WATCH_STALE_MS
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
    message: 'Quit to menu — live lists paused',
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
      'BP Dumper is still watching your log. Missions may restore if you rejoin within one hour.',
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
  if (raw === 'crash_waiting' && statusAt) {
    const at = Date.parse(statusAt)
    if (!Number.isNaN(at) && now - at > CRASH_RECOVERY_WINDOW_MS) return 'tracking'
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
