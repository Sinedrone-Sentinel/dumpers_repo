/**
 * Patch description / descriptionKey onto contracts in game-blueprint-missions.json
 * from contract generators, templates, and English localization (without a full parse).
 *
 * Usage: node scripts/enrich-mission-descriptions.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  buildTitleIndex,
  foundryRefParts,
  isMissionProse,
  resolveMissionDescription,
  scenarioJournalDescription,
} from './lib/missionDescriptionResolve.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extracted = join(root, 'extracted-data')
const generatorsRoot = join(extracted, 'libs/foundry/records/contracts/contractgenerator')
const locPath = join(extracted, 'Data/Localization/english/global.ini')
const outPath = join(root, 'src/data/game-blueprint-missions.json')

function loadLocalization() {
  const localization = {}
  if (!existsSync(locPath)) return localization
  for (const line of readFileSync(locPath, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=')) continue
    const eq = line.indexOf('=')
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    localization[key] = value
    if (key.includes(',')) {
      const base = key.split(',')[0]
      if (!localization[base]) localization[base] = value
    }
  }
  return localization
}

function walkJsonFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkJsonFiles(full, out)
    else if (name.endsWith('.json')) out.push(full)
  }
  return out
}

function readTemplate(ref) {
  const parts = foundryRefParts(ref)
  if (!parts) return null
  const full = join(extracted, ...parts)
  if (!existsSync(full)) return null
  try {
    return JSON.parse(readFileSync(full, 'utf8'))
  } catch {
    return null
  }
}

function titleFromContract(contract, localization) {
  const params = contract.paramOverrides?.stringParamOverrides || []
  const titleParam = params.find((p) => p.param === 'Title')
  const titleKey = titleParam?.value || ''
  let title = contract.debugName || ''
  if (titleKey.startsWith('@')) title = localization[titleKey.slice(1)] || titleKey
  else if (titleKey) title = titleKey
  return { title, titleKey }
}

const localization = loadLocalization()
const titleIndex = buildTitleIndex(localization)
const templateCache = new Map()
const byId = new Map()
const byDebug = new Map()

for (const file of walkJsonFiles(generatorsRoot)) {
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  const generators = json?._RecordValue_?.generators || []
  for (const generator of generators) {
    const list = [...(generator.introContracts || []), ...(generator.contracts || [])]
    for (const contract of list) {
      const { title, titleKey } = titleFromContract(contract, localization)
      const hit = resolveMissionDescription({
        contract,
        generator,
        localization,
        titleIndex,
        templateCache,
        readTemplate,
        title,
        titleKey,
        debugName: contract.debugName,
      })
      if (!hit || !isMissionProse(hit.description)) continue
      if (contract.id) byId.set(String(contract.id).toLowerCase(), hit)
      if (contract.debugName) byDebug.set(String(contract.debugName).toLowerCase(), hit)
    }
  }
}

const data = JSON.parse(readFileSync(outPath, 'utf8'))
const contracts = data.contracts || []
let patched = 0

function apply(contract, hit) {
  if (!hit || !isMissionProse(hit.description)) return
  if (isMissionProse(contract.description) && contract.description === hit.description) return
  if (isMissionProse(contract.description)) return
  contract.description = hit.description
  contract.descriptionKey = hit.descriptionKey
  patched += 1
}

for (const contract of contracts) {
  const hit =
    (contract.id && byId.get(String(contract.id).toLowerCase())) ||
    (contract.debugName && byDebug.get(String(contract.debugName).toLowerCase()))
  if (hit) {
    apply(contract, hit)
    continue
  }
  if (isMissionProse(contract.description)) continue
  if (contract.source === 'contractScenario' || String(contract.id || '').includes('_tier_')) {
    apply(contract, scenarioJournalDescription(localization, contract.id || contract.debugName))
    if (isMissionProse(contract.description)) continue
  }
  const fallback = resolveMissionDescription({
    contract: {
      debugName: contract.debugName,
      paramOverrides: {
        stringParamOverrides: [
          contract.titleKey ? { param: 'Title', value: contract.titleKey } : null,
          contract.descriptionKey ? { param: 'Description', value: contract.descriptionKey } : null,
        ].filter(Boolean),
      },
    },
    generator: null,
    localization,
    titleIndex,
    templateCache,
    readTemplate,
    title: contract.displayTitle || contract.title,
    titleKey: contract.titleKey,
    debugName: contract.debugName,
    preferShared: String(contract.id || '').startsWith('bridged_'),
  })
  if (fallback) {
    apply(contract, fallback)
    continue
  }
  if (contract.description || contract.descriptionKey) {
    delete contract.description
    delete contract.descriptionKey
    patched += 1
  }
}

writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`)
console.log(`Patched ${patched} / ${contracts.length} contracts with mission descriptions`)
