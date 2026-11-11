import { DEVICES, type DeviceDef } from './devices'
import { GEAR, MODULE_RULES, mountsFor, type GearItem, type ModuleId, type ModuleRule, type SideId, type SlotId } from './rules'

export type { ModuleId, ModuleRule, SideId, SlotId }

export const SIDES: SideId[] = ['left', 'right']
export const SLOTS: SlotId[] = ['main', 'left', 'right', 'top', 'topLeft', 'topRight', 'bottom']
export const SHEET_SLOTS: SlotId[] = ['topLeft', 'top', 'topRight', 'main', 'left', 'right', 'bottom']

export type BaySlot = SlotId | 'base'
export type SetupBrand = 'vkb' | 'virpil'

export const SLOT_LABEL: Record<BaySlot, string> = {
  main: 'Main',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  topLeft: 'Left wing',
  topRight: 'Right wing',
  bottom: 'Bottom',
  base: 'Base',
}

/** Every bay draws these. A mount the main lacks stays visible and disabled. */
export const BAY_SLOTS: SlotId[] = ['top', 'left', 'main', 'right', 'bottom']

export interface ModuleDef {
  id: ModuleId
  name: string
  photo: string
  manufacturer: string
  kind: 'main' | 'attach' | 'peripheral' | 'base'
  /** Main sticks and throttles only fit the matching hand. A main with no hand fits either side. */
  hand?: SideId
  /** Two sticks are allowed. Two throttles are allowed when each matches its side. */
  role?: 'stick' | 'throttle'
  /** Mounts this main exposes. */
  ports?: SlotId[]
  /** Where this attachment can sit on each main. */
  mounts?: Partial<Record<ModuleId, SlotId[]>>
  /** This stick grip needs a base under it. */
  needsBase?: boolean
  /** Bases this grip mounts on. */
  bases?: ModuleId[]
}

const RULE_BY_ID = new Map(MODULE_RULES.map((rule) => [rule.id, rule]))

function moduleFromGear(item: GearItem): ModuleDef {
  const rule = RULE_BY_ID.get(item.id)
  const photo = rule?.photo ?? (item.photo.startsWith('/') ? item.photo : `/flight-profile/${item.photo}`)
  return {
    id: item.id,
    name: rule?.name ?? item.name,
    photo,
    manufacturer: item.manufacturer,
    kind: item.kind,
    hand: rule?.hand ?? item.hand,
    role: rule?.role ?? item.role,
    ports: rule?.ports,
    mounts: rule ? mountsFor(rule) : undefined,
    needsBase: item.needsBase,
    bases: item.bases,
  }
}

export const ALL_MODULES: ModuleDef[] = GEAR.map(moduleFromGear)

export const DEFAULT_LISTED = new Set(GEAR.filter((item) => item.listed).map((item) => item.id))

/** Gear a member can pick before a database list replaces this set. */
export const MODULES: ModuleDef[] = ALL_MODULES.filter(
  (module) => DEFAULT_LISTED.has(module.id) && module.kind !== 'peripheral'
)

export interface SideBay {
  brand: SetupBrand
  main: ModuleId | null
  left: ModuleId | null
  right: ModuleId | null
  top: ModuleId | null
  topLeft: ModuleId | null
  topRight: ModuleId | null
  bottom: ModuleId | null
  base: ModuleId | null
}

export type Setup = Record<SideId, SideBay>

export function emptySide(brand: SetupBrand = 'vkb'): SideBay {
  return {
    brand,
    main: null,
    left: null,
    right: null,
    top: null,
    topLeft: null,
    topRight: null,
    bottom: null,
    base: null,
  }
}

export const EMPTY_SETUP: Setup = {
  left: emptySide(),
  right: emptySide(),
}

const STORED_SLOTS: BaySlot[] = [...SLOTS, 'base']

const MODULE_BY_ID = new Map(ALL_MODULES.map((module) => [module.id, module]))

function readStoredId(value: unknown): ModuleId | null {
  if (typeof value !== 'string' || !MODULE_BY_ID.has(value as ModuleId)) return null
  return value as ModuleId
}

