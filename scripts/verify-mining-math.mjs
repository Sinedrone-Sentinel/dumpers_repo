/**
 * Comprehensive mining math verification suite.
 * Tests all calculation paths: fracture formula, laser stats, loadout comparison,
 * Mole crew/solo strategy, gadget recommendations, and slow crack assessment.
 *
 * Run: node scripts/verify-mining-math.mjs
 */
import * as esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'node_modules/.cache/mining-math-verify')

const modules = [
  'src/lib/miningBreakability.ts',
  'src/lib/miningLaserStats.ts',
  'src/lib/miningModules.ts',
  'src/lib/miningLoadoutCompare.ts',
  'src/lib/moleLoadoutStrategy.ts',
  'src/lib/miningActiveModuleAdvice.ts',
  'src/lib/miningGadgetRecommendations.ts',
  'src/lib/miningGadgets.ts',
  'src/lib/miningThrottleDisplay.ts',
  'src/lib/miningMinPowerWarning.ts',
]

console.log('Building modules...')
for (const mod of modules) {
  const name = path.basename(mod, '.ts')
  await esbuild.build({
    entryPoints: [path.join(root, mod)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: path.join(outDir, `${name}.mjs`),
    packages: 'external',
  })
}

const breakability = await import(pathToFileURL(path.join(outDir, 'miningBreakability.mjs')).href)
const laserStats = await import(pathToFileURL(path.join(outDir, 'miningLaserStats.mjs')).href)
const miningModules = await import(pathToFileURL(path.join(outDir, 'miningModules.mjs')).href)
const loadoutCompare = await import(pathToFileURL(path.join(outDir, 'miningLoadoutCompare.mjs')).href)
const moleStrategy = await import(pathToFileURL(path.join(outDir, 'moleLoadoutStrategy.mjs')).href)
const activeAdvice = await import(pathToFileURL(path.join(outDir, 'miningActiveModuleAdvice.mjs')).href)
const gadgetRecs = await import(pathToFileURL(path.join(outDir, 'miningGadgetRecommendations.mjs')).href)
const gadgets = await import(pathToFileURL(path.join(outDir, 'miningGadgets.mjs')).href)
const throttleDisplay = await import(pathToFileURL(path.join(outDir, 'miningThrottleDisplay.mjs')).href)
const minPowerWarning = await import(pathToFileURL(path.join(outDir, 'miningMinPowerWarning.mjs')).href)

let passCount = 0
let failCount = 0
const failures = []

function assert(condition, message, details = null) {
  if (!condition) {
    failCount++
    failures.push({ message, details })
    console.error(`  ❌ ${message}`)
    if (details) console.error(`     ${JSON.stringify(details, null, 2).split('\n').join('\n     ')}`)
  } else {
    passCount++
    console.log(`  ✓ ${message}`)
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected)
  assert(diff <= tolerance, `${message} (expected ~${expected}, got ${actual}, diff ${diff.toFixed(2)})`)
}

function section(title) {
  console.log(`\n═══════════════════════════════════════════════════════════════`)
  console.log(`  ${title}`)
  console.log(`═══════════════════════════════════════════════════════════════`)
}

// ============================================================================
// TEST DATA
// ============================================================================

const HELIX_S2 = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [null, null, null],
}

const IMPACT_S2 = {
  laserName: 'Mining_Laser_THCN_Impact_S2',
  mode: 'stock',
  modules: [null, null, null],
}

const ARBOR_S2 = {
  laserName: 'Mining_Laser_GRIN_Arbor_S2',
  mode: 'stock',
  modules: [null, null],
}

const LANCET_S1 = {
  laserName: 'Mining_Laser_GRIN_Lancet_S1',
  mode: 'stock',
  modules: [null],
}

const FOCUS_MK3 = 'Mining_Modules_Passive_Focus_MK3'
const RIEGER_MK3 = 'Mining_Modules_Passive_Rieger_MK3'
const SURGE = 'Mining_Modules_Active_Surge'

const HELIX_FOCUS_PAIR = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [FOCUS_MK3, FOCUS_MK3, null],
}

const HELIX_RIEGER = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [RIEGER_MK3, null, null],
}

// Active module + passive: all installed actives run at once, so both fold in.
const HELIX_SURGE_FOCUS = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [SURGE, FOCUS_MK3, null],
}

// Test rocks
const EASY_ROCK = { scannerMass: 5000, resistancePercent: 25, instability: 200 }
const MEDIUM_ROCK = { scannerMass: 12000, resistancePercent: 45, instability: 350 }
const TOUGH_ROCK = { scannerMass: 22000, resistancePercent: 55, instability: 500 }
const HIGH_RES_ROCK = { scannerMass: 10849, resistancePercent: 74, instability: 515 }
const HUGE_ROCK = { scannerMass: 100000, resistancePercent: 75, instability: 500 }
const LOW_RES_ROCK = { scannerMass: 8000, resistancePercent: 15, instability: 120 }

