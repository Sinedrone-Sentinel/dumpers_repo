/**
 * Cross-system / cross-template HPP spawn inheritance verified in-game but not
 * stored on the target HarvestableProviderPreset record in DataForge.
 *
 * Example: Terminus (Pyro VI) lagrange ring uses the Yela Ring epic asteroid
 * pool (HPP_Stanton2c_Belt) for Ouratite — confirmed in-game and on SC Wiki API
 * (provider_names: HPP_Stanton2c_Belt on Terminus).
 */

/**
 * @typedef {object} HppSpawnInheritanceRule
 * @property {string} sourceHppKey
 * @property {string} targetSpawnKey
 * @property {string} targetGuideName
 * @property {string} [targetDisplayName]
 * @property {string} targetSystem
 * @property {string} [targetHppKey]
 * @property {(presetBasename: string) => boolean} [presetFilter]
 * @property {string} source
 */

/** @type {HppSpawnInheritanceRule[]} */
export const VERIFIED_HPP_SPAWN_INHERITANCE = [
  {
    sourceHppKey: 'HarvestableProviderPreset.HPP_Stanton2c_Belt',
    targetSpawnKey: 'Pyro Cool02',
    targetGuideName: 'Terminus',
    targetDisplayName: 'Pyro VI Lagrange belts',
    targetSystem: 'Pyro',
    targetHppKey: 'HarvestableProviderPreset.HPP_Pyro_Cool02',
    presetFilter: (basename) => basename === 'mining_asteroidepic_ouratite',
    source: 'verified_ring_inheritance',
  },
]

/**
 * Clone matching raw spawn links onto verified target sites.
 * @param {object[]} rawLinks - mutable array from parseMiningSpawns
 * @returns {number} links added
 */
export function applyVerifiedHppSpawnInheritance(rawLinks) {
  let added = 0

  for (const rule of VERIFIED_HPP_SPAWN_INHERITANCE) {
    const sources = rawLinks.filter(
      (link) =>
        link.hppKey === rule.sourceHppKey &&
        (!rule.presetFilter || rule.presetFilter(link.harvestablePreset))
    )

    for (const source of sources) {
      const clone = {
        ...source,
        locationName: rule.targetSpawnKey,
        spawnKey: rule.targetSpawnKey,
        displayName: rule.targetDisplayName ?? source.displayName,
        guideName: rule.targetGuideName,
        hppKey: rule.targetHppKey ?? source.hppKey,
        system: rule.targetSystem,
        inheritanceSource: rule.source,
        inheritedFromHppKey: rule.sourceHppKey,
      }
      rawLinks.push(clone)
      added++
    }
  }

  return added
}
