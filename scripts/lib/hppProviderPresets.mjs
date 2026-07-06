/**
 * Single walk of harvestable provider presets (HPP) used by mining location + spawn parsers.
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'

const HPP_DIR = 'libs/foundry/records/harvestable/providerpresets'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function walkJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(p, acc)
    else if (entry.name.endsWith('.json')) acc.push(p)
  }
  return acc
}

export function inferSystemFromHppPath(filePath) {
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  if (lower.includes('/nyx/')) return 'Nyx'
  if (lower.includes('/pyro/')) return 'Pyro'
  if (lower.includes('/stanton/')) return 'Stanton'
  return 'Unknown'
}

export function harvestablePresetBasename(harvestableRef) {
  const raw = String(harvestableRef?._RecordPath_ || harvestableRef || '')
  const normalized = raw.replace(/\\/g, '/')
  const fileName = normalized.split('/').pop() || ''
  return fileName.replace(/\.json$/i, '')
}

/**
 * @typedef {object} HppProviderPreset
 * @property {string} file
 * @property {string} fileBase
 * @property {string} hppKey
 * @property {object} recordValue
 * @property {string} system
 */

/**
 * @param {string} extractedDataRoot
 * @returns {HppProviderPreset[]}
 */
export function loadHppProviderPresets(extractedDataRoot) {
  const hppDir = join(extractedDataRoot, HPP_DIR)
  if (!existsSync(hppDir)) return []

  const presets = []
  for (const file of walkJsonFiles(hppDir)) {
    const fileBase = basename(file, '.json')
    if (!fileBase.startsWith('hpp_')) continue

    const json = readJson(file)
    if (!json?._RecordValue_) continue

    presets.push({
      file,
      fileBase,
      hppKey: json._RecordName_ || fileBase,
      recordValue: json._RecordValue_,
      system: inferSystemFromHppPath(file),
    })
  }

  return presets
}