// ============================================================================
// 1. CORE FRACTURE FORMULA
// ============================================================================
section('1. Core Fracture Formula')

// 1.1 effectiveResistanceFraction
console.log('\n1.1 effectiveResistanceFraction')
assert(breakability.effectiveResistanceFraction(50, 1) === 0.5, '50% RES with no modifier = 0.5 fraction')
assert(breakability.effectiveResistanceFraction(100, 1) === 1, '100% RES = 1.0 fraction (clamped)')
assert(breakability.effectiveResistanceFraction(0, 1) === 0, '0% RES = 0 fraction')
assertApprox(breakability.effectiveResistanceFraction(74, 0.7), 0.518, 0.01, 'Helix −30% modifier on 74% RES')
assertApprox(breakability.effectiveResistanceFraction(50, 1.15), 0.575, 0.01, 'Arbor +15% modifier on 50% RES')

// 1.2 effectiveHudResistancePercent (pilot scan → mining seat display)
console.log('\n1.2 effectiveHudResistancePercent')
assert(breakability.effectiveHudResistancePercent(74, -30) === 52, 'Pilot 74% with Helix −30% → 52% on turret')
assert(breakability.effectiveHudResistancePercent(50, 0) === 50, 'No modifier → same as pilot scan')
// Note: 50 × 1.15 = 57.49999... due to floating point, rounds to 57
const arborResult = breakability.effectiveHudResistancePercent(50, 15)
assert(arborResult === 57 || arborResult === 58, `Arbor +15% → 57-58% on turret (got ${arborResult})`)
assert(breakability.effectiveHudResistancePercent(10, -50) === 5, 'Large negative on low RES → 5%')
assert(breakability.effectiveHudResistancePercent(100, -30) === 70, '100% → 70% with Helix')

// 1.3 requiredLaserPower (core fracture formula)
console.log('\n1.3 requiredLaserPower')
// Formula: (mass × 0.2) / (1 - effectiveResistanceFraction)
// Easy rock: (5000 × 0.2) / (1 - 0.25) = 1000 / 0.75 = 1333.33 MW
assertApprox(breakability.requiredLaserPower(5000, 25), 1333, 2, 'Easy rock (5k mass, 25% RES) ≈ 1,333 MW')

// Medium rock: (12000 × 0.2) / (1 - 0.45) = 2400 / 0.55 = 4363.64 MW
assertApprox(breakability.requiredLaserPower(12000, 45), 4364, 2, 'Medium rock (12k mass, 45% RES) ≈ 4,364 MW')

// High-res rock with modifier: (10849 × 0.2) / (1 - 0.518) = 2169.8 / 0.482 ≈ 4502 MW
// Note: 74% × 0.7 (Helix) = 51.8% effective
assertApprox(breakability.requiredLaserPower(10849, 74, 0.7), 4502, 10, 'High-RES rock with Helix modifier ≈ 4,502 MW')

// Edge cases
assert(breakability.requiredLaserPower(0, 50) === 0, 'Zero mass → 0 MW')
assert(!Number.isFinite(breakability.requiredLaserPower(10000, 100)), '100% RES → Infinity (impossible)')
assert(breakability.requiredLaserPower(-100, 50) === 0, 'Negative mass → 0 MW')

// 1.4 equalizationPower vs crackablePower (±MW instability-assist model)
console.log('\n1.4 equalizationPower / crackablePower (instability assist lowers the floor)')
// crackablePower (floor) = max(0, equalizationPower − instabilityAssistMw(instability))
const eq5k = breakability.equalizationPower(5000, 25)
assert(breakability.crackablePower(5000, 25, 0) === eq5k, 'Zero instability → floor = equalization')
assertApprox(breakability.crackablePower(5000, 25, 500), eq5k - 500, 1, '500 inst → equalization − 500 (assist lowers floor)')
assertApprox(breakability.crackablePower(5000, 25, 100), eq5k - 100, 1, '100 inst → equalization − 100')
assert(breakability.crackablePower(5000, 25, 10000) === 0, 'Assist beyond equalization → floor clamps to 0')
assert(!Number.isFinite(breakability.crackablePower(10000, 100, 300)), '100% RES → Infinity (impossible)')

// Three-zone band: clean requires overcoming the underswing (E + assist)
const zClean = breakability.classifyCrackZone(eq5k + 600, 5000, 25, 500)
assert(zClean.zone === 'clean', 'Power above E + assist → clean crack')
const zRisky = breakability.classifyCrackZone(eq5k - 200, 5000, 25, 500)
assert(zRisky.zone === 'assisted', 'Power between floor and E+assist → risky/assisted crack')
const zImposs = breakability.classifyCrackZone(eq5k - 800, 5000, 25, 500)
assert(zImposs.zone === 'impossible', 'Power below floor (E − assist) → impossible')

