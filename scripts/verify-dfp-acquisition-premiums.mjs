#!/usr/bin/env node
/**
 * Verify DFP acquisition premiums are current for game-blueprints.json.
 *
 * Checks the sibling dfp-engine-private generated premiums file and the shipped
 * public bundle manifest. Run after parse; fails when a rebuild is needed.
 *
 * Fix: in ../dfp-engine-private → npm run build
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const privateRoot = path.resolve(root, '..', 'dfp-engine-private')
const catalogPath = path.join(root, 'src', 'data', 'game-blueprints.json')
const premiumsPath = path.join(privateRoot, 'dfp-engine', 'acquisition-premiums.generated.ts')
const enginePath = path.join(root, 'public', 'dfp-engine.js')
const versionPath = path.join(root, 'public', 'dfp-version.json')

function fail(message) {
  console.error(`verify-dfp-acquisition-premiums: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(catalogPath)) fail('game-blueprints.json not found')
if (!fs.existsSync(privateRoot)) {
  fail('dfp-engine-private sibling repo not found — cannot verify acquisition premiums')
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const catalogStamp = catalog._extracted ?? catalog.generatedAt
if (!catalogStamp) fail('game-blueprints.json missing _extracted timestamp')

if (!fs.existsSync(premiumsPath)) {
  fail('acquisition-premiums.generated.ts missing — run `npm run build` in dfp-engine-private')
}

const premiumsSrc = fs.readFileSync(premiumsPath, 'utf8')
const stampMatch = premiumsSrc.match(/Source: src\/data\/game-blueprints\.json @ (.+)/)
const premiumsStamp = stampMatch?.[1]?.trim()
if (!premiumsStamp) fail('Could not read premiums source timestamp')

if (premiumsStamp !== catalogStamp) {
  fail(
    `DFP acquisition premiums are stale (catalog ${catalogStamp}, premiums ${premiumsStamp}). Run \`npm run build\` in dfp-engine-private.`,
  )
}

const premiumKeys = new Set([...premiumsSrc.matchAll(/"([^"]+)":/g)].map((m) => m[1]))
const rewardBps = (catalog.blueprints ?? []).filter((bp) => bp.isReward && bp.entityClass)
const missing = rewardBps.filter((bp) => {
  const key = bp.internalName ?? bp.file
  return key && !premiumKeys.has(key)
})

if (missing.length) {
  fail(
    `${missing.length} listable reward blueprint(s) lack acquisition premiums after rebuild — check generate-acquisition-premiums.mjs`,
  )
  for (const bp of missing.slice(0, 10)) {
    console.error(`  - ${bp.blueprintName} (${bp.internalName})`)
  }
}

if (!fs.existsSync(enginePath) || !fs.existsSync(versionPath)) {
  fail('public/dfp-engine.js or dfp-version.json missing — commit the DFP bundle from dfp-engine-private build')
}

const manifest = JSON.parse(fs.readFileSync(versionPath, 'utf8'))
const engineSha = crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex')
if (manifest.sha256 !== engineSha) {
  fail('public/dfp-version.json sha256 does not match public/dfp-engine.js — rebuild and commit both files')
}

console.log(
  `verify-dfp-acquisition-premiums: OK — ${premiumKeys.size} premiums @ ${premiumsStamp}, engine ${manifest.version}`,
)
