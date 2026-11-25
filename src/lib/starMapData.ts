import type { StarMapIndex, StarMapSystem, StarMapSystems } from './starMap'
import indexJson from '../data/star-maps/index.json'

const systemFiles = import.meta.glob<{ default: StarMapSystem }>(
  ['../data/star-maps/*.json', '!../data/star-maps/index.json'],
  { eager: true },
)

const systems: StarMapSystems = {}
for (const mod of Object.values(systemFiles)) {
  const sys = mod.default
  if (sys?.id && Array.isArray(sys.markers)) systems[sys.id] = sys
}

const index: StarMapIndex = {
  ...(indexJson as StarMapIndex),
  systems: (indexJson as StarMapIndex).systems.filter((s) => systems[s.id]),
}

export function getStarMapData(): { index: StarMapIndex; systems: StarMapSystems } {
  return { index, systems }
}
