/**
 * Single-pass load of reputation standing records (shared by reputation system + contracts).
 */

import { readFileSync } from 'fs'
import { basename } from 'path'

function resolveStandingDisplayName(val, localization) {
  const displayNameKey = val.displayName?.startsWith('@') ? val.displayName.substring(1) : null
  return displayNameKey ? localization[displayNameKey] || val.displayName : val.displayName
}

/** Match contract generator standingDefs resolution (includes lowercase loc fallback). */
function resolveContractStandingDisplayName(val, localization) {
  let displayName = val.displayName || 'Unknown'
  if (displayName.startsWith('@')) {
    const locKey = displayName.slice(1)
    displayName = localization[locKey] || localization[locKey.toLowerCase()] || displayName.slice(1)
  }
  return displayName
}

/**
 * @param {string[]} standingFiles absolute paths
 * @param {Record<string, string>} localization
 * @param {string} extractedDataRoot
 */
export function buildReputationStandingCache(standingFiles, localization, extractedDataRoot) {
  const standingsByPath = {}
  const standingsByCategory = {}
  const standingDefs = {}

  for (const file of standingFiles) {
    let json
    try {
      json = JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      continue
    }
    if (!json?._RecordValue_) continue

    const val = json._RecordValue_
    const recordName = json._RecordName_ || basename(file, '.json')
    const resolvedDisplayName = resolveStandingDisplayName(val, localization)

    const pathParts = file.split(/[/\\]/)
    const standingsIdx = pathParts.findIndex((p) => p === 'standings')
    const category = standingsIdx >= 0 && pathParts[standingsIdx + 1] ? pathParts[standingsIdx + 1] : 'unknown'

    const standing = {
      id: json._RecordId_,
      name: val.name || recordName,
      displayName: resolvedDisplayName || '',
      displayNameKey: val.displayName || '',
      perkDescription: val.perkDescription || '',
      minReputation: val.minReputation || 0,
      driftReputation: val.driftReputation || 0,
      driftTimeHours: val.driftTimeHours || 0,
      gated: val.gated || false,
      category,
      recordName,
      filePath: file.replace(extractedDataRoot, '').replace(/^[/\\]/, ''),
    }

    const relativePath = file.replace(extractedDataRoot, '').replace(/\\/g, '/').replace(/^\//, '')
    standingsByPath[relativePath] = standing

    if (!standingsByCategory[category]) standingsByCategory[category] = []
    standingsByCategory[category].push(standing)

    standingDefs[recordName.toLowerCase()] = {
      displayName: resolveContractStandingDisplayName(val, localization),
      minReputation: val.minReputation || 0,
      gated: val.gated || false,
    }
  }

  for (const category of Object.keys(standingsByCategory)) {
    standingsByCategory[category].sort((a, b) => a.minReputation - b.minReputation)
  }

  return { standingsByPath, standingsByCategory, standingDefs }
}