// 1.5 crackablePower with resistance modifier (Riccite scenario, ±MW model)
console.log('\n1.5 crackablePower with resistance modifier')
// 10849 mass, 74% RES with Helix (-30% → 0.7), 515 instability
// Equalization: (10849 × 0.2) / (1 - 0.518) ≈ 4,502 MW
// Floor (min for a shot): 4,502 − 515 ≈ 3,987 MW (instability assist lowers it)
const userEq = breakability.equalizationPower(10849, 74, 0.7)
assertApprox(userEq, 4502, 10, 'User scenario equalization ≈ 4,502 MW')
const userRequired = breakability.crackablePower(10849, 74, 515, 0.7)
assertApprox(userRequired, userEq - 515, 5, 'User scenario floor = equalization − 515 instability assist')
assert(userRequired < userEq, 'Instability lowers the minimum below equalization (not above)')
console.log(`  → User scenario: ${userEq.toFixed(0)} MW to equalize, floor ${userRequired.toFixed(0)} MW for a shot`)

// ============================================================================
// 2. LASER STATS COMPOSITION
// ============================================================================
section('2. Laser Stats Composition')

// 2.1 Module modifier stacking
console.log('\n2.1 Module modifier stacking')
const emptyModules = miningModules.combineEquippedModuleModifiers([null, null, null])
assert(emptyModules.powerChangeSum === 0, 'Empty modules → 0 power change')
assert(emptyModules.resistanceModifier === 0, 'Empty modules → 0 resistance mod')

const focusPair = miningModules.combineEquippedModuleModifiers([FOCUS_MK3, FOCUS_MK3, null])
assertApprox(focusPair.powerChangeSum, -0.10, 0.01, 'Two Focus III → −10% power change')

const riegerMods = miningModules.combineEquippedModuleModifiers([RIEGER_MK3, null, null])
assertApprox(riegerMods.powerChangeSum, 0.25, 0.01, 'One Rieger MK3 → +25% power change')

// Active modules are OFF in the passive baseline — only the passive Focus III counts.
const surgeFocusPassive = miningModules.combinePassiveModuleModifiers([SURGE, FOCUS_MK3, null])
assertApprox(surgeFocusPassive.powerChangeSum, -0.05, 0.01, 'Surge OFF baseline → only Focus III −5% power')
assertApprox(surgeFocusPassive.resistanceModifier, 0, 0.01, 'Surge OFF baseline → 0 resistance (active off)')
assertApprox(surgeFocusPassive.instabilityModifier, 0, 0.01, 'Surge OFF baseline → 0 instability (active off)')

// All installed actives on → Surge folds in on top of the passive Focus III.
const surgeFocus = miningModules.combineEquippedModuleModifiers([SURGE, FOCUS_MK3, null])
assertApprox(surgeFocus.powerChangeSum, 0.45, 0.01, 'Surge ON + Focus III → +45% power change')
assertApprox(surgeFocus.resistanceModifier, -15.5, 0.01, 'Surge ON + Focus III → −15.5% resistance')
assertApprox(surgeFocus.instabilityModifier, 10, 0.01, 'Surge ON + Focus III → +10% instability')

// Per-port control: only the active at port 0 (Surge) is on.
const surgePortOnly = miningModules.combineModuleModifiers([SURGE, FOCUS_MK3, null], new Set([0]))
assertApprox(surgePortOnly.powerChangeSum, 0.45, 0.01, 'combineModuleModifiers port 0 on → Surge + Focus III +45%')
const surgePortOff = miningModules.combineModuleModifiers([SURGE, FOCUS_MK3, null], new Set())
assertApprox(surgePortOff.powerChangeSum, -0.05, 0.01, 'combineModuleModifiers empty set → Surge off, only Focus III')

// 2.2 Effective power multiplier (head craft + modules)
console.log('\n2.2 Effective power multiplier')
const stockMultiplier = miningModules.effectivePowerMultiplierFromBase(1.0, [null, null])
assert(stockMultiplier === 1.0, 'Stock head, no modules → 1.0× multiplier')

const focusPairMultiplier = miningModules.effectivePowerMultiplierFromBase(1.0, [FOCUS_MK3, FOCUS_MK3, null])
assertApprox(focusPairMultiplier, 0.90, 0.01, 'Stock head + 2× Focus III → 0.90× multiplier')

const riegerMultiplier = miningModules.effectivePowerMultiplierFromBase(1.0, [RIEGER_MK3, null, null])
assertApprox(riegerMultiplier, 1.25, 0.01, 'Stock head + Rieger MK3 → 1.25× multiplier')

// Craft raises BASE power FIRST, then module % stacks on the crafted base.
// (Surges are active, so turn their ports on to include them.)
const craftSurge3 = miningModules.effectivePowerMultiplierFromBase(1.2156, [SURGE, SURGE, SURGE], new Set([0, 1, 2]))
assertApprox(craftSurge3, 1.2156 * 2.5, 0.001, 'Craft 21.56% then 3× Surge → craftMult × (1 + 1.5), not additive')
assertApprox(4930 * craftSurge3, 14982, 1, 'Helix crafted 21.56% + 3× Surge = 14,982 MW (craft base first)')

