import { DEVICES, type DeviceDef } from './devices'
import { MODULE_RULES, mountsFor, type ModuleId, type ModuleRule, type SideId, type SlotId } from './rules'

export type { ModuleId, ModuleRule, SideId, SlotId }

export const SIDES: SideId[] = ['left', 'right']
export const SLOTS: SlotId[] = ['main', 'left', 'right', 'top', 'topLeft', 'topRight', 'bottom']
export const SHEET_SLOTS: SlotId[] = ['topLeft', 'top', 'topRight', 'main', 'left', 'right', 'bottom']

export const SLOT_LABEL: Record<SlotId, string> = {
  main: 'Main',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  topLeft: 'Left wing',
  topRight: 'Right wing',
  bottom: 'Bottom',
}

/** Every bay draws these. A mount the main lacks stays visible and disabled. */
export const BAY_SLOTS: SlotId[] = ['top', 'left', 'main', 'right', 'bottom']

export interface ModuleDef {
  id: ModuleId
  name: string
  photo: string
  kind: 'main' | 'attach'
  /** Main sticks and throttles only fit the matching hand. */
  hand?: SideId
  /** A setup can hold two sticks, or one stick and one throttle. */
  role?: 'stick' | 'throttle'
  /** Mounts this main exposes. */
  ports?: SlotId[]
  /** Where this attachment can sit on each main. */
  mounts?: Partial<Record<ModuleId, SlotId[]>>
}

function toModule(rule: ModuleRule): ModuleDef {
  if (!rule.photo) throw new Error(`${rule.id} is marked ready without a photo`)
  return {
    id: rule.id,
    name: rule.name,
    photo: rule.photo,
    kind: rule.kind,
    hand: rule.hand,
    role: rule.role,
    ports: rule.ports,
    mounts: mountsFor(rule),
  }
}

/** Modules with a control sheet. The full mount table, including future modules, is in rules.ts. */
export const MODULES: ModuleDef[] = MODULE_RULES.filter((rule) => rule.ready).map(toModule)

export type Setup = Record<SideId, Record<SlotId, ModuleId | null>>

export const EMPTY_SETUP: Setup = {
  left: { main: null, left: null, right: null, top: null, topLeft: null, topRight: null, bottom: null },
  right: { main: null, left: null, right: null, top: null, topLeft: null, topRight: null, bottom: null },
}

const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]))

/** Restore a saved bay. Unknown ids are dropped so a removed module cannot break the page. */
export function setupFromStored(value: unknown): Setup {
  const next: Setup = {
    left: { ...EMPTY_SETUP.left },
    right: { ...EMPTY_SETUP.right },
  }
  if (!value || typeof value !== 'object') return next
  const raw = value as Record<string, unknown>
  for (const side of SIDES) {
    const bay = raw[side]
    if (!bay || typeof bay !== 'object') continue
    const slots = bay as Record<string, unknown>
    for (const slot of SLOTS) {
      const id = slots[slot]
      if (typeof id !== 'string' || !MODULE_BY_ID.has(id as ModuleId)) continue
      next[side][slot] = id as ModuleId
    }
  }
  for (const side of SIDES) {
    const main = next[side].main
    for (const slot of SLOTS) {
      if (slot === 'main') continue
      const id = next[side][slot]
      if (id && !fits(moduleById(id), side, slot, main)) next[side][slot] = null
    }
  }
  return next
}

/** False when this main has no such connector, so the bay can grey that mount out. */
export function slotAvailable(setup: Setup, side: SideId, slot: SlotId): boolean {
  if (slot === 'main') return true
  const main = setup[side].main
  if (!main) return false
  return moduleById(main).ports?.includes(slot) ?? false
}

export function moduleById(id: ModuleId): ModuleDef {
  const module = MODULE_BY_ID.get(id)
  if (!module) throw new Error(`Unknown module ${id}`)
  return module
}

function otherSide(side: SideId): SideId {
  return side === 'left' ? 'right' : 'left'
}

