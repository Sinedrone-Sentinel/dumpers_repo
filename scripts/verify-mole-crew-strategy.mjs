/**
 * Quick sanity checks for Mole crew full-blast planner.
 * Run after build: node scripts/verify-mole-crew-strategy.mjs
 *
 * Uses esbuild to bundle the TS module for Node execution.
 */
import * as esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outfile = path.join(root, 'node_modules/.cache/mole-crew-verify.mjs')

await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/moleLoadoutStrategy.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  packages: 'external',
})

const {
  findBestMoleLoadoutStrategy,
  buildMoleHeadProfile,
  crewUnderPercent,
} = await import(pathToFileURL(outfile).href)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const helix = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [null, null, null],
}
const impact = {
  laserName: 'Mining_Laser_THCN_Impact_S2',
  mode: 'stock',
  modules: [null, null, null],
}
const arbor = {
  laserName: 'Mining_Laser_GRIN_Arbor_S2',
  mode: 'stock',
  modules: [null, null],
}

const lasers = [helix, impact, arbor]
const toughRock = { scannerMass: 22000, resistancePercent: 55, instability: 500 }

const strategy = findBestMoleLoadoutStrategy(lasers, toughRock, { soloMining: false })
assert(strategy, 'expected a crew strategy for tough rock')
assert(strategy.canBreak, 'expected canBreak')

const fullBlast = strategy.assignments.filter(
  (a) => a.role === 'support' && a.throttlePercent === 100
)
const driver = strategy.assignments.find((a) => a.role === 'primary')
assert(driver, 'expected driver assignment')
assert(
  fullBlast.length >= 1 || driver.throttlePercent < 100,
  'expected full-blast supports and/or computed driver throttle'
)

const profiles = lasers.map((slot, i) => buildMoleHeadProfile(slot, i)).filter(Boolean)
const maxInstability = Math.max(...profiles.map((p) => p.instabilityModifier))
if (profiles.filter((p) => p.instabilityModifier < maxInstability).length > 0) {
  assert(
    driver && buildMoleHeadProfile(lasers[driver.slotIndex], driver.slotIndex).instabilityModifier <
      maxInstability,
    'driver should avoid highest-instability head when possible'
  )
}

assert(crewUnderPercent(3, 500) === 7, '3-head high instability should be 7% under')
assert(crewUnderPercent(2, null) === 3, '2-head base should be 3% under')

const hugeRock = { scannerMass: 100000, resistancePercent: 75, instability: 500 }
const hugeStrategy = findBestMoleLoadoutStrategy(lasers, hugeRock, { soloMining: false })
assert(hugeStrategy, 'expected crew strategy object for huge rock')
assert(!hugeStrategy.canBreak, '100k rock should not be crackable on one mole loadout')
assert(
  fullBlast.length >= 1,
  'tough rock should use at least one full-blast support'
)

const easyRock = { scannerMass: 5000, resistancePercent: 25, instability: 200 }
const easyStrategy = findBestMoleLoadoutStrategy(lasers, easyRock, { soloMining: false })
assert(easyStrategy?.canBreak, 'easy rock should be crackable in crew mode')
assert(
  easyStrategy.assignments.filter((a) => a.role !== 'idle').length === 1,
  'easy rock should prefer one-head crew when one turret suffices'
)

console.log('verify-mole-crew-strategy: OK')
console.log('tough summary:', strategy.summary)
console.log('huge summary:', hugeStrategy.summary)