const craftFocus = miningModules.effectivePowerMultiplierFromBase(1.2156, [FOCUS_MK3, null, null])
assertApprox(craftFocus, 1.2156 * 0.95, 0.001, 'Craft 21.56% then Focus III → craftMult × (1 − 0.05)')

// Sanity: with no modules, craft-first equals the plain craft multiplier.
assertApprox(
  miningModules.effectivePowerMultiplierFromBase(1.2156, [null, null, null]),
  1.2156,
  0.001,
  'Craft only (no modules) → craft multiplier unchanged'
)

// 2.3 Compute effective laser stats
console.log('\n2.3 computeEffectiveLaserStats')
const helixStock = laserStats.computeEffectiveLaserStats(HELIX_S2)
assert(helixStock != null, 'Helix S2 stats computed')
assert(helixStock.laserPower === 4930, `Helix S2 stock = 4,930 MW (got ${helixStock?.laserPower})`)
assert(helixStock.resistanceModifier === -30, 'Helix S2 resistance mod = −30%')

const helixFocusPair = laserStats.computeEffectiveLaserStats(HELIX_FOCUS_PAIR)
assert(helixFocusPair != null, 'Helix + Focus pair computed')
assert(helixFocusPair.laserPower === 4437, `Helix + 2× Focus III = 4,437 MW (got ${helixFocusPair?.laserPower})`)

const helixRieger = laserStats.computeEffectiveLaserStats(HELIX_RIEGER)
assert(helixRieger.laserPower === 6163, `Helix + Rieger MK3 = 6,163 MW (got ${helixRieger?.laserPower})`)

// Passive baseline: Surge is OFF, only Focus III (−5% power) counts.
const helixSurgeFocus = laserStats.computeEffectiveLaserStats(HELIX_SURGE_FOCUS)
assert(helixSurgeFocus.laserPower === 4684, `Helix + Focus III baseline (Surge off) = 4,684 MW (got ${helixSurgeFocus?.laserPower})`)
assert(helixSurgeFocus.resistanceModifier === -30, `Baseline resistance −30% (Surge off, got ${helixSurgeFocus?.resistanceModifier})`)

// Surge switched on (port 0) folds in: +50% power, −15.5% resistance on top of Focus III.
const helixSurgeOn = laserStats.computeEffectiveLaserStats(HELIX_SURGE_FOCUS, new Set([0]))
assert(helixSurgeOn.laserPower === 7149, `Helix + Surge ON + Focus III = 7,149 MW (got ${helixSurgeOn?.laserPower})`)
assert(helixSurgeOn.resistanceModifier === -45.5, `Surge ON resistance −45.5% (got ${helixSurgeOn?.resistanceModifier})`)

// 2.4 Resistance multiplier conversion
console.log('\n2.4 laserResistanceMultiplier')
assert(laserStats.laserResistanceMultiplier(0) === 1.0, '0% mod → 1.0× multiplier')
assert(laserStats.laserResistanceMultiplier(-30) === 0.7, 'Helix −30% → 0.7× multiplier')
assert(laserStats.laserResistanceMultiplier(15) === 1.15, 'Arbor +15% → 1.15× multiplier')

// ============================================================================
// 3. LOADOUT COMPARISON (compareLoadoutToRock)
// ============================================================================
section('3. Loadout Comparison')

// 3.1 Single laser (Prospector-style)
console.log('\n3.1 Single laser (Prospector)')
const singleLaser = [LANCET_S1]
const singleComparison = loadoutCompare.compareLoadoutToRock(singleLaser, EASY_ROCK)
assert(singleComparison != null, 'Single laser comparison computed')
assert(singleComparison.canBreak, 'Lancet can break easy rock')
assert(singleComparison.lasers.length === 1, 'One laser row')
console.log(`  → Required: ${singleComparison.requiredPower} MW, Total: ${singleComparison.totalLaserPower} MW`)

// 3.2 Multi-laser Mole loadout
console.log('\n3.2 Multi-laser Mole loadout')
const moleLasers = [HELIX_S2, IMPACT_S2, ARBOR_S2]
const moleComparison = loadoutCompare.compareLoadoutToRock(moleLasers, TOUGH_ROCK)
assert(moleComparison != null, 'Mole comparison computed')
console.log(`  → Required: ${moleComparison.requiredPower} MW (best RES multiplier: ${moleComparison.bestResistanceMultiplier})`)
console.log(`  → Total power: ${moleComparison.totalLaserPower} MW`)
console.log(`  → Can break: ${moleComparison.canBreak}`)

