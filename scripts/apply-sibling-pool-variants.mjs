#!/usr/bin/env node
/**
 * Add catalog entries for same-activity variants that inherit a sibling
 * BlueprintRewards pool (parser already does this on a full extract parse).
 * Safe to re-run: skips contracts already present by id.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  buildSiblingPoolIndexes,
  extractContractBlueprintPools,
  inheritSiblingBlueprintPools,
  activityVariantStem,
} from './lib/contractBlueprintPools.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extractRoot = join(root, 'extracted-data/libs/foundry/records/contracts/contractgenerator')
const missionsPath = join(root, 'src/data/game-blueprint-missions.json')
const iniPath = join(root, 'extracted-data/Data/Localization/english/global.ini')

function walkJson(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkJson(full, out)
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out
}

function loadIni(path) {
  const map = {}
  if (!existsSync(path)) return map
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1)
  }
  return map
}

function locValue(loc, raw) {
  if (!raw) return ''
  if (String(raw).startsWith('@')) return loc[String(raw).slice(1)] || raw
  return raw
}

function stringParam(contract, name) {
  return contract.paramOverrides?.stringParamOverrides?.find((p) => p.param === name)?.value || ''
}

const loc = loadIni(iniPath)
const missions = JSON.parse(readFileSync(missionsPath, 'utf8'))
const byDebug = new Map(
  (missions.contracts || []).map((c) => [String(c.debugName || '').toLowerCase(), c])
)
const byId = new Set((missions.contracts || []).map((c) => String(c.id || '').toLowerCase()))

const added = []
const skippedNoSibling = []

for (const file of walkJson(extractRoot)) {
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  for (const generator of json?._RecordValue_?.generators || []) {
    const generatorContracts = [
      ...(generator.introContracts || []),
      ...(generator.contracts || []),
    ]
    const indexes = buildSiblingPoolIndexes(generatorContracts)
    for (const contract of generatorContracts) {
      const own = extractContractBlueprintPools(contract)
      const inherited = inheritSiblingBlueprintPools(contract, indexes)
      if (own.length || !inherited.length) continue
      const id = String(contract.id || '').toLowerCase()
      if (id && byId.has(id)) continue

      const stem = activityVariantStem(contract.debugName)
      const sibling = stem ? byDebug.get(stem.toLowerCase()) : null
      if (!sibling) {
        skippedNoSibling.push({
          debugName: contract.debugName,
          file: file.replace(root, ''),
          pools: inherited.map((p) => p.key),
        })
        continue
      }

      const titleKey = stringParam(contract, 'Title')
      const descKey = stringParam(contract, 'Description')
      const title = locValue(loc, titleKey) || contract.debugName
      const description = String(locValue(loc, descKey) || '').replace(/\\n/g, '\n').trim()
      const cloned = structuredClone(sibling)
      cloned.id = contract.id || contract.debugName
      cloned.debugName = contract.debugName
      cloned.title = title
      cloned.displayTitle = title
      cloned.titleKey = titleKey || cloned.titleKey
      cloned.description = description
      cloned.descriptionKey = descKey || null
      cloned.blueprintPools = inherited
      delete cloned.prereqMissions

      missions.contracts.push(cloned)
      byId.add(String(cloned.id).toLowerCase())
      byDebug.set(String(cloned.debugName).toLowerCase(), cloned)

      for (const pool of cloned.blueprintPools || []) {
        if (!missions.missionsByPool[pool.key]) missions.missionsByPool[pool.key] = []
        missions.missionsByPool[pool.key].push({
          title: cloned.title,
          displayTitle: cloned.displayTitle,
          titleKey: cloned.titleKey,
          faction: cloned.faction,
          factionKey: cloned.factionKey,
          debugName: cloned.debugName,
          isLawful: cloned.isLawful,
          system: cloned.system,
          region: cloned.region,
          category: cloned.category,
          minStanding: cloned.minStanding,
          maxStanding: cloned.maxStanding,
          repPoints: cloned.repPoints,
          repEffects: cloned.repEffects,
          locality: cloned.locality,
          frequency: cloned.frequency,
        })
      }

      added.push({
        debugName: cloned.debugName,
        title: cloned.title,
        sibling: sibling.debugName,
        pools: cloned.blueprintPools.map((p) => p.key),
      })
    }
  }
}

function fileNewline(raw) {
  return raw.includes('\r\n') ? '\r\n' : '\n'
}

function withNewline(text, nl) {
  return String(text).replace(/\r?\n/g, nl)
}

function indentJson(value, baseIndent) {
  const pad = ' '.repeat(baseIndent)
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line) => pad + line)
    .join('\n')
}

function insertBeforeContractsClose(raw, chunk) {
  const poolIdx = raw.indexOf('\n  "missionsByPool":')
  if (poolIdx < 0) throw new Error('missionsByPool key not found')
  const nl = fileNewline(raw)
  const marker = `${nl}  ],`
  const closeIdx = raw.lastIndexOf(marker, poolIdx)
  if (closeIdx < 0) throw new Error('contracts array close not found')
  return raw.slice(0, closeIdx) + ',' + nl + chunk + raw.slice(closeIdx)
}

function insertAfterMissionsByPoolSibling(raw, poolKey, siblingDebugName, entry, nl) {
  const sectionIdx = raw.indexOf('\n  "missionsByPool":')
  if (sectionIdx < 0) throw new Error('missionsByPool section not found')
  const keyNeedle = `\n    ${JSON.stringify(poolKey)}: [`
  const keyIdx = raw.indexOf(keyNeedle, sectionIdx)
  if (keyIdx < 0) throw new Error(`missionsByPool key not found: ${poolKey}`)
  const nextKeyIdx = raw.indexOf('\n    "', keyIdx + keyNeedle.length)
  const poolEnd = nextKeyIdx < 0 ? raw.length : nextKeyIdx
  const debugNeedle = `"debugName": ${JSON.stringify(siblingDebugName)}`
  const debugIdx = raw.indexOf(debugNeedle, keyIdx)
  if (debugIdx < 0 || debugIdx > poolEnd) {
    throw new Error(`sibling debugName not found in pool ${poolKey}: ${siblingDebugName}`)
  }
  // Walk to the end of this object, then insert a comma + new entry.
  let depth = 0
  let start = debugIdx
  for (let i = debugIdx; i >= keyIdx; i--) {
    if (raw[i] === '}') depth++
    else if (raw[i] === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth--
    }
  }
  depth = 0
  let end = start
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const chunk = withNewline(`,\n${indentJson(entry, 6)}`, nl || fileNewline(raw))
  return raw.slice(0, end + 1) + chunk + raw.slice(end + 1)
}

console.log(JSON.stringify({ added, skippedNoSibling }, null, 2))
const shouldWrite = process.argv.includes('--write')
if (added.length && shouldWrite) {
  let raw = readFileSync(missionsPath, 'utf8')
  const nl = fileNewline(raw)
  const newContracts = missions.contracts.slice(-added.length)
  const contractsChunk = withNewline(
    newContracts.map((c) => indentJson(c, 4)).join(',\n'),
    nl
  )
  raw = insertBeforeContractsClose(raw, contractsChunk)

  for (const contract of newContracts) {
    const siblingDebug = added.find((a) => a.debugName === contract.debugName)?.sibling
    for (const pool of contract.blueprintPools || []) {
      const entry = {
        title: contract.title,
        displayTitle: contract.displayTitle,
        titleKey: contract.titleKey,
        faction: contract.faction,
        factionKey: contract.factionKey,
        debugName: contract.debugName,
        isLawful: contract.isLawful,
        system: contract.system,
        region: contract.region,
        category: contract.category,
        minStanding: contract.minStanding,
        maxStanding: contract.maxStanding,
        repPoints: contract.repPoints,
        repEffects: contract.repEffects,
        locality: contract.locality,
        frequency: contract.frequency,
      }
      raw = insertAfterMissionsByPoolSibling(raw, pool.key, siblingDebug, entry, nl)
    }
  }

  writeFileSync(missionsPath, raw, 'utf8')
  console.log(`Wrote ${added.length} variant contract(s) to game-blueprint-missions.json`)
} else if (added.length) {
  console.log(`Dry run: ${added.length} variant contract(s). Re-run with --write to save.`)
} else {
  console.log('No new variant contracts to add')
}
