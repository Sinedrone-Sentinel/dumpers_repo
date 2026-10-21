/**
 * Nav map and shopping-route checks. Bundles the browser modules with esbuild.
 */
import assert from 'node:assert/strict'
import * as esbuild from 'esbuild'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.join(root, 'node_modules/.cache/unit-tests')

await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/navSystems.ts'), path.join(root, 'src/lib/shopRoute.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
})

const navMod = await import(pathToFileURL(path.join(outDir, 'navSystems.mjs')).href)
const routeMod = await import(pathToFileURL(path.join(outDir, 'shopRoute.mjs')).href)

const { navMap, resolveShopPlace, searchNavPoints, pathBetween, describeJumps } = navMod
const { planShopRoute } = routeMod

function point(id, name, system, x, surface = false) {
  return { id, name, aliases: [], system, kind: surface ? 'planet' : 'station', surface, x, y: 0, z: 0 }
}

const home = 'home'
const away = 'away'
const fixture = {
  systems: [{ id: home, name: 'Home' }, { id: away, name: 'Away' }],
  points: [
    point('home-a', 'Home A', home, 0),
    point('home-b', 'Home B', home, 10),
    point('home-c', 'Home C', home, 20),
    point('away-one', 'Away One', away, 0),
    point('near-ship', 'Near Ship', home, 1000),
    point('far-ship', 'Far Ship', home, 5000000),
  ],
  links: [],
}

const threeLines = [
  { id: 'a', label: 'A', offers: [{ pointId: 'home-a', price: 10 }, { pointId: 'away-one', price: 10 }] },
  { id: 'b', label: 'B', offers: [{ pointId: 'home-b', price: 10 }, { pointId: 'away-one', price: 10 }] },
  { id: 'c', label: 'C', offers: [{ pointId: 'home-c', price: 10 }, { pointId: 'away-one', price: 10 }] },
]

const foreign = planShopRoute({
  nav: fixture,
  lines: threeLines,
  startId: 'home-a',
  systems: [home, away],
  mode: 'fewest',
})
assert.deepEqual(foreign.legs.map((leg) => leg.stop.pointId), ['away-one'])

const tieLines = [
  { id: 'a', label: 'A', offers: [{ pointId: 'home-a', price: 5 }, { pointId: 'away-one', price: 1 }] },
  { id: 'b', label: 'B', offers: [{ pointId: 'home-b', price: 5 }, { pointId: 'near-ship', price: 1 }] },
]
const tie = planShopRoute({
  nav: fixture,
  lines: tieLines,
  startId: 'home-a',
  systems: [home, away],
  mode: 'fewest',
})
assert.deepEqual(tie.legs.map((leg) => leg.stop.pointId).sort(), ['home-a', 'home-b'])

const noStart = planShopRoute({
  nav: fixture,
  lines: tieLines,
  startId: null,
  systems: [home, away],
  mode: 'fewest',
})
assert.equal(noStart.legs.length, 2)

const cheap = planShopRoute({
  nav: fixture,
  lines: tieLines,
  startId: 'home-a',
  systems: [home, away],
  mode: 'cheapest',
})
assert.deepEqual(cheap.legs.map((leg) => leg.stop.pointId).sort(), ['away-one', 'near-ship'])

const surfaceNav = {
  systems: [{ id: home, name: 'Home' }],
  points: [
    point('pad', 'Pad', home, 0, false),
    { ...point('dirt', 'Dirt', home, 100, true), kind: 'planet' },
  ],
  links: [],
}
const efficient = planShopRoute({
  nav: surfaceNav,
  lines: [
    { id: 'both', label: 'Both', offers: [{ pointId: 'dirt', price: 1 }, { pointId: 'pad', price: 9 }] },
    { id: 'only', label: 'Only', offers: [{ pointId: 'dirt', price: 4 }] },
  ],
  startId: 'pad',
  systems: [home],
  mode: 'efficient',
})
assert.equal(efficient.legs.some((leg) => leg.stop.pointId === 'pad'), true)
const dirt = efficient.legs.find((leg) => leg.stop.pointId === 'dirt')
assert.equal(dirt?.stop.surface, true)
assert.equal(dirt?.stop.lines.some((line) => line.id === 'only'), true)
assert.equal(efficient.legs.some((leg) => leg.stop.lines.some((line) => line.id === 'both' && leg.stop.pointId === 'dirt')), false)