// Note: Per-slot `requiredShare` uses each slot's own resistance modifier (not the best one).
// This shows what each laser would need if operating solo. The sum of shares may exceed
// total required power because the total uses the loadout's best resistance modifier.
const helixShare = moleComparison.lasers.find(l => l.label.includes('Helix'))?.requiredShare ?? 0
const arborShare = moleComparison.lasers.find(l => l.label.includes('Arbor'))?.requiredShare ?? 0
console.log(`  → Helix share: ${helixShare} MW, Arbor share: ${arborShare} MW (Arbor has +15% RES mod, needs more)`)
assert(arborShare > helixShare, 'Arbor (higher RES mod) should require more MW share than Helix (lower RES mod)')

// 3.3 High-resistance rock with modules
console.log('\n3.3 High-RES rock with module-adjusted heads')
const focusLoadout = [HELIX_FOCUS_PAIR, HELIX_FOCUS_PAIR, HELIX_FOCUS_PAIR]
const focusComparison = loadoutCompare.compareLoadoutToRock(focusLoadout, HIGH_RES_ROCK)
assert(focusComparison != null, 'Focus loadout comparison computed')
console.log(`  → Each head: ${4437} MW (3× Focus-pair Helix)`)
console.log(`  → Total: ${focusComparison.totalLaserPower} MW`)
console.log(`  → Required (with −30% RES mod): ${focusComparison.requiredPower} MW`)
console.log(`  → Can break: ${focusComparison.canBreak}`)

// ============================================================================
// 4. MOLE STRATEGY - CREW MODE
// ============================================================================
section('4. Mole Strategy - Crew Mode')

// 4.1 Easy rock — one driving head; extra seats allowed only as min-power
// window-benefit holds (crew doctrine: spare seats may hold min for the window).
console.log('\n4.1 Easy rock (one-head crew)')
const easyCrewStrategy = moleStrategy.findBestMoleLoadoutStrategy(moleLasers, EASY_ROCK, { soloMining: false })
assert(easyCrewStrategy != null, 'Easy rock crew strategy exists')
assert(easyCrewStrategy.canBreak, 'Easy rock should be crackable')
const activeHeads = easyCrewStrategy.assignments.filter(a => a.role !== 'idle')
const easyDrivers = easyCrewStrategy.assignments.filter(a => a.role === 'primary')
assert(easyDrivers.length === 1, `Easy rock should have exactly 1 driving head (got ${easyDrivers.length})`)
const easyExtras = activeHeads.filter(a => a.role !== 'primary')
assert(
  easyExtras.every(a => /window benefit/i.test(a.detail ?? '')),
  'Easy rock extra seats must be min-power window-benefit holds only'
)
console.log(`  → ${easyCrewStrategy.summary}`)
console.log(`  → Active heads: ${activeHeads.length} (driver + ${easyExtras.length} window seat${easyExtras.length === 1 ? '' : 's'})`)

// 4.2 Medium rock — should use two heads
console.log('\n4.2 Medium rock (two-head crew)')
const mediumCrewStrategy = moleStrategy.findBestMoleLoadoutStrategy(moleLasers, MEDIUM_ROCK, { soloMining: false })
assert(mediumCrewStrategy != null, 'Medium rock crew strategy exists')
assert(mediumCrewStrategy.canBreak, 'Medium rock should be crackable')
const mediumActive = mediumCrewStrategy.assignments.filter(a => a.role !== 'idle')
console.log(`  → ${mediumCrewStrategy.summary}`)
console.log(`  → Active heads: ${mediumActive.length}`)

// 4.3 Tough rock — may need three heads
console.log('\n4.3 Tough rock')
const toughCrewStrategy = moleStrategy.findBestMoleLoadoutStrategy(moleLasers, TOUGH_ROCK, { soloMining: false })
assert(toughCrewStrategy != null, 'Tough rock crew strategy exists')
console.log(`  → ${toughCrewStrategy.summary}`)
console.log(`  → Can break: ${toughCrewStrategy.canBreak}`)

// 4.4 Impossible rock — should report not crackable
console.log('\n4.4 Huge rock (not crackable)')
const hugeCrewStrategy = moleStrategy.findBestMoleLoadoutStrategy(moleLasers, HUGE_ROCK, { soloMining: false })
assert(hugeCrewStrategy != null, 'Huge rock strategy object exists')
assert(!hugeCrewStrategy.canBreak, 'Huge rock should NOT be crackable')
console.log(`  → ${hugeCrewStrategy.summary}`)

// 4.5 Driver selection avoids high instability head
console.log('\n4.5 Driver selection')
const profiles = moleLasers.map((slot, i) => moleStrategy.buildMoleHeadProfile(slot, i)).filter(Boolean)
if (toughCrewStrategy?.canBreak) {
  const driver = toughCrewStrategy.assignments.find(a => a.role === 'primary')
  const maxInstability = Math.max(...profiles.map(p => p.instabilityModifier))
  const driverProfile = profiles.find(p => p.slotIndex === driver?.slotIndex)
  if (profiles.some(p => p.instabilityModifier < maxInstability)) {
    assert(
      driverProfile?.instabilityModifier < maxInstability,
      'Driver should not be the highest-instability head when alternatives exist'
    )
  }
}

