/**
 * Blueprint reward pools that are not linked via contractgenerator BlueprintRewards.
 * Parsed from contract scenarios or bridged to generator groups at build time.
 */

/** Blueprint internal names excluded from mission tracking (non-craft mission props). */
export const BLUEPRINT_MISSION_TRACKING_EXCLUSIONS = [
  'carryable_2h_fl_missionitem_microsatellite_a',
  /** 4.10 mining gear — mirrors REWARD_POOL_TRACKING_EXCLUSIONS below. */
  'cargo_shipmining_pod_prospector',
  'mining_modules_active_stampede',
  'mining_modules_passive_torrent_mk3',
]

/** Reward pool keys excluded from mission tracking (mirrors exclusions above). */
export const REWARD_POOL_TRACKING_EXCLUSIONS = [
  'carryable_2h_fl_missionitem_microsatellite_a',
  /** Parent catalog pools; contracts link battaglia_rpt0/1/2 instead. */
  'battaglia',
  'battagliaexclusive',
  /** CIG typo duplicate of bp_reward_cds_combat_medium_helmet_01_02_01. */
  'bp_reward_ds_combat_medium_helmet_01_02_01',
  /**
   * 4.10 mining gear: pool record + craft BP + SCItem all shipped, but no
   * contractgenerator links them yet. Unlike the entries above these are not
   * structurally untrackable — re-check each patch and drop from this list once
   * CIG wires a contract.
   */
  'cargo_shipmining_pod_prospector',
  'mining_modules_active_stampede',
  'mining_modules_passive_torrent_mk3',
]

/** Red Wind pool exists in game data but has no BlueprintRewards on hauling contracts. */
export const REDWIND_BRIDGE = {
  poolKey: 'redwind',
  generatorSubpath: 'contracts/contractgenerator/interstellartransport_guild/redwind',
  /** One synthetic contract per generator file (Hauling, Recover Cargo, Recover Item). */
  oneContractPerGeneratorFile: true,
}

/** Scenario progress files with tiered blueprintPool arrays (XenoThreat Clear Air). */
export const SCENARIO_PROGRESS_PATHS = ['contracts/contractscenarios']
