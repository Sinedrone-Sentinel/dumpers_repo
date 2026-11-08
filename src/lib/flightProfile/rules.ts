export type SideId = 'left' | 'right'
export type SlotId = 'main' | 'left' | 'right' | 'top' | 'topLeft' | 'topRight' | 'bottom'

import gearFile from './gear.json'

export interface GearItem {
  id: string
  name: string
  manufacturer: string
  kind: 'main' | 'attach' | 'peripheral'
  listed: boolean
  family: string
  hand?: 'left' | 'right'
  role?: 'stick' | 'throttle'
  photo: string
  sheet: string
}

export const GEAR = gearFile.gear as GearItem[]

export type ModuleId = string

export interface ModuleRule {
  id: ModuleId
  name: string
  kind: 'main' | 'attach'
  /** Shown in the picker only after a photo and a devices.json sheet exist. */
  ready: boolean
  photo?: string
  hand?: SideId
  /** Two sticks are legal. Two throttles are not. An Omni Throttle counts as a throttle. */
  role?: 'stick' | 'throttle'
  /** Mounts this main physically exposes. A Gladiator has no bottom port. */
  ports?: SlotId[]
  /** Rear plate can take an ATEM. Standard and Space Throttle Standard bases cannot. */
  acceptsAtem?: boolean
  mounts?: Partial<Record<ModuleId, SlotId[]>>
}

const stickPorts: SlotId[] = ['top', 'left', 'right']
const throttlePorts: SlotId[] = ['top', 'bottom']

/** Desktop SEM and THQ. The Omni elbow closes the side it occupies. */
function idsFor(family: string): ModuleId[] {
  return GEAR.filter((item) => item.family === family).map((item) => item.id)
}

function fill(target: Partial<Record<ModuleId, SlotId[]>>, family: string, slots: SlotId[]) {
  for (const id of idsFor(family)) {
    if (!target[id]) target[id] = slots
  }
}

function sideBus(): Partial<Record<ModuleId, SlotId[]>> {
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {
    scg: ['left', 'right'],
    'scg-lh': ['left', 'right'],
    'ota-lh': ['right'],
    ota: ['left'],
  }
  fill(mounts, 'gladiator-stick', ['left', 'right'])
  return mounts
}

/** SEM-V and THQ-V on a STECS, above it or on the front holder. */
function verticalOnThrottle(): Partial<Record<ModuleId, SlotId[]>> {
  const face: SlotId[] = ['top', 'bottom']
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {
    stecs: face,
    'stecs-plus': face,
    'stecs-max': face,
    'stg-lh': face,
    stg: face,
  }
  fill(mounts, 'stecs', face)
  fill(mounts, 'stecs-atem', face)
  return mounts
}

/** UCM desk mount or a standalone module on the top of a stick. */
function stickTop(): Partial<Record<ModuleId, SlotId[]>> {
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {
    scg: ['top'],
    'scg-lh': ['top'],
    ota: ['top'],
    'ota-lh': ['top'],
  }
  fill(mounts, 'gladiator-stick', ['top'])
  fill(mounts, 'gunfighter-stick', ['top'])
  return mounts
}

/** FSM-GA uses Top on a stick or a throttle. It does not use a side connector or the front. */
function standaloneTop(): Partial<Record<ModuleId, SlotId[]>> {
  const top: SlotId[] = ['top']
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {
    ...stickTop(),
    stecs: top,
    'stecs-plus': top,
    'stecs-max': top,
    stg: top,
    'stg-lh': top,
  }
  fill(mounts, 'stecs', top)
  fill(mounts, 'stecs-atem', top)
  return mounts
}

function throttleBottom(): Partial<Record<ModuleId, SlotId[]>> {
  const bottom: SlotId[] = ['bottom']
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {
    stecs: bottom,
    'stecs-plus': bottom,
    'stecs-max': bottom,
    'stg-lh': bottom,
    stg: bottom,
  }
  fill(mounts, 'stecs', bottom)
  fill(mounts, 'stecs-atem', bottom)
  return mounts
}

/**
 * VKB mount rules. `top` on a stick is the UCM desk mount or a standalone mount.
 * On a throttle it is the module sitting on the throttle. `bottom` is the front, toward
 * the pilot. `left` and `right` are the Gladiator side bus. A STECS base has no side bus.
 * Set `ready` only when devices.json has the same id.
 */
