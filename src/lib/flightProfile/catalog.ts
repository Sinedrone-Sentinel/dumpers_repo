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