function fits(module: ModuleDef, side: SideId, slot: SlotId, main: ModuleId | null): boolean {
  if (module.kind === 'main') return slot === 'main' && module.hand === side
  if (!main) return false
  const host = moduleById(main)
  if (host.ports && !host.ports.includes(slot)) return false
  return module.mounts?.[main]?.includes(slot) ?? false
}

function throttleAlreadyMounted(setup: Setup, side: SideId): boolean {
  const other = setup[otherSide(side)].main
  return Boolean(other && moduleById(other).role === 'throttle')
}

export function optionsFor(setup: Setup, side: SideId, slot: SlotId): ModuleDef[] {
  const main = slot === 'main' ? null : setup[side].main
  const throttleTaken = slot === 'main' && throttleAlreadyMounted(setup, side)
  return MODULES.filter(
    (module) => fits(module, side, slot, main) && !(throttleTaken && module.role === 'throttle')
  )
}

export function place(setup: Setup, side: SideId, slot: SlotId, id: ModuleId | null): Setup {
  const next: Setup = {
    left: { ...setup.left },
    right: { ...setup.right },
  }
  next[side][slot] = id
  if (slot === 'main' && id && moduleById(id).role === 'throttle') {
    const other = otherSide(side)
    const otherMain = next[other].main
    if (otherMain && moduleById(otherMain).role === 'throttle') {
      next[other].main = null
      for (const otherSlot of SLOTS) {
        if (otherSlot === 'main') continue
        const current = next[other][otherSlot]
        if (current && !fits(moduleById(current), other, otherSlot, null)) next[other][otherSlot] = null
      }
    }
  }
  if (slot === 'main') {
    for (const otherSlot of SLOTS) {
      if (otherSlot === 'main') continue
      const current = next[side][otherSlot]
      if (!current) continue
      if (!fits(moduleById(current), side, otherSlot, id)) next[side][otherSlot] = null
    }
  }
  return next
}

export interface SheetRef {
  side: SideId
  slot: SlotId
  device: DeviceDef
}

export function sheetsFor(setup: Setup): SheetRef[] {
  const sheets: SheetRef[] = []
  for (const side of SIDES) {
    for (const slot of SHEET_SLOTS) {
      const id = setup[side][slot]
      if (!id) continue
      const device = DEVICES.find((item) => item.id === id)
      if (device) sheets.push({ side, slot, device })
    }
  }
  return sheets
}

export interface SlotPress {
  moduleId: ModuleId
  delta: number
  accepted: boolean
}

export type PressSetup = Record<SideId, Record<SlotId, SlotPress | null>>

function emptyBay(): Record<SlotId, SlotPress | null> {
  return { main: null, left: null, right: null, top: null, topLeft: null, topRight: null, bottom: null }
}

export function emptyPresses(): PressSetup {
  return { left: emptyBay(), right: emptyBay() }
}

