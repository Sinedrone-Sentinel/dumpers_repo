import lookupData from '../data/blueprint-name-lookup.json'

export interface DumperActiveMission {
  user_id: string
  mission_guid: string
  contract_definition_id: string | null
  debug_name: string
  started_at: string
}

export interface LiveMissionRow {
  missionGuid: string
  debugName: string
  contractDefinitionId: string | null
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

export function poolInternalNamesForContract(contractDefinitionId: string | null | undefined): string[] {
  if (!contractDefinitionId) return []
  const key = contractDefinitionId.trim().toLowerCase()
  return byContractDefinitionId[key] ?? []
}

export function computeLiveTrackerView(
  missions: DumperActiveMission[],
  acquiredBlueprints: Record<string, boolean>
): { missions: LiveMissionRow[]; remaining: RemainingBlueprintRow[] } {
  const acquiredSet = acquiredBlueprints
  const remainingByInternal = new Map<string, RemainingBlueprintRow>()

  const missionRows: LiveMissionRow[] = missions.map((mission) => {
    const pool = poolInternalNamesForContract(mission.contract_definition_id)
    const unacquired = pool.filter((internalName) => !acquiredSet[internalName])

    for (const internalName of unacquired) {
      if (remainingByInternal.has(internalName)) continue
      const entry = byInternalName[internalName]
      remainingByInternal.set(internalName, {
        internalName,
        blueprintName: entry?.blueprintName ?? internalName,
        categoryName: entry?.categoryName ?? null,
      })
    }

    return {
      missionGuid: mission.mission_guid,
      debugName: mission.debug_name,
      contractDefinitionId: mission.contract_definition_id,
      remainingCount: unacquired.length,
      hasZeroRemaining: pool.length > 0 && unacquired.length === 0,
    }
  })

  const remaining = Array.from(remainingByInternal.values()).sort((a, b) =>
    a.blueprintName.localeCompare(b.blueprintName)
  )

  missionRows.sort((a, b) => a.debugName.localeCompare(b.debugName))

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
