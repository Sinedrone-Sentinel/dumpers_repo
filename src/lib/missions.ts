export interface RewardMission {
  mission: string
  chance?: number
  locations?: string[]
}

export interface BlueprintMissionSource {
  blueprintId: string
  blueprintName: string
  rewardMissions?: RewardMission[]
}

export interface MissionListEntry {
  missionKey: string
  mission: string
  giver: string
  linkedBlueprintIds: string[]
  linkedBlueprintNames: string[]
  unacquiredBlueprintIds: string[]
}

export interface MissionGiverGroup {
  giver: string
  missions: MissionListEntry[]
}

export function parseMissionGiver(mission: string): string {
  const colon = mission.indexOf(':')
  if (colon <= 0) return 'Unknown'
  return mission.slice(0, colon).trim()
}

export function missionKey(mission: string): string {
  const normalized = mission.trim().toLowerCase()
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i)
    hash |= 0
  }
  return `m_${Math.abs(hash).toString(36)}`
}

export function buildMissionList(
  targetBlueprints: BlueprintMissionSource[],
  acquiredBlueprintIds: Set<string>,
  missionPrefs: Record<string, boolean>
): MissionGiverGroup[] {
  const missionMap = new Map<string, MissionListEntry>()

  for (const bp of targetBlueprints) {
    for (const reward of bp.rewardMissions ?? []) {
      const mission = reward.mission?.trim()
      if (!mission) continue

      const key = missionKey(mission)
      let entry = missionMap.get(key)
      if (!entry) {
        entry = {
          missionKey: key,
          mission,
          giver: parseMissionGiver(mission),
          linkedBlueprintIds: [],
          linkedBlueprintNames: [],
          unacquiredBlueprintIds: [],
        }
        missionMap.set(key, entry)
      }

      if (!entry.linkedBlueprintIds.includes(bp.blueprintId)) {
        entry.linkedBlueprintIds.push(bp.blueprintId)
        entry.linkedBlueprintNames.push(bp.blueprintName)
      }
    }
  }

  const activeMissions: MissionListEntry[] = []

  for (const entry of missionMap.values()) {
    entry.unacquiredBlueprintIds = entry.linkedBlueprintIds.filter(
      (id) => !acquiredBlueprintIds.has(id)
    )

    if (entry.unacquiredBlueprintIds.length === 0) continue

    if (missionPrefs[entry.missionKey] !== true) continue

    activeMissions.push(entry)
  }

  const byGiver = new Map<string, MissionListEntry[]>()
  for (const entry of activeMissions) {
    const list = byGiver.get(entry.giver) ?? []
    list.push(entry)
    byGiver.set(entry.giver, list)
  }

  return [...byGiver.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([giver, missions]) => ({
      giver,
      missions: missions.sort((a, b) => a.mission.localeCompare(b.mission)),
    }))
}

export interface TargetBlueprintMissionOption {
  missionKey: string
  mission: string
  giver: string
}

export function getMissionsForBlueprint(
  blueprint: BlueprintMissionSource,
  acquiredBlueprintIds: Set<string>
): TargetBlueprintMissionOption[] {
  if (acquiredBlueprintIds.has(blueprint.blueprintId)) return []

  const seen = new Set<string>()
  const options: TargetBlueprintMissionOption[] = []

  for (const reward of blueprint.rewardMissions ?? []) {
    const mission = reward.mission?.trim()
    if (!mission) continue

    const key = missionKey(mission)
    if (seen.has(key)) continue
    seen.add(key)

    options.push({
      missionKey: key,
      mission,
      giver: parseMissionGiver(mission),
    })
  }

  return options.sort((a, b) => a.mission.localeCompare(b.mission))
}
