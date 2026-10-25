/**
 * Resolve a contract's mobiGlas body from generator params, the contract
 * template, and English localization. Same shape the mission list already
 * stores: { description, descriptionKey }.
 */

const TOKEN_ONLY = /^~mission\s*\([^)]*\)$/i

export function resolveLoc(localization, key) {
  if (!key || !localization) return ''
  const bare = String(key).startsWith('@') ? String(key).slice(1) : String(key)
  return localization[bare] || localization._lowerMap?.[bare.toLowerCase()] || ''
}

export function normalizeMissionText(text) {
  return String(text || '').replace(/\\n/g, '\n').trim()
}

/** Real mission body. A lone contractor token is not one. */
export function isMissionProse(text) {
  const t = normalizeMissionText(text)
  if (t.length < 40) return false
  if (!/\s/.test(t)) return false
  if (TOKEN_ONLY.test(t)) return false
  if (t.startsWith('@')) return false
  if (t.includes('UNINITIALIZED')) return false
  return true
}

export function foundryRefParts(ref) {
  const match = String(ref || '').match(/libs\/foundry\/records\/.+\.json/i)
  return match ? match[0].split('/') : null
}

function descriptionFromKey(localization, descriptionKey) {
  if (!descriptionKey) return null
  const raw = String(descriptionKey)
  const lookedUp = normalizeMissionText(resolveLoc(localization, raw))
  const rawText = raw.startsWith('@') || !/\s/.test(raw) ? '' : normalizeMissionText(raw)
  const description = lookedUp || rawText
  if (!description) return null
  const storedKey = raw.startsWith('@') ? raw : `@${raw}`
  return { description, descriptionKey: storedKey }
}

export function descriptionFromParamList(params, localization) {
  const descParam = (params || []).find((p) => p.param === 'Description')
  if (!descParam?.value) return null
  return descriptionFromKey(localization, descParam.value)
}

export function templateDescription(templateRef, localization, templateCache, readTemplate) {
  if (!templateRef || !readTemplate) return null
  let record = templateCache?.get(templateRef)
  if (record === undefined) {
    record = readTemplate(templateRef)
    templateCache?.set(templateRef, record || null)
  }
  const display = record?._RecordValue_?.contractDisplayInfo?.displayString
  const key = Array.isArray(display) ? display[2] : ''
  if (!key || key === '@LOC_UNINITIALIZED') return null
  return descriptionFromKey(localization, key)
}

function siblingDescriptionKeys(titleKey) {
  const bare = String(titleKey || '').replace(/^@/, '')
  if (!bare) return []
  const keys = []
  if (/_title_/i.test(bare)) keys.push(bare.replace(/_title_/i, '_desc_'))
  if (/_Title$/i.test(bare)) keys.push(bare.replace(/_Title$/i, '_Description'))
  if (/Title/i.test(bare)) {
    keys.push(bare.replace(/Title/g, 'Desc'))
    keys.push(bare.replace(/Title/g, 'Description'))
  }
  return [...new Set(keys)]
}

export function buildTitleIndex(localization) {
  const index = new Map()
  if (!localization) return index
  for (const [key, value] of Object.entries(localization)) {
    if (key === '_lowerMap' || key.includes(',')) continue
    if (!/title|name/i.test(key)) continue
    const text = normalizeMissionText(value)
    if (!text || text.includes('~mission') || text.startsWith('@')) continue
    if (!index.has(text)) index.set(text, [])
    index.get(text).push(key)
  }
  return index
}

export function descriptionFromTitle(localization, titleIndex, titleKey, title) {
  for (const key of siblingDescriptionKeys(titleKey)) {
    const hit = descriptionFromKey(localization, key)
    if (hit && isMissionProse(hit.description)) return hit
  }
  const titleText = normalizeMissionText(title)
  if (!titleText || titleText.includes('~mission') || titleText.startsWith('@')) return null
  for (const key of titleIndex?.get(titleText) || []) {
    for (const sibling of siblingDescriptionKeys(key)) {
      const hit = descriptionFromKey(localization, sibling)
      if (hit && isMissionProse(hit.description)) return hit
    }
  }
  return null
}