const shipFirst = planShopRoute({
  nav: fixture,
  lines: [
    { id: 'ship', label: 'Ship', offers: [{ pointId: 'near-ship', price: 100 }, { pointId: 'far-ship', price: 1 }] },
    { id: 'part', label: 'Part', offers: [{ pointId: 'home-a', price: 5 }] },
  ],
  startId: 'home-a',
  systems: [home, away],
  mode: 'fewest',
  firstLineId: 'ship',
})
assert.equal(shipFirst.legs[0].stop.pointId, 'near-ship')
assert.equal(shipFirst.legs[0].stop.lines.some((line) => line.id === 'ship'), true)

const nyxToStanton = pathBetween(navMap, 'nyx:pyro-gateway', 'stanton:hurston')
assert.deepEqual(nyxToStanton.hops.map((hop) => hop.pointId), ['nyx:stanton-gateway', 'stanton:nyx-gateway'])
assert.equal(nyxToStanton.hops.some((hop) => hop.pointId.startsWith('pyro:')), false)
assert.match(nyxToStanton.hops[0].label, /Stanton Gateway in Nyx/)
assert.match(nyxToStanton.hops[1].label, /Nyx Gateway in Stanton/)
assert.equal(nyxToStanton.hops[0].role, 'depart')
assert.equal(nyxToStanton.hops[1].role, 'arrive')
assert.deepEqual(describeJumps(nyxToStanton.hops), [
  `Use ${nyxToStanton.hops[0].label}, jump to ${nyxToStanton.hops[1].label}`,
])

const fromGate = pathBetween(navMap, 'nyx:stanton-gateway', 'stanton:hurston')
assert.deepEqual(fromGate.hops.map((hop) => hop.pointId), ['stanton:nyx-gateway'])
assert.equal(fromGate.hops[0].role, 'arrive')
assert.deepEqual(describeJumps(fromGate.hops), [`Jump to ${fromGate.hops[0].label}`])

const cellin = resolveShopPlace({
  system: 'Stanton',
  planet: 'Crusader',
  moon: 'Cellin',
  outpost: 'Security Post Kareah PAF',
})
assert.equal(cellin, 'stanton:cellin')
assert.equal(searchNavPoints('PAF', navMap).length, 0)
assert.equal(searchNavPoints('Cellin', navMap).some((hit) => hit.id === 'stanton:cellin'), true)
assert.equal(searchNavPoints('Ariel', navMap).some((hit) => hit.name === 'Arial'), true)
assert.equal(resolveShopPlace({ system: 'Pyro', station: 'Checkmate Station' }, navMap), 'pyro:checkmate')
assert.equal(resolveShopPlace({ system: 'Stanton', station: 'Green Imperial Housing Exchange' }, navMap), 'stanton:grim-hex')
assert.equal(resolveShopPlace({ system: 'Nyx', station: 'Pyro Gateway (Nyx)' }, navMap), 'nyx:pyro-gateway')
assert.equal(resolveShopPlace({ system: 'Nyx', city: 'Levski' }, navMap), 'nyx:levski')
assert.equal(searchNavPoints('Levski', navMap).some((hit) => hit.id === 'nyx:levski'), true)

const shops = JSON.parse(readFileSync(path.join(root, 'src/data/ship-shop-shops.json'), 'utf8'))
const rows = [...Object.values(shops.ships || {}), ...Object.values(shops.items || {})].flat()
const missed = new Map()
for (const row of rows) {
  if (resolveShopPlace(row, navMap)) continue
  const key = [row.system, row.planet, row.moon, row.station, row.city, row.outpost].map((value) => value || '').join(' | ')
  missed.set(key, (missed.get(key) || 0) + 1)
}
assert.deepEqual([...missed.keys()], [], `unresolved shop places:\n${[...missed.keys()].join('\n')}`)

console.log(`nav route ok (${navMap.points.length} points)`)
