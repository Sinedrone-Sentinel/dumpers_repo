/**
 * Cave tags, compass heading, and orbital-marker distance.
 * The Arial numbers are a published surface fix for one real cave.
 */
import assert from 'node:assert/strict'
import * as esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.join(root, 'node_modules/.cache/unit-tests')

await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/caveNav.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
})

const cave = await import(pathToFileURL(path.join(outDir, 'caveNav.mjs')).href)
const site = cave.caveSites.find((entry) => entry.id === 'RL_Stanton1a_acidic01_unoc_001_size05_002_003')
assert.ok(site, 'Arial cave is in the catalog')
assert.deepEqual(cave.caveTags(site), ['acidic - 01', 'unoccupied - 001', 'size 05x002x003'])

const surface = cave.surfaceRoute(site)
const byName = Object.fromEntries(surface.markers.map((marker) => [marker.name, marker.km]))
assert.ok(Math.abs(byName['OM-1'] - 344.59) < 0.05, `OM-1 ${byName['OM-1']}`)
assert.ok(Math.abs(byName['OM-4'] - 366.93) < 0.05, `OM-4 ${byName['OM-4']}`)
assert.ok(Math.abs(byName['OM-5'] - 586.96) < 0.05, `OM-5 ${byName['OM-5']}`)
assert.equal(surface.place?.name, 'HDMS-Bezdek')
assert.ok(Math.abs(surface.place.km - 1.0) < 0.05)
assert.ok(Math.abs(surface.place.heading - 222.9) < 0.15)
assert.ok(Math.abs(surface.place.backHeading - 43.0) < 0.15)

const body = cave.caveBody('stanton1a')
assert.equal(body?.name, 'Arial')
assert.equal(body?.label, 'Stanton 1a')
assert.ok(cave.caveSites.length > 700)

console.log(`cave nav ok (${cave.caveSites.length} caves)`)