// 4.6 crewUnderPercent thresholds
console.log('\n4.6 crewUnderPercent thresholds')
assert(moleStrategy.crewUnderPercent(2, null) === 3, '2-head low instability → 3%')
assert(moleStrategy.crewUnderPercent(3, null) === 6, '3-head low instability → 6%')
assert(moleStrategy.crewUnderPercent(2, 500) === 4, '2-head high instability → 4%')
assert(moleStrategy.crewUnderPercent(3, 500) === 7, '3-head high instability → 7%')

// ============================================================================
// 5. MOLE STRATEGY - SOLO MODE
// ============================================================================
section('5. Mole Strategy - Solo Mode')

// 5.1 Easy rock — should crack solo
console.log('\n5.1 Easy rock (solo)')
const easySoloStrategy = moleStrategy.findBestMoleLoadoutStrategy(moleLasers, EASY_ROCK, { soloMining: true })
assert(easySoloStrategy != null, 'Easy rock solo strategy exists')
assert(easySoloStrategy.canBreak, 'Easy rock should be crackable solo')
const soloActive = easySoloStrategy.assignments.filter(a => a.role !== 'idle')
assert(soloActive.length === 1, 'Solo should use exactly one head')
console.log(`  → ${easySoloStrategy.summary}`)

// 5.2 High-RES rock with Focus modules — should NOT be crackable
console.log('\n5.2 High-RES rock with Focus-pair heads (solo)')
const highResSoloStrategy = moleStrategy.findBestMoleLoadoutStrategy(focusLoadout, HIGH_RES_ROCK, { soloMining: true })
assert(highResSoloStrategy != null, 'High-RES solo strategy exists')
assert(!highResSoloStrategy.canBreak, 'Focus-pair heads cannot crack 74% RES rock solo')

const primaryAssignment = highResSoloStrategy.assignments.find(a => a.role === 'primary')
assert(primaryAssignment?.detail?.includes('4,437 MW'), 'Solo notes should show module-adjusted MW')
assert(primaryAssignment?.detail?.includes('74%') && primaryAssignment?.detail?.includes('52%'), 
  'Solo notes should show pilot RES → turret RES')
console.log(`  → ${highResSoloStrategy.summary}`)
console.log(`  → Detail: ${primaryAssignment?.detail}`)

// 5.3 High-RES rock with Rieger — should be crackable
console.log('\n5.3 High-RES rock with Rieger head (solo)')
const riegerLoadout = [HELIX_RIEGER, HELIX_S2, ARBOR_S2]
const riegerSoloStrategy = moleStrategy.findBestMoleLoadoutStrategy(riegerLoadout, HIGH_RES_ROCK, { soloMining: true })
assert(riegerSoloStrategy != null, 'Rieger solo strategy exists')
console.log(`  → Can break: ${riegerSoloStrategy.canBreak}`)
console.log(`  → ${riegerSoloStrategy.summary}`)

// 5.4 Verify head profile calculations with modules
console.log('\n5.4 Head profile with modules')
const focusProfile = moleStrategy.buildMoleHeadProfile(HELIX_FOCUS_PAIR, 0)
assert(focusProfile?.laserPower === 4437, `Focus-pair Helix = 4,437 MW (got ${focusProfile?.laserPower})`)

const riegerProfile = moleStrategy.buildMoleHeadProfile(HELIX_RIEGER, 0)
assert(riegerProfile?.laserPower === 6163, `Rieger Helix = 6,163 MW (got ${riegerProfile?.laserPower})`)

// 5.5 Active module recommendation (per head)
console.log('\n5.5 Active module recommendation')
const HELIX_SURGE = { laserName: 'Mining_Laser_THCN_Helix_S2', mode: 'stock', modules: [SURGE, null, null] }

const easyActiveAdvice = activeAdvice.recommendActiveModulesForHead(HELIX_SURGE, 0, EASY_ROCK)
assert(easyActiveAdvice?.cracksOnPassive === true, 'Easy rock cracks on passive — no actives needed')
assert(easyActiveAdvice?.recommendedModuleNames.length === 0, 'Easy rock → recommend zero actives (minimal)')

// Scan for a rock band where passive fails but switching Surge on cracks it.
let bandRock = null
let bandAdvice = null
for (let mass = 6000; mass <= 80000; mass += 500) {
  const rock = { scannerMass: mass, resistancePercent: 55, instability: 400 }
  const a = activeAdvice.recommendActiveModulesForHead(HELIX_SURGE, 0, rock)
  if (a && !a.cracksOnPassive && a.cracksWithRecommended) {
    bandAdvice = a
    bandRock = rock
    break
  }
}
assert(bandAdvice != null, 'Found a rock where passive fails but Surge cracks')
assert(bandAdvice?.recommendedModuleNames.includes('Surge Module'), 'Recommends switching Surge on to crack')
console.log(`  → Band rock ${bandRock?.scannerMass} mass: turn on ${bandAdvice?.recommendedModuleNames.join(', ')} @ ${bandAdvice?.throttlePercent}%`)

