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
// 22k @ 55% RES equalizes at ~7,154 MW (Helix -30% RES). With 250 instability the
// quadratic margin puts crackable at ~8,943 MW — under the 9,840 MW loadout total,
// so this still exercises the multi-head full-blast + driver path.
const toughRock = { scannerMass: 22000, resistancePercent: 55, instability: 250 }

const strategy = findBestMoleLoadoutStrategy(lasers, toughRock, { soloMining: false })
assert(strategy, 'expected a crew strategy for tough rock')
assert(strategy.canBreak, 'expected canBreak')

const driver = strategy.assignments.find((a) => a.role === 'primary')
assert(driver, 'expected driver assignment')

const driverProfile = buildMoleHeadProfile(lasers[driver.slotIndex], driver.slotIndex)
const supports = strategy.assignments.filter((a) => a.role === 'support')

if (supports.length > 0) {
  // Field tactic: driver fires LAST from minimum throttle and ramps up to drive.
  assert(
    driver.throttlePercent === driverProfile.throttleMinimumPercent,
    'multi-head driver should start at its minimum throttle and ramp'
  )
  // Only ONE seat (the highest-MW support) may back down from 100%; benefit seats
  // held at min power for their window bonus are exempt from this rule.
  const backedDown = supports.filter(
    (a) => a.throttlePercent < 100 && !(a.detail ?? '').includes('window benefit')
  )
  assert(backedDown.length <= 1, 'only the highest-MW support may back down — no multi-drops')
}

assert(crewUnderPercent(3, 500) === 7, '3-head high instability should be 7% under')
assert(crewUnderPercent(2, null) === 3, '2-head base should be 3% under')

const hugeRock = { scannerMass: 100000, resistancePercent: 75, instability: 500 }
const hugeStrategy = findBestMoleLoadoutStrategy(lasers, hugeRock, { soloMining: false })
assert(hugeStrategy, 'expected crew strategy object for huge rock')
assert(!hugeStrategy.canBreak, '100k rock should not be crackable on one mole loadout')

// 2X CHP: only two seats manned — plan must never use more than two heads.
const twoSeatStrategy = findBestMoleLoadoutStrategy(lasers, toughRock, {
  soloMining: false,
  crewSize: 2,
})
assert(twoSeatStrategy, 'expected a 2X crew strategy object')
if (twoSeatStrategy.canBreak) {
  assert(
    twoSeatStrategy.assignments.filter((a) => a.role !== 'idle').length <= 2,
    '2X CHP must not use more than two heads'
  )
}

const easyRock = { scannerMass: 5000, resistancePercent: 25, instability: 200 }
const easyStrategy = findBestMoleLoadoutStrategy(lasers, easyRock, { soloMining: false })
assert(easyStrategy?.canBreak, 'easy rock should be crackable in crew mode')
const easyActive = easyStrategy.assignments.filter((a) => a.role !== 'idle')
const easyExtras = easyActive.filter((a) => a.role !== 'primary')
assert(easyActive.some((a) => a.role === 'primary'), 'easy rock should have a driver')
assert(
  easyExtras.every((a) => (a.detail ?? '').includes('window benefit')),
  'easy rock extra seats are only allowed as min-power window-benefit seats'
)

const focusMk3 = 'Mining_Modules_Passive_Focus_MK3'
const helixS2FocusPair = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [focusMk3, focusMk3, null],
}
const ricciteRock = { scannerMass: 10849, resistancePercent: 74, instability: 515 }
const soloHead2Only = findBestMoleLoadoutStrategy(
  [helixS2FocusPair, helixS2FocusPair, helixS2FocusPair],
  ricciteRock,
  { soloMining: true }
)
assert(!soloHead2Only.canBreak, 'Helix II with −10% module power cannot solo-crack this pilot-scan rock')
assert(
  soloHead2Only.assignments[0].detail?.includes('3,672 MW after modules'),
  'solo fracture notes should show module-adjusted MW'
)
assert(
  soloHead2Only.assignments[0].detail?.includes('74% → 52%'),
  'solo fracture notes should show pilot RES shifted by head modifiers'
)
const head2Profile = buildMoleHeadProfile(helixS2FocusPair, 1)
assert(head2Profile?.laserPower === 3672, 'two Focus III modules should net −10% on Helix II (3672 MW)')

// ── Hardware minimum throttle (from game data throttleMinimum) ──────────────
// Impact II and Helix II floor at 30%; Arbor MH2 at 5%. Plans must never tell
// the player to set a throttle below the head's real minimum.
const impactProfile = buildMoleHeadProfile(impact, 0)
assert(
  impactProfile.throttleMinimumPercent === 30,
  `Impact II minimum throttle should be 30% (got ${impactProfile.throttleMinimumPercent}%)`
)
assert(impactProfile.laserPower === 3360, 'Impact II stock power should be 3,360 MW')
const helixProfile = buildMoleHeadProfile(helix, 0)
assert(helixProfile.throttleMinimumPercent === 30, 'Helix II minimum throttle should be 30%')
const arborProfile = buildMoleHeadProfile(arbor, 0)
assert(arborProfile.throttleMinimumPercent === 5, 'Arbor MH2 minimum throttle should be 5%')

for (const plan of [strategy, twoSeatStrategy, easyStrategy]) {
  if (!plan?.canBreak) continue
  for (const a of plan.assignments) {
    if (a.role === 'idle') continue
    const profile = buildMoleHeadProfile(lasers[a.slotIndex], a.slotIndex)
    assert(
      a.throttlePercent >= profile.throttleMinimumPercent,
      `Head ${a.slotIndex + 1} assigned ${a.throttlePercent}% — below its ${profile.throttleMinimumPercent}% hardware minimum`
    )
  }
}

console.log('verify-mole-crew-strategy: OK')
console.log('tough summary:', strategy.summary)
console.log('huge summary:', hugeStrategy.summary)
