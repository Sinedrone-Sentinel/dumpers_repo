import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const gear = JSON.parse(readFileSync(join(root, 'src/lib/flightProfile/gear.json'), 'utf8')).gear
const spec = JSON.parse(readFileSync(join(root, 'src/lib/flightProfile/devices.json'), 'utf8'))
const byId = new Map(spec.devices.map((device) => [device.id, device]))

const BASE = new Set(['F1', 'F2', 'F3', 'Sw1', 'Throttle', 'En1'])
const STANDARD_DROP = new Set(['Rapid', 'C1', 'A1 axis'])

function without(device, names) {
  const drop = new Set(names)
  const breakouts = (device.breakouts ?? []).filter((group) => !drop.has(group.name))
  const labels = new Set(breakouts.flatMap((group) => [
    ...Object.values(group.slots ?? {}),
    ...(group.items ?? []),
    ...(group.extra ?? []),
  ]))
  const controls = device.controls.filter((control) => {
    if (drop.has('F1') && ['F1', 'F2', 'F3', 'En1 up', 'En1 down', 'Sw1 up', 'Sw1 down', 'Base throttle'].includes(control.name)) return false
    if (drop.has('Rapid') && control.name.startsWith('Rapid')) return false
    if (drop.has('C1') && control.name.startsWith('C1')) return false
    if (drop.has('A1 axis') && (control.name.startsWith('A1') || control.label.startsWith('H1') || control.label === 'Click' || control.label.startsWith('A1'))) return false
    return true
  })
  return { breakouts, controls }
}

function rudderSheet() {
  return {
    columns: 1,
    breakouts: [
      { name: 'Left pedal', cx: 38, cy: 34, r: 8, x: 8, y: 18, kind: 'col', items: ['Z'] },
      { name: 'Right pedal', cx: 78, cy: 42, r: 8, x: 92, y: 58, kind: 'col', items: ['Z'] },
    ],
    controls: [{ label: 'Z', input: 'js3_z', name: 'Rudder', pin: false }],
  }
}

function axesSheet() {
  return {
    columns: 1,
    breakouts: [],
    controls: [
      { label: 'X', input: 'js1_x', name: 'Stick X', pin: false },
      { label: 'Y', input: 'js1_y', name: 'Stick Y', pin: false },
    ],
  }
}

function cloneSheet(sourceId, mode) {
  if (mode === 'axes') return axesSheet()
  if (mode === 'rudder') return rudderSheet()
  if (mode === 'stub') {
    return {
      columns: 1,
      breakouts: [],
      controls: [
        { label: '1', input: 'js1_button1', name: 'Button 1', pin: false },
        { label: '2', input: 'js1_button2', name: 'Button 2', pin: false },
        { label: '3', input: 'js1_button3', name: 'Button 3', pin: false },
      ],
    }
  }
  const source = byId.get(sourceId)
  if (!source) throw new Error(`missing sheet ${sourceId}`)
  if (mode === 'same') return { breakouts: source.breakouts, controls: source.controls, columns: source.columns }
  if (mode === 'std') {
    const cut = without(source, STANDARD_DROP)
    return { breakouts: cut.breakouts, controls: cut.controls, columns: source.columns }
  }
  if (mode === 'gf') {
    const cut = without(source, BASE)
    return { breakouts: cut.breakouts, controls: cut.controls, columns: source.columns }
  }
  if (mode === 'std-gf') {
    const cut = without(source, new Set([...STANDARD_DROP, ...BASE]))
    return { breakouts: cut.breakouts, controls: cut.controls, columns: source.columns }
  }
  throw new Error(`unknown sheet mode ${mode}`)
}

const modeFor = {
  'scg-std': ['scg', 'std'],
  'scg-std-lh': ['scg-lh', 'std'],
  scg: ['scg', 'same'],
  'scg-lh': ['scg-lh', 'same'],
  'scg-gf': ['scg', 'gf'],
  'scg-gf-lh': ['scg-lh', 'gf'],
  'scg-std-gf': ['scg', 'std-gf'],
  'scg-std-gf-lh': ['scg-lh', 'std-gf'],
  stecs: ['stecs', 'same'],
  stub: [null, 'stub'],
  rudder: [null, 'rudder'],
  axes: [null, 'axes'],
}

const devices = []
for (const item of gear) {
  if (item.sheet === 'keep') continue
  const [sourceId, mode] = modeFor[item.sheet] ?? [null, 'stub']
  const sheet = cloneSheet(sourceId, mode)
  const hand = item.hand === 'left' ? 'Left hand' : item.hand === 'right' ? 'Right hand' : 'Standalone'
  const subtitle = item.kind === 'base'
    ? 'Base'
    : item.kind === 'peripheral' || item.kind === 'attach'
      ? 'Standalone'
      : hand
  devices.push({
    id: item.id,
    title: item.name.replace(/ \((Right|Left) Hand\)$/, ''),
    subtitle,
    photo: item.photo,
    columns: sheet.columns,
    breakouts: sheet.breakouts,
    controls: sheet.controls,
  })
}

const out = join(root, 'src/lib/flightProfile/generatedDevices.json')
writeFileSync(out, `${JSON.stringify({ devices }, null, 2)}\n`, 'utf8')
console.log(`wrote ${devices.length} sheets`)
