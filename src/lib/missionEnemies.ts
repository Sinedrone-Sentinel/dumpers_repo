import missionEnemiesData from '../data/game-mission-enemies.json'

export interface MissionEnemyGroup {
  label: string
  lines: string[]
  /** The wave does not spawn on every run. */
  maybe?: boolean
}

const byId = (
  missionEnemiesData as { byId?: Record<string, MissionEnemyGroup[]> }
).byId ?? {}

export function enemiesForContract(contractId: string | null | undefined): MissionEnemyGroup[] {
  if (!contractId) return []
  const groups = byId[contractId.toLowerCase()]
  if (!Array.isArray(groups)) return []
  return groups.filter(
    (group) => group && group.label && Array.isArray(group.lines) && group.lines.length > 0,
  )
}