/** Chrome and Edge can hear a gamepad or a VKB USB report. Other browsers never ask. */
export function hearsButtonPress(ua: string): boolean {
  if (/Edg\//.test(ua)) return true
  return /Chrome\//.test(ua) && !/Edg\/|OPR\/|Opera/.test(ua)
}

/** 1-based button number for a control that just went down. */
export function risingButton(previous: boolean[], current: boolean[]): number | null {
  const length = Math.max(previous.length, current.length)
  for (let index = 0; index < length; index += 1) {
    if (current[index] && !previous[index]) return index + 1
  }
  return null
}

/** 1-based index of a bit that just went high in a HID report. */
export function risingBit(previous: Uint8Array, current: Uint8Array): number | null {
  const length = Math.max(previous.length, current.length)
  for (let index = 0; index < length; index += 1) {
    const rose = (current[index] ?? 0) & ~(previous[index] ?? 0)
    if (!rose) continue
    for (let bit = 0; bit < 8; bit += 1) {
      if (rose & (1 << bit)) return index * 8 + bit + 1
    }
  }
  return null
}

export interface ButtonBit {
  reportId: number
  byteIndex: number
  mask: number
  button: number
}

interface HidReportItemLike {
  isArray?: boolean
  isRange?: boolean
  usages?: number[]
  usageMinimum?: number
  reportSize?: number
  reportCount?: number
  logicalMaximum?: number
}

interface HidReportLike {
  reportId?: number
  items?: HidReportItemLike[]
}

interface HidCollectionLike {
  children?: HidCollectionLike[]
  inputReports?: HidReportLike[]
}

/** Button bits only. Axis bytes in the same report are not buttons. One report keeps a single bit cursor across nested collections, so buttons past 32 stay in the right byte. */
export function buttonBitsFromCollections(collections: HidCollectionLike[]): ButtonBit[] {
  const itemsByReport = new Map<number, HidReportItemLike[]>()
  const walk = (nodes: HidCollectionLike[]) => {
    for (const node of nodes) {
      for (const report of node.inputReports ?? []) {
        const id = report.reportId ?? 0
        const items = itemsByReport.get(id) ?? []
        items.push(...(report.items ?? []))
        itemsByReport.set(id, items)
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(collections)
  const found: ButtonBit[] = []
  for (const [reportId, items] of itemsByReport) {
    let cursor = 0
    for (const item of items) {
      const size = item.reportSize ?? 0
      const count = item.reportCount ?? 0
      const ranged = item.isRange === true && (item.usageMinimum ?? 0) >= 1
      const buttonField = size === 1 && count > 0 && !item.isArray && (item.logicalMaximum === 1 || ranged)
      if (buttonField) {
        for (let offset = 0; offset < count; offset += 1) {
          const raw = item.isRange
            ? (item.usageMinimum ?? 1) + offset
            : (item.usages?.[offset] ?? (item.usages?.[0] ?? 1) + offset)
          const button = raw & 0xffff
          if (button > 0 && button <= 128) {
            const bit = cursor + offset
            found.push({
              reportId,
              byteIndex: bit >> 3,
              mask: 1 << (bit & 7),
              button,
            })
          }
        }
      }
      cursor += size * count
    }
  }
  return found
}

/** Update button highs from one report. Bytes outside the button fields stay out of the result. */
export function applyButtonReport(
  highs: boolean[],
  bits: ButtonBit[],
  reportId: number,
  data: Uint8Array,
): boolean[] {
  const next = highs.slice()
  let touched = false
  for (const bit of bits) {
    if (bit.reportId !== reportId || bit.button < 1) continue
    touched = true
    const index = bit.button - 1
    while (next.length <= index) next.push(false)
    next[index] = ((data[bit.byteIndex] ?? 0) & bit.mask) !== 0
  }
  return touched ? next : highs
}

interface ButtonTrack {
  primed: boolean
  high: boolean
  rises: number[]
  blocked: boolean
}

const FLAP_WINDOW_MS = 400
const FLAP_LIMIT = 4

/**
 * A press counts as soon as the button goes down. Holding it does not send it again.
 * The first look only records what is already held.
 * Four rises in under half a second are a controller flipping on its own, and that button is ignored.
 */
export function buttonTracks(): Map<string, ButtonTrack> {
  return new Map()
}

export function stableButton(
  trackers: Map<string, ButtonTrack>,
  source: string,
  highs: boolean[],
  now: number,
): { button: number | null; revoked: number[] } {
  let button: number | null = null
  const revoked: number[] = []
  for (let index = 0; index < highs.length; index += 1) {
    const key = `${source}:${index}`
    let tracker = trackers.get(key)
    if (!tracker) {
      tracker = { primed: false, high: false, rises: [], blocked: false }
      trackers.set(key, tracker)
    }
    const high = highs[index] === true
    if (!tracker.primed) {
      tracker.primed = true
      tracker.high = high
      continue
    }
    if (tracker.blocked) continue
    if (!high) {
      tracker.high = false
      continue
    }
    if (tracker.high) continue
    tracker.high = true
    tracker.rises = tracker.rises.filter((time) => now - time < FLAP_WINDOW_MS)
    tracker.rises.push(now)
    if (tracker.rises.length >= FLAP_LIMIT) {
      tracker.blocked = true
      revoked.push(index + 1)
      continue
    }
    if (button == null || index + 1 > button) button = index + 1
  }
  return { button, revoked }
}

export function sampleButton(device: DeviceDef): { name: string; button: number } | null {
  let best: { name: string; button: number } | null = null
  for (const control of device.controls) {
    const match = control.input.match(/^js\d+_button(\d+)$/)
    if (!match) continue
    const button = Number(match[1])
    if (!best || button < best.button) best = { name: control.name, button }
  }
  return best
}

export function shiftDevice(device: DeviceDef, delta: number): DeviceDef {
  if (!delta) return device
  const labels = new Map<string, string>()
  const controls = device.controls.map((control) => {
    const match = control.input.match(/^(js\d+)_button(\d+)$/)
    if (!match) return control
    const button = Number(match[2]) + delta
    const label = /^\d+$/.test(control.label) ? String(button) : control.label
    if (/^\d+$/.test(control.label)) labels.set(control.label, label)
    return { ...control, label, input: `${match[1]}_button${button}` }
  })
  const rename = (label: string | undefined) => (label ? labels.get(label) ?? label : label)
  const breakouts = device.breakouts?.map((group) => ({
    ...group,
    slots: group.slots
      ? Object.fromEntries(Object.entries(group.slots).map(([key, label]) => [key, rename(label)]))
      : group.slots,
    items: group.items?.map((label) => rename(label) ?? label),
    extra: group.extra?.map((label) => rename(label) ?? label),
  }))
  return { ...device, controls, breakouts }
}

function readSlotPress(value: unknown): SlotPress | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.moduleId !== 'string' || !MODULE_BY_ID.has(raw.moduleId as ModuleId)) return null
  if (typeof raw.delta !== 'number' || !Number.isInteger(raw.delta) || raw.delta < -512 || raw.delta > 512) return null
  if (raw.accepted !== true) return null
  return { moduleId: raw.moduleId as ModuleId, delta: raw.delta, accepted: true }
}

export function pressesFromStored(value: unknown): PressSetup {
  const next = emptyPresses()
  if (!value || typeof value !== 'object') return next
  const raw = value as Record<string, unknown>
  for (const side of SIDES) {
    const bay = raw[side]
    if (!bay || typeof bay !== 'object') continue
    const slots = bay as Record<string, unknown>
    for (const slot of SLOTS) next[side][slot] = readSlotPress(slots[slot])
  }
  return next
}

export function syncPresses(presses: PressSetup, before: Setup, after: Setup): PressSetup {
  const next = emptyPresses()
  for (const side of SIDES) {
    for (const slot of SLOTS) {
      const kept = presses[side][slot]
      const id = after[side][slot]
      if (before[side][slot] === id && kept && kept.moduleId === id) next[side][slot] = kept
    }
  }
  return next
}

export function unpressedLabels(setup: Setup, presses: PressSetup): string[] {
  const labels: string[] = []
  for (const side of SIDES) {
    for (const slot of SHEET_SLOTS) {
      const id = setup[side][slot]
      if (!id) continue
      const press = presses[side][slot]
      if (press?.accepted && press.moduleId === id) continue
      labels.push(`${side === 'left' ? 'Left' : 'Right'} ${moduleById(id).name}`)
    }
  }
  return labels
}

export function firstUnpressed(setup: Setup, presses: PressSetup): { side: SideId; slot: SlotId } | null {
  for (const side of SIDES) {
    for (const slot of SHEET_SLOTS) {
      const id = setup[side][slot]
      if (!id) continue
      const press = presses[side][slot]
      if (press?.accepted && press.moduleId === id) continue
      return { side, slot }
    }
  }
  return null
}