// Minimality: two Surges installed but one is enough for the same band rock.
const HELIX_DOUBLE_SURGE = { laserName: 'Mining_Laser_THCN_Helix_S2', mode: 'stock', modules: [SURGE, SURGE, null] }
const doubleAdvice = activeAdvice.recommendActiveModulesForHead(HELIX_DOUBLE_SURGE, 0, bandRock)
assert(doubleAdvice?.recommendedModuleNames.length === 1, 'Minimal: one Surge is enough — do not recommend both')

// Huge rock: even Surge cannot crack.
const hugeActiveAdvice = activeAdvice.recommendActiveModulesForHead(HELIX_SURGE, 0, HUGE_ROCK)
assert(hugeActiveAdvice?.cracksWithRecommended === false, 'Huge rock cannot crack even with Surge on')

// Strategy-level: easy rock needs no actives; fields present.
assert(Array.isArray(easySoloStrategy.recommendedActives), 'Strategy carries recommendedActives array')
assert(easySoloStrategy.recommendedActives.length === 0, 'Easy solo rock: no actives required')
assert(easySoloStrategy.activesRequiredToCrack === false, 'Easy solo rock: actives not required')

// Strategy-level: solo Mole where a head only cracks the band rock with Surge on.
// All heads are Helix variants weaker-or-equal to the Surge head's passive baseline,
// so only switching Surge on can crack it.
const surgeSoloLoadout = [HELIX_SURGE, HELIX_S2, HELIX_FOCUS_PAIR]
const surgeSoloStrategy = moleStrategy.findBestMoleLoadoutStrategy(surgeSoloLoadout, bandRock, { soloMining: true })
assert(surgeSoloStrategy?.canBreak === true, 'Solo plan cracks the band rock using actives')
assert(surgeSoloStrategy?.activesRequiredToCrack === true, 'Band rock solo plan flags actives required')
assert(
  surgeSoloStrategy?.recommendedActives.some((r) => r.moduleNames.includes('Surge Module')),
  'Solo plan recommends switching Surge on'
)
console.log(`  → Solo band plan: ${surgeSoloStrategy?.summary}`)

// ============================================================================
// 6. THROTTLE AND MIN-POWER WARNINGS
// ============================================================================
section('6. Throttle and Min-Power Calculations')

// 6.1 throttlePercentFromMw
console.log('\n6.1 throttlePercentFromMw')
assert(throttleDisplay.throttlePercentFromMw(2465, 4930) === 50, '2,465 / 4,930 = 50%')
assert(throttleDisplay.throttlePercentFromMw(4930, 4930) === 100, '4,930 / 4,930 = 100%')
assert(throttleDisplay.throttlePercentFromMw(500, 4930) === 10, '500 / 4,930 = ~10%')
assert(throttleDisplay.throttlePercentFromMw(5000, 4930) === 100, 'Over max clamped to 100%')
assert(throttleDisplay.throttlePercentFromMw(100, 0) === 0, 'Zero laser power → 0%')

// 6.2 displayMinThrottlePercent
console.log('\n6.2 displayMinThrottlePercent')
assert(throttleDisplay.displayMinThrottlePercent(0.2) === 20, '0.2 fraction = 20%')
assert(throttleDisplay.displayMinThrottlePercent(0.15) === 15, '0.15 fraction = 15%')
assert(throttleDisplay.displayMinThrottlePercent(0.005) === 1, 'Very low fraction → min 1%')

// 6.3 Min power warnings
console.log('\n6.3 Min power warnings')
const warning = minPowerWarning.assessMinPowerWarning(100, 4930, 0.2, 'Helix', 0)
assert(warning != null, 'Should warn when required MW < min output')
assert(warning?.minLaserMw === 986, 'Min output = 4930 × 0.2 = 986 MW')
assert(warning?.requiredMw === 100, 'Required = 100 MW')

const noWarning = minPowerWarning.assessMinPowerWarning(1000, 4930, 0.2, 'Helix', 0)
assert(noWarning == null, 'No warning when required >= min output')

// ============================================================================
// 7. GADGET CALCULATIONS
// ============================================================================
section('7. Gadget Calculations')

// 7.1 applyRockMultiplicativePercent
console.log('\n7.1 applyRockMultiplicativePercent')
assertApprox(gadgets.applyRockMultiplicativePercent(74, -30), 51.8, 0.1, '74% × (1 + −30%/100) = 51.8%')
assertApprox(gadgets.applyRockMultiplicativePercent(50, 15), 57.5, 0.1, '50% × (1 + 15%/100) = 57.5%')
assertApprox(gadgets.applyRockMultiplicativePercent(500, -20), 400, 0.1, '500 instability × (1 − 20%) = 400')

