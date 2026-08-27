/**
 * Blueprint pools on contract records, plus same-activity sibling inheritance.
 *
 * Some CIG contracts are first-offer / variant copies of the same activity
 * (e.g. Orison Platforms Under Attack vs Retake Platforms From Nine Tails).
 * The variant often has empty contractResults while the sibling lists
 * BlueprintRewards. Live tracker must still map the variant to that pool.
 *
 * Pairing is exact: the empty contract's debugName or template stem must match
 * a sibling that already has pools. Mixed generators (Foxwell, etc.) are not
 * unioned. This is not the generator introContracts invite list.
 */

export function extractContractBlueprintPools(contract) {
  const blueprintPools = []
  const results = contract?.contractResults?.contractResults
  if (!Array.isArray(results)) return blueprintPools
  for (const result of results) {
    if (!result) continue
    if (result._Type_ === 'BlueprintRewards' && result.blueprintPool) {
      const poolMatch = String(result.blueprintPool).match(/([^/]+)\.json$/i)
      if (poolMatch) {
        const poolKey = poolMatch[1]
          .replace(/bp_rewards_/i, '')
          .replace(/bp_missionreward_/i, '')
          .toLowerCase()
        blueprintPools.push({
          key: poolKey,
          chance: result.chance || 1.0,
          path: result.blueprintPool,
        })
      }
    }
  }
  return blueprintPools
}

export function templateBasename(templatePath) {
  const match = String(templatePath || '').match(/([^/]+)\.json$/i)
  return match ? match[1].toLowerCase() : ''
}

/** Stem used to pair a first-offer variant with its pooled sibling (SOO2_Intro -> SOO2). */
export function activityVariantStem(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  const stripped = raw.replace(/_?intro$/i, '')
  return stripped === raw ? '' : stripped
}

export function buildSiblingPoolIndexes(generatorContracts) {
  const byDebugName = new Map()
  const byTemplate = new Map()
  for (const contract of generatorContracts || []) {
    const pools = extractContractBlueprintPools(contract)
    if (!pools.length) continue
    const debugKey = String(contract.debugName || '').toLowerCase()
    if (debugKey) byDebugName.set(debugKey, pools)
    const tmpl = templateBasename(contract.template)
    if (tmpl) byTemplate.set(tmpl, pools)
  }
  return { byDebugName, byTemplate }
}

export function inheritSiblingBlueprintPools(contract, indexes) {
  const own = extractContractBlueprintPools(contract)
  if (own.length) return own
  const { byDebugName, byTemplate } = indexes || {}

  const debugStem = activityVariantStem(contract.debugName)
  if (debugStem && byDebugName?.has(debugStem.toLowerCase())) {
    return byDebugName.get(debugStem.toLowerCase())
  }

  const tmpl = templateBasename(contract.template)
  const tmplStem = activityVariantStem(tmpl)
  if (tmplStem && byTemplate?.has(tmplStem)) {
    return byTemplate.get(tmplStem)
  }

  return own
}