function difficultyCode(blob) {
  const raw = String(blob || '').toLowerCase()
  if (raw.includes('intro')) return 'Intro'
  if (raw.includes('veryeasy') || raw.includes('_ve')) return 'VE'
  if (raw.includes('veryhard') || raw.includes('_vh')) return 'VH'
  if (raw.includes('super') || raw.includes('_s_') || raw.includes('desc_s')) return 'S'
  if (raw.includes('easy') || raw.includes('_e_') || raw.includes('desc_e')) return 'E'
  if (raw.includes('medium') || raw.includes('_m_') || raw.includes('desc_m')) return 'M'
  if (raw.includes('hard') || raw.includes('_h_') || raw.includes('desc_h')) return 'H'
  return null
}

export function numberedSiblingDescription(localization, descriptionKey) {
  const bare = String(descriptionKey || '').replace(/^@/, '')
  if (!bare) return null
  for (const suffix of ['_0001', '_001']) {
    if (bare.endsWith(suffix)) continue
    const hit = descriptionFromKey(localization, bare + suffix)
    if (hit && isMissionProse(hit.description)) return hit
  }
  return null
}

export function factionActivityDescription(localization, { debugName, descriptionKey }) {
  const org = String(debugName || '').split('_')[0]
  if (!org) return null
  const blob = `${debugName || ''} ${descriptionKey || ''}`.toLowerCase()
  const diff = difficultyCode(blob)
  const candidates = []
  if (blob.includes('blackbox')) {
    if (diff) {
      candidates.push(`${org}_blackbox_${diff}_Desc_001`, `${org}_blackbox_${diff}_desc_001`)
    }
  }
  if (blob.includes('destroyprobe') || blob.includes('destroysatellite')) {
    if (diff) {
      candidates.push(`${org}_destroyprobe_${diff}_desc_001`, `${org}_destroyprobe_${diff}_Desc_001`)
    }
  }
  if (blob.includes('recoveritem') || (blob.includes('recovery') && !blob.includes('blackbox'))) {
    candidates.push(`${org}_RecoverItem_Generic_Desc_001`)
  }
  for (const key of candidates) {
    const hit = descriptionFromKey(localization, key)
    if (hit && isMissionProse(hit.description)) return hit
  }
  return null
}

export function scenarioJournalDescription(localization, scenarioKey) {
  const key = String(scenarioKey || '').toLowerCase()
  const locKey = key.includes('rox') || key.includes('xenothreat')
    ? 'X2_JournalTracker_Content'
    : key.includes('ors')
      ? 'ORS_JournalTracker_Content'
      : ''
  if (!locKey) return null
  const hit = descriptionFromKey(localization, locKey)
  return hit && isMissionProse(hit.description) ? hit : null
}

/**
 * @param {object} args
 * @param {boolean} [args.preferShared] Bridged cards share one title. Use the
 *   title's description instead of the first variant's commodity-specific body.
 */
export function resolveMissionDescription({
  contract,
  generator,
  localization,
  titleIndex,
  templateCache,
  readTemplate,
  title,
  titleKey,
  debugName,
  preferShared = false,
}) {
  if (preferShared) {
    const shared = descriptionFromTitle(localization, titleIndex, titleKey, title)
    if (shared) return shared
  }

  const lists = [
    contract?.paramOverrides?.stringParamOverrides,
    generator?.contractParams?.stringParamOverrides,
  ]
  let tokenHit = null
  for (const params of lists) {
    const hit = descriptionFromParamList(params, localization)
    if (!hit) continue
    if (isMissionProse(hit.description)) return hit
    if (!tokenHit) tokenHit = hit
  }

  const fromTemplate = templateDescription(
    contract?.template,
    localization,
    templateCache,
    readTemplate,
  )
  if (fromTemplate && isMissionProse(fromTemplate.description)) return fromTemplate

  const fromTitle = descriptionFromTitle(localization, titleIndex, titleKey, title)
  if (fromTitle) return fromTitle

  const numbered = numberedSiblingDescription(localization, tokenHit?.descriptionKey)
  if (numbered) return numbered

  const factionBody = factionActivityDescription(localization, {
    debugName: debugName || contract?.debugName,
    descriptionKey: tokenHit?.descriptionKey,
  })
  if (factionBody) return factionBody

  return null
}