// ============================================================================
// 9. INTEGRATION TESTS
// ============================================================================
section('9. Integration Tests')

// 9.1 Full Smart Cracker flow
console.log('\n9.1 Smart Cracker - Mole crew mode')
const crewSmartCracker = gadgetRecs.buildSmartCracker(
  'mole',
  moleLasers,
  TOUGH_ROCK,
  moleComparison,
  { moleSoloMining: false }
)
assert(crewSmartCracker != null, 'Smart Cracker result exists')
console.log(`  → Should advise: ${crewSmartCracker.shouldAdvise}`)
console.log(`  → Mole strategy exists: ${crewSmartCracker.moleStrategy != null}`)
console.log(`  → Gadget suggestions: ${crewSmartCracker.gadgetSuggestions.length}`)

// 9.2 Smart Cracker solo mode
console.log('\n9.2 Smart Cracker - Mole solo mode')
const soloSmartCracker = gadgetRecs.buildSmartCracker(
  'mole',
  moleLasers,
  EASY_ROCK,
  loadoutCompare.compareLoadoutToRock(moleLasers, EASY_ROCK),
  { moleSoloMining: true }
)
assert(soloSmartCracker.moleStrategy?.soloMining === true, 'Solo mode flag set on strategy')

// 9.3 Prospector (non-Mole) Smart Cracker
console.log('\n9.3 Smart Cracker - Prospector')
const prospectorLasers = [LANCET_S1]
const prospectorTarget = { scannerMass: 3000, resistancePercent: 30, instability: 150 }
const prospectorComparison = loadoutCompare.compareLoadoutToRock(prospectorLasers, prospectorTarget)
const prospectorSmartCracker = gadgetRecs.buildSmartCracker(
  'prospector',
  prospectorLasers,
  prospectorTarget,
  prospectorComparison
)
assert(prospectorSmartCracker.moleStrategy === null, 'Prospector should not have mole strategy')

// 9.4 End-to-end: Helix II + 2× Focus III + Rieger on 74%/515 rock.
// The game shows IMPOSSIBLE because it only checks the seat's BASE laser vs mass+resistance
// — it can't know you'll fit modules/gadgets/crew. Our tool answers for the ACTUAL loadout,
// and with the instability assist this rock is crackable.
console.log('\n9.4 Loadout scenario: Helix II + 2× Focus III + Rieger on 74%/515 rock')
const USER_HELIX_WITH_MODULES = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [FOCUS_MK3, FOCUS_MK3, RIEGER_MK3],  // -5% -5% +25% = +15% net
}
const userLoadoutActual = [USER_HELIX_WITH_MODULES, HELIX_S2, ARBOR_S2]
const userRock = { scannerMass: 10849, resistancePercent: 74, instability: 515 }
const userSoloStrategy = moleStrategy.findBestMoleLoadoutStrategy(userLoadoutActual, userRock, { soloMining: true })

// Verify the head power: 4930 × 1.15 = 5670 MW
const userHeadProfile = moleStrategy.buildMoleHeadProfile(USER_HELIX_WITH_MODULES, 0)
assert(userHeadProfile?.laserPower === 5670, `User head: 4930 × 1.15 = 5,670 MW (got ${userHeadProfile?.laserPower})`)

// Required power: equalization (hold point) vs floor (min for a shot, instability-assisted)
const basePower = breakability.equalizationPower(10849, 74, 0.7)
const floorPower = breakability.crackablePower(10849, 74, 515, 0.7)
console.log(`  → Head power: ${userHeadProfile?.laserPower} MW`)
console.log(`  → Equalization (RES only): ${basePower.toFixed(0)} MW`)
console.log(`  → Floor (−515 inst assist): ${floorPower.toFixed(0)} MW`)
console.log(`  → Can solo crack: ${userSoloStrategy?.canBreak}`)

// Instability LOWERS the minimum (floor below equalization), and the head clears both.
assert(floorPower < basePower, 'Instability assist puts the floor below equalization')
assert(userHeadProfile?.laserPower > basePower, 'Head power exceeds equalization (clean side of the band)')
assert(userHeadProfile?.laserPower >= floorPower, 'Head power clears the instability-assisted floor → crackable')
assert(userSoloStrategy?.canBreak, 'Tool finds this crackable with the actual loadout (game IMPOSSIBLE ignores modules)')
console.log(`  → Summary: ${userSoloStrategy?.summary}`)

// ============================================================================
// SUMMARY
// ============================================================================
section('SUMMARY')
console.log(`\n  Total tests: ${passCount + failCount}`)
console.log(`  ✓ Passed: ${passCount}`)
console.log(`  ❌ Failed: ${failCount}`)

if (failures.length > 0) {
  console.log('\n  FAILURES:')
  for (const f of failures) {
    console.log(`    - ${f.message}`)
  }
  process.exit(1)
}

console.log('\n  All mining math verified! ✓')
