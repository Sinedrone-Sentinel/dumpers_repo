/**
 * Per-contract completion rewards for every contract (with or without blueprint
 * pools), so the Live Mission Tracker can show rep / event points on any mission.
 *
 * Event points (RSI Discovery, etc.) come from ContractResult_ScenarioProgress:
 * PointsToAward goes to the track whose completion tag the contract emits, and
 * the scenario's global progression (the member's own total) gets the same points.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function recordPathToFile(recordsRoot, recordPath) {
  const match = String(recordPath || '').match(/libs\/foundry\/records\/(.+\.json)$/i)
  return match ? join(recordsRoot, match[1]) : null
}

function localize(localization, value) {
  const raw = String(value || '')
  const text = raw.startsWith('@') ? localization[raw.slice(1)] || '' : raw
  return text.replace(/[:\s]+$/, '').trim()
}

/** Event points on success: `[{ track, points, event }]`, personal total last. */
export function createScenarioPointsResolver({ recordsRoot, localization, eventLabelFor }) {
  const scenarioCache = new Map()

  function loadScenario(recordPath) {
    if (scenarioCache.has(recordPath)) return scenarioCache.get(recordPath)
    let scenario = null
    const file = recordPathToFile(recordsRoot, recordPath)
    if (file && existsSync(file)) {
      try {
        const json = JSON.parse(readFileSync(file, 'utf8'))
        const trackByTag = new Map()
        let personalTrack = null
        for (const tier of json?._RecordValue_?.factionRewardTiers || []) {
          for (const progression of tier.tierProgressions || []) {
            const type = progression.completionType?._Type_
            const textKey = String(progression.progressionText || '')
            if (type === 'CompletionType_CompletionTag') {
              const tagId = progression.completionType?.completionTags?._RecordId_
              const label = localize(localization, textKey)
              if (tagId && label) trackByTag.set(tagId, label)
            } else if (type === 'CompletionType_GlobalProgression') {
              personalTrack = /playertotal|personal/i.test(textKey)
                ? 'Personal'
                : localize(localization, textKey) || null
            }
          }
        }
        const scenarioKey = String(json?._RecordName_ || '').replace(/^ScenarioProgress\./i, '')
        const event = eventLabelFor ? eventLabelFor(scenarioKey) : null
        scenario = { trackByTag, personalTrack, event }
      } catch {
        scenario = null
      }
    }
    scenarioCache.set(recordPath, scenario)
    return scenario
  }

  return function resolveScenarioPoints(contract) {
    const results = contract?.contractResults?.contractResults
    if (!Array.isArray(results)) return []

    const emittedTags = new Set()
    for (const result of results) {
      if (result?._Type_ !== 'ContractResult_CompletionTags') continue
      if (result.missionResults?.[0] !== true) continue
      for (const entry of result.completionTags || []) {
        const tagId = entry?.tag?._RecordId_
        if (tagId) emittedTags.add(tagId)
      }
    }

    const out = []
    for (const result of results) {
      if (result?._Type_ !== 'ContractResult_ScenarioProgress') continue
      if (result.missionResults?.[0] !== true) continue
      const points = Number(result.PointsToAward)
      if (!Number.isFinite(points) || points <= 0) continue
      const scenario = loadScenario(result.scenarioProgressPlugin?.scenarioProgressRecord)
      if (!scenario) continue
      for (const tagId of emittedTags) {
        const track = scenario.trackByTag.get(tagId)
        if (track) out.push({ track, points, event: scenario.event })
      }
      if (scenario.personalTrack) {
        out.push({ track: scenario.personalTrack, points, event: scenario.event })
      }
    }
    return out
  }
}

/** Compact index entry, or null when the contract awards nothing to show. */
export function buildMissionRewardEntry({ repEffects, scenarioPoints, notForRelease }) {
  const rep = (repEffects || [])
    .filter((e) => e && typeof e.amount === 'number' && e.amount !== 0)
    .map((e) => ({ faction: e.faction, amount: e.amount }))
  const scenario = (scenarioPoints || []).map((s) => ({
    track: s.track,
    points: s.points,
    ...(s.event ? { event: s.event } : {}),
  }))
  if (rep.length === 0 && scenario.length === 0) return null
  return {
    ...(rep.length ? { rep } : {}),
    ...(scenario.length ? { scenario } : {}),
    ...(notForRelease ? { nfr: true } : {}),
  }
}
