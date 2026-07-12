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
  'src/lib/miningGadgetRecommendations.ts',
  'src/lib/miningSlowCrack.ts',
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
const gadgetRecs = await import(pathToFileURL(path.join(outDir, 'miningGadgetRecommendations.mjs')).href)
const slowCrack = await import(pathToFileURL(path.join(outDir, 'miningSlowCrack.mjs')).href)
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

// 1.4 equalizationPower vs crackablePower (quadratic instability margin)
console.log('\n1.4 equalizationPower / crackablePower')
// crackablePower = equalizationPower × (1 + (instability / 500)²)
const eq5k = breakability.equalizationPower(5000, 25)
assert(breakability.crackablePower(5000, 25, 0) === eq5k, 'Zero instability → crackable = equalization')
assertApprox(breakability.crackablePower(5000, 25, 500), eq5k * 2, 1, '500 inst → 2× equalization')
assertApprox(breakability.crackablePower(5000, 25, 1000), eq5k * 5, 1, '1000 inst → 5× equalization')
assertApprox(breakability.crackablePower(5000, 25, 100), eq5k * 1.04, 1, '100 inst → 1.04× equalization')
assert(!Number.isFinite(breakability.crackablePower(10000, 100, 300)), '100% RES → Infinity (impossible)')

// 1.5 crackablePower with resistance modifier (user-verified Riccite scenario)
console.log('\n1.5 crackablePower with resistance modifier')
// 10849 mass, 74% RES with Helix (-30% → 0.7), 515 instability
// Equalization: (10849 × 0.2) / (1 - 0.518) ≈ 4,502 MW
// Crackable: 4,502 × (1 + (515/500)²) ≈ 9,278 MW
const userEq = breakability.equalizationPower(10849, 74, 0.7)
assertApprox(userEq, 4502, 10, 'User scenario equalization ≈ 4,502 MW')
const userRequired = breakability.crackablePower(10849, 74, 515, 0.7)
assertApprox(userRequired, 9278, 60, 'User scenario crackable with 515 inst ≈ 9,278 MW')
console.log(`  → User scenario: ${userEq.toFixed(0)} MW to equalize, ${userRequired.toFixed(0)} MW to crack`)

// ============================================================================
// 2. LASER STATS COMPOSITION
// ============================================================================
section('2. Laser Stats Composition')

// 2.1 Module modifier stacking
console.log('\n2.1 Module modifier stacking')
const emptyModules = miningModules.combineModuleModifiers([null, null, null])
assert(emptyModules.powerChangeSum === 0, 'Empty modules → 0 power change')
assert(emptyModules.resistanceModifier === 0, 'Empty modules → 0 resistance mod')

const focusPair = miningModules.combineModuleModifiers([FOCUS_MK3, FOCUS_MK3, null])
assertApprox(focusPair.powerChangeSum, -0.10, 0.01, 'Two Focus III → −10% power change')

const riegerMods = miningModules.combineModuleModifiers([RIEGER_MK3, null, null])
assertApprox(riegerMods.powerChangeSum, 0.25, 0.01, 'One Rieger MK3 → +25% power change')

// 2.2 Effective power multiplier (head craft + modules)
console.log('\n2.2 Effective power multiplier')
const stockMultiplier = miningModules.effectivePowerMultiplierFromBase(1.0, [null, null])
assert(stockMultiplier === 1.0, 'Stock head, no modules → 1.0× multiplier')

const focusPairMultiplier = miningModules.effectivePowerMultiplierFromBase(1.0, [FOCUS_MK3, FOCUS_MK3, null])
assertApprox(focusPairMultiplier, 0.90, 0.01, 'Stock head + 2× Focus III → 0.90× multiplier')

const riegerMultiplier = miningModules.effectivePowerMultiplierFromBase(1.0, [RIEGER_MK3, null, null])
assertApprox(riegerMultiplier, 1.25, 0.01, 'Stock head + Rieger MK3 → 1.25× multiplier')

// 2.3 Compute effective laser stats
console.log('\n2.3 computeEffectiveLaserStats')
const helixStock = laserStats.computeEffectiveLaserStats(HELIX_S2)
assert(helixStock != null, 'Helix S2 stats computed')
assert(helixStock.laserPower === 4080, `Helix S2 stock = 4,080 MW (got ${helixStock?.laserPower})`)
assert(helixStock.resistanceModifier === -30, 'Helix S2 resistance mod = −30%')

const helixFocusPair = laserStats.computeEffectiveLaserStats(HELIX_FOCUS_PAIR)
assert(helixFocusPair != null, 'Helix + Focus pair computed')
assert(helixFocusPair.laserPower === 3672, `Helix + 2× Focus III = 3,672 MW (got ${helixFocusPair?.laserPower})`)

const helixRieger = laserStats.computeEffectiveLaserStats(HELIX_RIEGER)
assert(helixRieger.laserPower === 5100, `Helix + Rieger MK3 = 5,100 MW (got ${helixRieger?.laserPower})`)

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
console.log(`  → Each head: ${3672} MW (3× Focus-pair Helix)`)
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
assert(primaryAssignment?.detail?.includes('3,672 MW'), 'Solo notes should show module-adjusted MW')
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
assert(focusProfile?.laserPower === 3672, `Focus-pair Helix = 3,672 MW (got ${focusProfile?.laserPower})`)

const riegerProfile = moleStrategy.buildMoleHeadProfile(HELIX_RIEGER, 0)
assert(riegerProfile?.laserPower === 5100, `Rieger Helix = 5,100 MW (got ${riegerProfile?.laserPower})`)

