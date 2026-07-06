#!/usr/bin/env node
/**
 * Build missionBrokerOrder.mjs from mission-broker-query.json.
 * Run when MissionBrokerEntry query order changes after a game patch:
 *   starbreaker dcb query --p4k ... MissionBrokerEntry > extracted-data/mission-broker-query.json
 *   node scripts/generate-mission-broker-order.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const queryFile = join(root, 'extracted-data/mission-broker-query.json')

const rawContent = readFileSync(queryFile, 'utf8')
const content = rawContent
  .split('\n')
  .filter((line) => !line.trim().startsWith('---'))
  .join('\n')
const records = content
  .split(/\}\s*\{/)
  .map((r, i, arr) => {
    if (i === 0) return `${r}}`
    if (i === arr.length - 1) return `{${r}`
    return `{${r}}`
  })
  .filter((r) => r.includes('"_RecordName_"'))

const order = []
for (const recordStr of records) {
  try {
    let cleanStr = recordStr.trim()
    const lastBrace = cleanStr.lastIndexOf('}')
    if (lastBrace > 0) cleanStr = cleanStr.substring(0, lastBrace + 1)
    const record = JSON.parse(cleanStr)
    if (!record._RecordName_) continue
    order.push(record._RecordName_.replace('MissionBrokerEntry.', ''))
  } catch {
    /* skip malformed chunk */
  }
}

const out = `/**
 * Mission broker iteration order (matches StarBreaker MissionBrokerEntry query order).
 * Regenerate after a game patch if mission broker records are added/reordered:
 *   node scripts/generate-mission-broker-order.mjs
 * (requires extracted-data/mission-broker-query.json from a one-off dcb query)
 */
export const MISSION_BROKER_LABEL_ORDER = ${JSON.stringify(order, null, 2)}
`

writeFileSync(join(root, 'scripts/lib/missionBrokerOrder.mjs'), out)
console.log(`Wrote ${order.length} labels to scripts/lib/missionBrokerOrder.mjs`)
