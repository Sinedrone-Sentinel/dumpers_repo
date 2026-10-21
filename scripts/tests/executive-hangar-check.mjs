import assert from 'node:assert/strict'
import * as esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const outfile = path.join('node_modules', '.cache', 'executive-hangar.mjs')
await esbuild.build({
  entryPoints: [path.join('src', 'lib', 'executiveHangar.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  packages: 'external',
})
const hangar = await import(`${pathToFileURL(path.resolve(outfile)).href}?t=${Date.now()}`)

const open = Date.parse('2026-10-17T15:57:30.419Z')
const clock = hangar.FALLBACK_CLOCK
assert.equal(clock.initialOpenTime, '2026-10-17T15:57:30.419Z')
assert.equal(clock.openDurationMs, 3900123)
assert.equal(clock.closeDurationMs, 7200227)

const green = hangar.hangarState(open, clock)
assert.deepEqual(green.lights, ['green', 'green', 'green', 'green', 'green'])
assert.equal(green.phase, 'insert')
assert.equal(green.nextChangeAt, open + 12 * 60 * 1000)

const faded = hangar.hangarState(open + 12 * 60 * 1000, clock)
assert.deepEqual(faded.lights, ['green', 'green', 'green', 'green', 'off'])
assert.equal(faded.phase, 'insert')

const black = hangar.hangarState(open + 60 * 60 * 1000, clock)
assert.deepEqual(black.lights, ['off', 'off', 'off', 'off', 'off'])
assert.equal(black.phase, 'blackout')

const red = hangar.hangarState(open + 65 * 60 * 1000, clock)
assert.deepEqual(red.lights, ['red', 'red', 'red', 'red', 'red'])
assert.equal(red.phase, 'charging')

const cycle = clock.openDurationMs + clock.closeDurationMs
const wrapped = hangar.hangarState(open + cycle, clock)
assert.deepEqual(wrapped.lights, ['green', 'green', 'green', 'green', 'green'])

assert.equal(hangar.parseHangarClock({}), null)
assert.equal(hangar.parseHangarClock({ serverStartTimes: { initialOpenTime: 'nope' } }), null)
const live = hangar.parseHangarClock({
  serverStartTimes: {
    initialOpenTime: '2026-10-18T00:00:00.000Z',
    openDurationMs: 3900123,
    closeDurationMs: 7200227,
  },
})
assert.equal(live.initialOpenTime, '2026-10-18T00:00:00.000Z')

const missed = await hangar.loadHangarClock(async () => ({ ok: false, json: async () => ({}) }))
assert.equal(missed.live, false)
assert.equal(missed.clock.initialOpenTime, clock.initialOpenTime)

const openBrief = hangar.hangarBrief(green.lights)
assert.equal(openBrief.title, 'Compboards')
assert.match(openBrief.where, /All five lights are green/)
assert.equal(openBrief.next, 'Light 5 goes dark')

const fadeBrief = hangar.hangarBrief(faded.lights)
assert.match(fadeBrief.where, /Light 5 has gone dark/)
assert.equal(fadeBrief.next, 'Light 4 goes dark')

const redBrief = hangar.hangarBrief(red.lights)
assert.equal(redBrief.title, 'Charging')
assert.equal(redBrief.next, 'Light 1 turns green')

const oneGreen = hangar.hangarState(open + 89 * 60 * 1000, clock)
assert.equal(hangar.hangarBrief(oneGreen.lights).next, 'Light 2 turns green')

const fourTwelve = 4 * 60 * 1000 + 12 * 1000
const lastGreen = hangar.hangarState(open + 60 * 60 * 1000 - fourTwelve, clock)
assert.deepEqual(lastGreen.lights, ['green', 'off', 'off', 'off', 'off'])
assert.equal(lastGreen.status, 'online')
assert.equal(lastGreen.nextChangeAt - (open + 60 * 60 * 1000 - fourTwelve), fourTwelve)
assert.equal(lastGreen.statusChangesAt - lastGreen.nextChangeAt, 5 * 60 * 1000 + 123)

const openTimers = hangar.hangarPhaseTimers(green)
assert.equal(openTimers[0].kind, 'starts')
assert.equal(openTimers[1].id, 'insert')
assert.equal(openTimers[1].kind, 'remaining')
assert.equal(openTimers[1].at, open + 60 * 60 * 1000)
assert.equal(openTimers[2].kind, 'starts')

const chargeTimers = hangar.hangarPhaseTimers(red)
assert.equal(chargeTimers[0].kind, 'remaining')
assert.equal(chargeTimers[1].kind, 'starts')
assert.equal(chargeTimers[2].kind, 'starts')

const loaded = await hangar.loadHangarClock(async () => ({
  ok: true,
  json: async () => ({
    serverStartTimes: {
      initialOpenTime: '2026-10-18T00:00:00.000Z',
      openDurationMs: 3900123,
      closeDurationMs: 7200227,
    },
  }),
}))
assert.equal(loaded.live, true)
assert.equal(loaded.clock.initialOpenTime, '2026-10-18T00:00:00.000Z')

console.log('executive hangar clock checks passed')