// ============================================================================
// 6. THROTTLE AND MIN-POWER WARNINGS
// ============================================================================
section('6. Throttle and Min-Power Calculations')

// 6.1 throttlePercentFromMw
console.log('\n6.1 throttlePercentFromMw')
assert(throttleDisplay.throttlePercentFromMw(2040, 4080) === 50, '2,040 / 4,080 = 50%')
assert(throttleDisplay.throttlePercentFromMw(4080, 4080) === 100, '4,080 / 4,080 = 100%')
assert(throttleDisplay.throttlePercentFromMw(500, 4080) === 12, '500 / 4,080 = ~12%')
assert(throttleDisplay.throttlePercentFromMw(5000, 4080) === 100, 'Over max clamped to 100%')
assert(throttleDisplay.throttlePercentFromMw(100, 0) === 0, 'Zero laser power → 0%')

// 6.2 displayMinThrottlePercent
console.log('\n6.2 displayMinThrottlePercent')
assert(throttleDisplay.displayMinThrottlePercent(0.2) === 20, '0.2 fraction = 20%')
assert(throttleDisplay.displayMinThrottlePercent(0.15) === 15, '0.15 fraction = 15%')
assert(throttleDisplay.displayMinThrottlePercent(0.005) === 1, 'Very low fraction → min 1%')

// 6.3 Min power warnings
console.log('\n6.3 Min power warnings')
const warning = minPowerWarning.assessMinPowerWarning(100, 4080, 0.2, 'Helix', 0)
assert(warning != null, 'Should warn when required MW < min output')
assert(warning?.minLaserMw === 816, 'Min output = 4080 × 0.2 = 816 MW')
assert(warning?.requiredMw === 100, 'Required = 100 MW')

const noWarning = minPowerWarning.assessMinPowerWarning(1000, 4080, 0.2, 'Helix', 0)
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
// 8. SLOW CRACK ASSESSMENT
// ============================================================================
section('8. Slow Crack Assessment')

// 8.1 Margin tiers
console.log('\n8.1 Slow crack margin tiers')
// Create a scenario where we're barely over the equalizer
const barelyOverRock = { ...MEDIUM_ROCK }
const barelyOverLoadout = [HELIX_S2, IMPACT_S2, ARBOR_S2]
const barelyOverComparison = loadoutCompare.compareLoadoutToRock(barelyOverLoadout, barelyOverRock)

if (barelyOverComparison?.canBreak) {
  const margin = barelyOverComparison.totalLaserPower / barelyOverComparison.requiredPower
  console.log(`  → Power margin: ${(margin * 100).toFixed(1)}%`)
  
  const slowAssessment = slowCrack.assessSlowCrackFromComparison(barelyOverComparison, barelyOverRock)
  if (slowAssessment) {
    console.log(`  → Slow crack tier: ${slowAssessment.tier}`)
    console.log(`  → Headline: ${slowAssessment.headline}`)
  } else {
    console.log(`  → No slow crack warning (margin comfortable)`)
  }
}

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

// 9.4 End-to-end: User's exact scenario (Helix II + 2× Focus III + Rieger, 74% rock, 515 instability)
// This tests the critical bug: game shows IMPOSSIBLE but old math said CRACKABLE
console.log('\n9.4 User scenario: Helix II + 2× Focus III + Rieger on 74%/515 rock')
const USER_HELIX_WITH_MODULES = {
  laserName: 'Mining_Laser_THCN_Helix_S2',
  mode: 'stock',
  modules: [FOCUS_MK3, FOCUS_MK3, RIEGER_MK3],  // -5% -5% +25% = +15% net
}
const userLoadoutActual = [USER_HELIX_WITH_MODULES, HELIX_S2, ARBOR_S2]
const userRock = { scannerMass: 10849, resistancePercent: 74, instability: 515 }
const userSoloStrategy = moleStrategy.findBestMoleLoadoutStrategy(userLoadoutActual, userRock, { soloMining: true })

// Verify the head power: 4080 × 1.15 = 4692 MW
const userHeadProfile = moleStrategy.buildMoleHeadProfile(USER_HELIX_WITH_MODULES, 0)
assert(userHeadProfile?.laserPower === 4692, `User head: 4080 × 1.15 = 4,692 MW (got ${userHeadProfile?.laserPower})`)

// Verify the required power calculations
const basePower = breakability.equalizationPower(10849, 74, 0.7)
const adjustedPower = breakability.crackablePower(10849, 74, 515, 0.7)
console.log(`  → User head power: ${userHeadProfile?.laserPower} MW`)
console.log(`  → Equalization (RES only): ${basePower.toFixed(0)} MW`)
console.log(`  → Crackable (+515 inst margin): ${adjustedPower.toFixed(0)} MW`)
console.log(`  → Can solo crack: ${userSoloStrategy?.canBreak}`)

// THE KEY TEST: Without instability, 4692 > 4520 = crackable (BUG!)
// With instability: 4692 < 6820 = NOT crackable (CORRECT!)
assert(userHeadProfile?.laserPower > basePower, 'Without instability, laser power exceeds base required (old bug)')
assert(userHeadProfile?.laserPower < adjustedPower, 'With instability, laser power is insufficient (correct)')
assert(!userSoloStrategy?.canBreak, 'User scenario must NOT be crackable solo (matches game IMPOSSIBLE)')

// Verify the strategy reports instability in the summary
assert(
  userSoloStrategy?.summary?.includes('instability') || userSoloStrategy?.assignments[0]?.detail?.includes('inst'),
  'Solo strategy should mention instability in notes'
)
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
