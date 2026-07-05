/**
 * Parse ore names from HPP harvestable preset basenames (ship, FPS, ground-vehicle).
 */

import { SHIP_ORE_SLUG_TO_NAME } from './miningOreNames.mjs'

const FPS_SLUG_TO_ORE = {
  aphorite: 'Aphorite',
  dolivine: 'Dolivine',
  hadanite: 'Hadanite',
  janalite: 'Janalite',
}

const GROUND_VEHICLE_SLUG_TO_ORE = {
  feynmaline: 'Feynmaline',
  glacosite: 'Glacosite',
  beradom: 'Beradom',
  beradon: 'Beradom',
}

/** HPP files that are not browsable mining-guide sites. */
export const HPP_SKIP_BASENAMES = new Set([
  'hpp_resourcerush_gold',
  'hpp_resourcerush_gold_highdensity',
  'hpp_shipgraveyard_001',
  'hpp_spacederelict_general',
])

export const HPP_MINEABLE_GROUPS = {
  SpaceShip_Mineables: 'shipMineables',
  FPS_Mineables: 'handMineables',
  GroundVehicle_Mineables: 'groundVehicleMineables',
}

export function oreFromHppMineablePreset(presetBasename) {
  const base = String(presetBasename || '')
  if (!base) return null

  if (base === 'mining_asteroidgoldonly') return 'Gold'

  let m = base.match(/^fpsmining_([a-z]+)$/i)
  if (m) return FPS_SLUG_TO_ORE[m[1].toLowerCase()] ?? null

  m = base.match(/^groundvehiclemining_([a-z]+)$/i)
  if (m) return GROUND_VEHICLE_SLUG_TO_ORE[m[1].toLowerCase()] ?? null

  m = base.match(/^mining_(?:asteroid)?(?:legendary|epic|rare|uncommon|common|surface)?_?(.*)$/i)
  if (!m) return null
  const slug = m[1].replace(/_rcd$/i, '').toLowerCase()
  return SHIP_ORE_SLUG_TO_NAME[slug] ?? null
}