/** Restore a saved bay. Unknown ids are dropped so a removed module cannot break the page. */
export function setupFromStored(value: unknown): Setup {
  const next: Setup = {
    left: emptySide(),
    right: emptySide(),
  }
  if (!value || typeof value !== 'object') return next
  const raw = value as Record<string, unknown>
  for (const side of SIDES) {
    const bay = raw[side]
    if (!bay || typeof bay !== 'object') continue
    const slots = bay as Record<string, unknown>
    const virpil = slots.setup === 'virpil'
    next[side].brand = virpil ? 'virpil' : 'vkb'
    const keys: BaySlot[] = virpil ? ['top', 'main', 'base'] : SLOTS
    for (const slot of keys) next[side][slot] = readStoredId(slots[slot])
  }
  for (const side of SIDES) {
    const main = next[side].main
    const brand = next[side].brand
    if (brand === 'virpil') {
      next[side].left = null
      next[side].right = null
      next[side].topLeft = null
      next[side].topRight = null
      next[side].bottom = null
    }
    for (const slot of SLOTS) {
      if (slot === 'main') continue
      const id = next[side][slot]
      if (id && !fits(moduleById(id), side, slot, main, brand)) next[side][slot] = null
    }
    if (next[side].base && !baseFits(next[side].base, main)) next[side].base = null
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

function fits(module: ModuleDef, side: SideId, slot: SlotId, main: ModuleId | null, brand: SetupBrand): boolean {
  if (module.kind === 'base') return false
  if (module.kind === 'main') {
    if (slot !== 'main') return false
    if (module.manufacturer !== (brand === 'virpil' ? 'Virpil' : 'VKB')) return false
    if (module.hand && module.hand !== side) return false
    return true
  }
  if (!main) return false
  const host = moduleById(main)
  if (host.ports && !host.ports.includes(slot)) return false
  return module.mounts?.[main]?.includes(slot) ?? false
}

export function baseFits(baseId: ModuleId, mainId: ModuleId | null): boolean {
  if (!mainId) return false
  const main = moduleById(mainId)
  const base = MODULE_BY_ID.get(baseId)
  if (!base || base.kind !== 'base' || !main.needsBase) return false
  return main.bases?.includes(baseId) ?? false
}

export function baseAvailable(setup: Setup, side: SideId): boolean {
  if (setup[side].brand !== 'virpil') return false
  const main = setup[side].main
  if (!main) return false
  return moduleById(main).needsBase === true
}

export function optionsFor(
  setup: Setup,
  side: SideId,
  slot: SlotId,
  listed: Set<string> = DEFAULT_LISTED
): ModuleDef[] {
  const main = slot === 'main' ? null : setup[side].main
  const brand = setup[side].brand
  return ALL_MODULES.filter(
    (module) =>
      listed.has(module.id) &&
      module.kind !== 'peripheral' &&
      module.kind !== 'base' &&
      fits(module, side, slot, main, brand)
  )
}

export function baseOptions(setup: Setup, side: SideId, listed: Set<string> = DEFAULT_LISTED): ModuleDef[] {
  const main = setup[side].main
  if (!main || setup[side].brand !== 'virpil') return []
  const allowed = new Set(moduleById(main).bases ?? [])
  return ALL_MODULES.filter((module) => module.kind === 'base' && listed.has(module.id) && allowed.has(module.id))
}

export function setBrand(setup: Setup, side: SideId, brand: SetupBrand): Setup {
  if (setup[side].brand === brand) return setup
  return { ...setup, [side]: emptySide(brand) }
}

export function visibleSlots(setup: Setup, side: SideId): BaySlot[] {
  if (setup[side].brand === 'virpil') return ['top', 'main', 'base']
  return SHEET_SLOTS
}

export type ExternalSide = 'externalLeft' | 'externalRight'

export const EXTERNAL_SIDES: ExternalSide[] = ['externalLeft', 'externalRight']

export type ExternalBay = [ModuleId | null, ModuleId | null]

export interface ExternalSetup {
  externalLeft: ExternalBay
  externalRight: ExternalBay
}

export const EMPTY_EXTERNALS: ExternalSetup = {
  externalLeft: [null, null],
  externalRight: [null, null],
}

export function externalOptions(listed: Set<string>, manufacturer: string): ModuleDef[] {
  return ALL_MODULES.filter((module) => {
    if (!listed.has(module.id) || module.kind === 'main' || module.kind === 'base') return false
    if (manufacturer !== 'ALL' && module.manufacturer !== manufacturer) return false
    return true
  })
}

export function manufacturers(): string[] {
  return [...new Set(GEAR.map((item) => item.manufacturer))]
}

export function place(setup: Setup, side: SideId, slot: BaySlot, id: ModuleId | null): Setup {
  const next: Setup = {
    left: { ...setup.left },
    right: { ...setup.right },
  }
  next[side][slot] = id
  if (slot === 'base') {
    if (id && !baseFits(id, next[side].main)) next[side].base = null
    return next
  }
  if (slot === 'main') {
    for (const otherSlot of SLOTS) {
      if (otherSlot === 'main') continue
      const current = next[side][otherSlot]
      if (!current) continue
      if (!fits(moduleById(current), side, otherSlot, id, next[side].brand)) next[side][otherSlot] = null
    }
    if (next[side].base && !baseFits(next[side].base, id)) next[side].base = null
  }
  return next
}

/** VKB sides keep the seven slots. A Virpil side saves top, main, and base. */
export function layoutSides(setup: Setup): Record<SideId, Record<string, ModuleId | null | SetupBrand>> {
  const out = {} as Record<SideId, Record<string, ModuleId | null | SetupBrand>>
  for (const side of SIDES) {
    const bay = setup[side]
    out[side] =
      bay.brand === 'virpil'
        ? { setup: 'virpil', top: bay.top, main: bay.main, base: bay.base }
        : {
            main: bay.main,
            left: bay.left,
            right: bay.right,
            top: bay.top,
            topLeft: bay.topLeft,
            topRight: bay.topRight,
            bottom: bay.bottom,
          }
  }
  return out
}

export interface SheetRef {
  side: SideId
  slot: BaySlot
  device: DeviceDef
  place?: string
}

export function sheetsFor(setup: Setup): SheetRef[] {
  const sheets: SheetRef[] = []
  for (const side of SIDES) {
    const virpil = setup[side].brand === 'virpil'
    for (const slot of visibleSlots(setup, side)) {
      const id = setup[side][slot]
      if (!id) continue
      const device = DEVICES.find((item) => item.id === id)
      if (!device) continue
      const place = virpil ? `${side === 'left' ? 'Left side' : 'Right side'} · ${SLOT_LABEL[slot]}` : undefined
      sheets.push({ side, slot, device, place })
    }
  }
  return sheets
}

export interface SlotPress {
  moduleId: ModuleId
  delta: number
  accepted: boolean
}

export type SidePresses = Record<BaySlot, SlotPress | null>

export type PressSetup = Record<SideId, SidePresses>

function emptyBay(): SidePresses {
  return { main: null, left: null, right: null, top: null, topLeft: null, topRight: null, bottom: null, base: null }
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

export function deviceNeedsPress(id: ModuleId): boolean {
  const device = DEVICES.find((item) => item.id === id)
  return Boolean(device && sampleButton(device))
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
    for (const slot of STORED_SLOTS) next[side][slot] = readSlotPress(slots[slot])
  }
  return next
}

export function syncPresses(presses: PressSetup, before: Setup, after: Setup): PressSetup {
  const next = emptyPresses()
  for (const side of SIDES) {
    for (const slot of STORED_SLOTS) {
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
    for (const slot of visibleSlots(setup, side)) {
      const id = setup[side][slot]
      if (!id || !deviceNeedsPress(id)) continue
      const press = presses[side][slot]
      if (press?.accepted && press.moduleId === id) continue
      labels.push(`${side === 'left' ? 'Left' : 'Right'} ${moduleById(id).name}`)
    }
  }
  return labels
}

export function externalsFromStored(value: unknown): ExternalSetup {
  const next: ExternalSetup = {
    externalLeft: [null, null],
    externalRight: [null, null],
  }
  if (!value || typeof value !== 'object') return next
  const raw = value as Record<string, unknown>
  for (const side of EXTERNAL_SIDES) {
    const bay = raw[side]
    if (!Array.isArray(bay)) continue
    next[side] = [0, 1].map((index) => {
      const id = bay[index]
      if (typeof id !== 'string' || !MODULE_BY_ID.has(id)) return null
      const module = MODULE_BY_ID.get(id)
      return module && module.kind !== 'main' ? id : null
    }) as ExternalBay
  }
  return next
}

export function externalPressesFromStored(value: unknown): Record<ExternalSide, [SlotPress | null, SlotPress | null]> {
  const next = {
    externalLeft: [null, null] as [SlotPress | null, SlotPress | null],
    externalRight: [null, null] as [SlotPress | null, SlotPress | null],
  }
  if (!value || typeof value !== 'object') return next
  const raw = value as Record<string, unknown>
  for (const side of EXTERNAL_SIDES) {
    const bay = raw[side]
    if (!Array.isArray(bay)) continue
    next[side] = [readSlotPress(bay[0]), readSlotPress(bay[1])]
  }
  return next
}

export function externalsEmpty(externals: ExternalSetup): boolean {
  return EXTERNAL_SIDES.every((side) => externals[side].every((id) => !id))
}

export function firstUnpressed(setup: Setup, presses: PressSetup): { side: SideId; slot: BaySlot } | null {
  for (const side of SIDES) {
    for (const slot of visibleSlots(setup, side)) {
      const id = setup[side][slot]
      if (!id || !deviceNeedsPress(id)) continue
      const press = presses[side][slot]
      if (press?.accepted && press.moduleId === id) continue
      return { side, slot }
    }
  }
  return null
}

/** Presses follow the side. VKB keeps seven slots. Virpil keeps top, main, and base. */
export function pressSides(presses: PressSetup, setup: Setup): Record<SideId, Record<string, SlotPress | null>> {
  const out = {} as Record<SideId, Record<string, SlotPress | null>>
  for (const side of SIDES) {
    const bay = presses[side]
    out[side] =
      setup[side].brand === 'virpil'
        ? { top: bay.top, main: bay.main, base: bay.base }
        : {
            main: bay.main,
            left: bay.left,
            right: bay.right,
            top: bay.top,
            topLeft: bay.topLeft,
            topRight: bay.topRight,
            bottom: bay.bottom,
          }
  }
  return out
}
