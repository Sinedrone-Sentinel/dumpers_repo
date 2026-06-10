import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const BLUEPRINTS_URL = 'https://www.sccrafter.com/Blueprints.json'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'src', 'data', 'Blueprints.json')
const force = process.argv.includes('--force')

function slugifyResourceName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function extractBlueprintResources(blueprints) {
  const byKey = new Map()

  for (const blueprint of blueprints) {
    for (const slot of blueprint.slots ?? []) {
      for (const option of slot.options ?? []) {
        const label = option.resourceName || option.entityName
        if (!label) continue

        const resourceKey = slugifyResourceName(label)
        if (!resourceKey) continue

        if (!byKey.has(resourceKey)) {
          byKey.set(resourceKey, { resourceKey, label })
        }
      }
    }
  }

  return [...byKey.values()]
}

function validatePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON: expected an object')
  }
  if (typeof data.version !== 'string' || !data.version.trim()) {
    throw new Error('Invalid JSON: missing top-level version string')
  }
  if (!Array.isArray(data.blueprints) || data.blueprints.length === 0) {
    throw new Error('Invalid JSON: blueprints must be a non-empty array')
  }

  const sample = data.blueprints[0]
  if (!sample?.file || !sample?.blueprintName || !Array.isArray(sample.slots)) {
    throw new Error('Invalid JSON: blueprint entries must include file, blueprintName, and slots[]')
  }
}

function readExistingCount() {
  try {
    const existing = JSON.parse(readFileSync(outputPath, 'utf8'))
    return {
      version: existing.version ?? 'unknown',
      count: Array.isArray(existing.blueprints) ? existing.blueprints.length : 0,
      bytes: readFileSync(outputPath).byteLength,
    }
  } catch {
    return { version: null, count: 0, bytes: 0 }
  }
}

async function main() {
  const prior = readExistingCount()
  console.log(`Fetching ${BLUEPRINTS_URL} ...`)

  const response = await fetch(BLUEPRINTS_URL)
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  }

  const raw = await response.text()
  if (raw.length < 100_000) {
    throw new Error(`Download looks truncated (${raw.length} bytes) — refusing to write`)
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Download is not valid JSON: ${error.message}`)
  }

  validatePayload(data)

  const count = data.blueprints.length
  if (prior.count > 0 && count < prior.count * 0.9 && !force) {
    throw new Error(
      `Blueprint count regressed (${prior.count} -> ${count}). Re-run with --force to override.`
    )
  }

  const resources = extractBlueprintResources(data.blueprints)
  const serialized = `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(outputPath, serialized, 'utf8')

  console.log('Blueprints.json updated')
  console.log(`  version:   ${data.version}`)
  console.log(`  prior:     ${prior.version ?? 'none'} (${prior.count} blueprints, ${prior.bytes} bytes)`)
  console.log(`  count:     ${count} blueprints`)
  console.log(`  resources: ${resources.length} unique catalog entries`)
  console.log(`  bytes:     ${Buffer.byteLength(serialized, 'utf8')}`)
  console.log(`  path:      ${outputPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
