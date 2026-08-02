/**
 * Patch description / descriptionKey onto contracts in game-blueprint-missions.json
 * from contractgenerator paramOverrides + localization (without a full parse).
 *
 * Usage: node scripts/enrich-mission-descriptions.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

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

function resolveLoc(localization, key) {
  if (!key) return ''
  const raw = String(key)
  const bare = raw.startsWith('@') ? raw.slice(1) : raw
  return localization[bare] || localization[bare.toLowerCase()] || ''
}

function collectContracts(file, localization, byId, byDebug) {
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return
  }
  const generators = json?._RecordValue_?.generators || []
  for (const generator of generators) {
    const list = [...(generator.introContracts || []), ...(generator.contracts || [])]
    for (const contract of list) {
      const params = contract.paramOverrides?.stringParamOverrides || []
      const descParam = params.find((p) => p.param === 'Description')
      if (!descParam?.value) continue
      const descriptionKey = descParam.value
      let description = descriptionKey.startsWith('@')
        ? resolveLoc(localization, descriptionKey)
        : String(descriptionKey)
      description = description.replace(/\\n/g, '\n').trim()
      if (!description) continue
      const payload = { description, descriptionKey }
      if (contract.id) byId.set(String(contract.id).toLowerCase(), payload)
      if (contract.debugName) byDebug.set(String(contract.debugName).toLowerCase(), payload)
    }
  }
}

const localization = loadLocalization()
const byId = new Map()
const byDebug = new Map()
for (const file of walkJsonFiles(generatorsRoot)) {
  collectContracts(file, localization, byId, byDebug)
}

const data = JSON.parse(readFileSync(outPath, 'utf8'))
const contracts = data.contracts || []
let patched = 0
for (const contract of contracts) {
  const hit =
    (contract.id && byId.get(String(contract.id).toLowerCase())) ||
    (contract.debugName && byDebug.get(String(contract.debugName).toLowerCase()))
  if (!hit) continue
  if (contract.description === hit.description && contract.descriptionKey === hit.descriptionKey) {
    continue
  }
  contract.description = hit.description
  contract.descriptionKey = hit.descriptionKey
  patched += 1
}

writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`)
console.log(
  `Patched ${patched} / ${contracts.length} contracts with mission descriptions (${byId.size} generator matches)`
)
