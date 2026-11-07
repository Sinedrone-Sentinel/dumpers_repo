import { DEVICES, type DeviceDef } from './devices'
import { MODULE_RULES, mountsFor, type ModuleId, type ModuleRule, type SideId, type SlotId } from './rules'

export type { ModuleId, ModuleRule, SideId, SlotId }

export const SIDES: SideId[] = ['left', 'right']
export const SLOTS: SlotId[] = ['main', 'left', 'right', 'top', 'bottom']
export const SHEET_SLOTS: SlotId[] = ['top', 'main', 'left', 'right', 'bottom']

export const SLOT_LABEL: Record<SlotId, string> = {
  main: 'Main',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
}

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
  left: { main: null, left: null, right: null, top: null, bottom: null },
  right: { main: null, left: null, right: null, top: null, bottom: null },
}

const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]))

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
  const used = new Set<ModuleId>()
  for (const mountedSide of SIDES) {
    for (const mountedSlot of SLOTS) {
      const id = setup[mountedSide][mountedSlot]
      if (id && !(mountedSide === side && mountedSlot === slot)) used.add(id)
    }
  }
  const main = slot === 'main' ? null : setup[side].main
  const throttleTaken = slot === 'main' && throttleAlreadyMounted(setup, side)
  return MODULES.filter(
    (module) =>
      !used.has(module.id) &&
      fits(module, side, slot, main) &&
      !(throttleTaken && module.role === 'throttle')
  )
}

export function place(setup: Setup, side: SideId, slot: SlotId, id: ModuleId | null): Setup {
  const next: Setup = {
    left: { ...setup.left },
    right: { ...setup.right },
  }
  if (id) {
    for (const mountedSide of SIDES) {
      for (const mountedSlot of SLOTS) {
        if (next[mountedSide][mountedSlot] === id) next[mountedSide][mountedSlot] = null
      }
    }
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
