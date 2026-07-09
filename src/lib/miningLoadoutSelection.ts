import { listLoadoutsForVessel, type LoadoutKey, type MiningLoadoutStore } from './miningLoadoutStorage'
import type { MiningVesselId } from './miningVessels'

export function resolveActiveLoadoutLabel(
  store: MiningLoadoutStore,
  vesselId: MiningVesselId,
  loadoutKey: LoadoutKey
): string {
  const loadouts = listLoadoutsForVessel(store, vesselId)
  const active = loadouts.find((loadout) => loadout.key === loadoutKey) ?? loadouts[0]
  return active?.label ?? 'Default'
}
