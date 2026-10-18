#!/usr/bin/env node
/**
 * Every equippable ship-shop catalog item must show up on at least one list.
 *
 * Walks the same lists the shop opens: hardpoints, guns under a swapped mount,
 * and tubes on every rack that fits. Prints each miss with why it was dropped
 * and which ports should show it. A part that loses to another row of the same
 * name is reported and does not fail the run.
 *
 * Usage: node scripts/audit-ship-shop-lists.mjs
 */

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(root, 'node_modules', '.cache', 'ship-shop-list-audit.mjs')

await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/shipShopData.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  packages: 'external',
  logLevel: 'silent',
})

const shop = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`)
const gaps = shop.shipShopListGaps()
const actionable = gaps.filter((gap) => gap.reason !== 'collapsed')
const collapsed = gaps.filter((gap) => gap.reason === 'collapsed')

function printGroup(title, rows) {
  if (rows.length === 0) return
  console.log(`\n${title} (${rows.length})`)
  for (const gap of rows) {
    const where = gap.availableIn.length > 0
      ? gap.availableIn.join('; ')
      : 'no matching hardpoint'
    const extra = gap.portCount > gap.availableIn.length ? ` (+${gap.portCount - gap.availableIn.length} more)` : ''
    const twin = gap.representedBy ? ` — same list entry as ${gap.representedBy}` : ''
    console.log(`  ${gap.displayName} [${gap.kind} S${gap.size}] ${gap.entityClass}`)
    console.log(`    ${gap.detail}${twin}`)
    console.log(`    Put it on: ${where}${extra}`)
  }
}

const reasons = [
  ['hull-lock', 'Hull-token lock — name token is hiding a part that fits other ships'],
  ['required-tags', 'Part requires tags the hardpoint does not give'],
  ['port-tags', 'Hardpoint requires a tag the part does not have'],
  ['ship-locked', 'Gun is stuck to a stock hardpoint that never lists it'],
  ['bespoke', 'Hardpoint only keeps another hull’s components'],
  ['ordnance', 'Ordnance type does not match the tube'],
  ['attach', 'Attachment type does not match the hardpoint'],
  ['no-port', 'No hardpoint of this kind and size'],
]

console.log(`Ship shop list check: ${actionable.length} missing, ${collapsed.length} already represented by the same name`)
for (const [reason, title] of reasons) {
  printGroup(title, actionable.filter((gap) => gap.reason === reason))
}
printGroup('Same name already listed', collapsed)

if (actionable.length > 0) {
  console.error(`\n${actionable.length} ship item(s) never appear on a shop list.`)
  process.exit(1)
}

console.log('\nEvery equippable ship item appears on a shop list.')