export const MODULE_RULES: ModuleRule[] = [
  { id: 'scg', name: 'Gladiator NXT EVO Space Combat Edition (Right Hand)', kind: 'main', ready: true, photo: '/flight-profile/scg.jpg', hand: 'right', role: 'stick', ports: stickPorts },
  { id: 'scg-lh', name: 'Gladiator NXT EVO Space Combat Edition (Left Hand)', kind: 'main', ready: true, photo: '/flight-profile/scg-lh.jpg', hand: 'left', role: 'stick', ports: stickPorts },
  { id: 'ota', name: 'NXT EVO Omni Throttle (RH)', kind: 'main', ready: false, hand: 'right', role: 'throttle', ports: ['top', 'left'] },
  { id: 'ota-lh', name: 'NXT EVO Omni Throttle (LH)', kind: 'main', ready: false, hand: 'left', role: 'throttle', ports: ['top', 'right'] },
  { id: 'stecs', name: 'STECS Modern Throttle (LH)', kind: 'main', ready: true, photo: '/flight-profile/stecs.jpg', hand: 'left', role: 'throttle', ports: throttlePorts },
  { id: 'stecs-plus', name: 'STECS Modern Throttle Mini Plus (LH)', kind: 'main', ready: false, hand: 'left', role: 'throttle', ports: throttlePorts, acceptsAtem: true },
  { id: 'stecs-max', name: 'STECS Modern Throttle Max (LH)', kind: 'main', ready: false, hand: 'left', role: 'throttle', ports: throttlePorts, acceptsAtem: true },
  { id: 'stg', name: 'STECS Space Throttle (RH)', kind: 'main', ready: false, hand: 'right', role: 'throttle', ports: throttlePorts },
  { id: 'stg-lh', name: 'STECS Space Throttle (LH)', kind: 'main', ready: false, hand: 'left', role: 'throttle', ports: throttlePorts },
  {
    id: 'fsm',
    name: 'FSM-GA',
    kind: 'attach',
    ready: true,
    photo: '/flight-profile/fsm.jpg',
    mounts: standaloneTop(),
  },
  { id: 'sem', name: 'SEM-V', kind: 'attach', ready: true, photo: '/flight-profile/semv.jpg', mounts: { ...verticalOnThrottle(), ...stickTop() } },
  { id: 'sem-h', name: 'SEM', kind: 'attach', ready: true, photo: '/flight-profile/sem.jpg', mounts: sideBus() },
  { id: 'stem', name: 'STEM', kind: 'attach', ready: true, photo: '/flight-profile/stem.jpg', mounts: throttleBottom() },
  { id: 'atem', name: 'ATEM', kind: 'attach', ready: false },
  { id: 'thq', name: 'THQ', kind: 'attach', ready: false, mounts: sideBus() },
  { id: 'thq-v', name: 'THQ-V', kind: 'attach', ready: false, mounts: verticalOnThrottle() },
  { id: 'thq-ww2', name: 'THQ WWII', kind: 'attach', ready: false, mounts: sideBus() },
  { id: 'thq-v-ww2', name: 'THQ-V WWII', kind: 'attach', ready: false, mounts: verticalOnThrottle() },
]

const RULE_IDS = new Set(MODULE_RULES.map((rule) => rule.id))

for (const item of GEAR) {
  if (item.kind !== 'main' || RULE_IDS.has(item.id)) continue
  const ports: SlotId[] =
    item.family === 'gladiator-stick'
      ? stickPorts
      : item.family === 'gunfighter-stick'
        ? ['top']
        : item.family === 'omni-right'
          ? ['top', 'left']
          : item.family === 'omni-left'
            ? ['top', 'right']
            : throttlePorts
  MODULE_RULES.push({
    id: item.id,
    name: item.name,
    kind: 'main',
    ready: item.listed,
    photo: `/flight-profile/${item.photo}`,
    hand: item.hand,
    role: item.role,
    ports,
    acceptsAtem: item.family === 'stecs-atem',
  })
}

/** ATEM uses the rear plate, which this bay draws as the front mount, and only on Mini Plus and Max. */
export function mountsFor(rule: ModuleRule): Partial<Record<ModuleId, SlotId[]>> | undefined {
  if (rule.id !== 'atem') return rule.mounts
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {}
  for (const main of MODULE_RULES) {
    if (main.acceptsAtem) mounts[main.id] = ['bottom']
  }
  return mounts
}
