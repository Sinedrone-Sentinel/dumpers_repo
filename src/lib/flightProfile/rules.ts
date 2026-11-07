export type SideId = 'left' | 'right'
export type SlotId = 'main' | 'left' | 'right' | 'top' | 'topLeft' | 'topRight' | 'bottom'

export type ModuleId =
  | 'scg'
  | 'scg-lh'
  | 'ota'
  | 'ota-lh'
  | 'stecs'
  | 'stecs-plus'
  | 'stecs-max'
  | 'stg'
  | 'stg-lh'
  | 'fsm'
  | 'sem'
  | 'sem-h'
  | 'stem'
  | 'atem'
  | 'thq'
  | 'thq-v'
  | 'thq-ww2'
  | 'thq-v-ww2'

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
function sideBus(): Partial<Record<ModuleId, SlotId[]>> {
  return {
    scg: ['left', 'right'],
    'scg-lh': ['left', 'right'],
    'ota-lh': ['right'],
    ota: ['left'],
  }
}

/** SEM-V and THQ-V on a STECS, above it or on the front holder. */
function verticalOnThrottle(): Partial<Record<ModuleId, SlotId[]>> {
  const face: SlotId[] = ['top', 'bottom']
  return {
    stecs: face,
    'stecs-plus': face,
    'stecs-max': face,
    'stg-lh': face,
    stg: face,
  }
}

/** UCM desk mount or a standalone module on the top of a stick. */
function stickTop(): Partial<Record<ModuleId, SlotId[]>> {
  return {
    scg: ['top'],
    'scg-lh': ['top'],
    ota: ['top'],
    'ota-lh': ['top'],
  }
}

/** FSM-GA uses Top on a stick or a throttle. It does not use a side connector or the front. */
function standaloneTop(): Partial<Record<ModuleId, SlotId[]>> {
  const top: SlotId[] = ['top']
  return {
    ...stickTop(),
    stecs: top,
    'stecs-plus': top,
    'stecs-max': top,
    stg: top,
    'stg-lh': top,
  }
}

function throttleBottom(): Partial<Record<ModuleId, SlotId[]>> {
  const bottom: SlotId[] = ['bottom']
  return {
    stecs: bottom,
    'stecs-plus': bottom,
    'stecs-max': bottom,
    'stg-lh': bottom,
    stg: bottom,
  }
}

/**
 * VKB mount rules. `top` on a stick is the UCM desk mount or a standalone mount.
 * On a throttle it is the module sitting on the throttle. `bottom` is the front, toward
 * the pilot. `left` and `right` are the Gladiator side bus. A STECS base has no side bus.
 * Set `ready` only when devices.json has the same id.
 */
export const MODULE_RULES: ModuleRule[] = [
  { id: 'scg', name: 'NXT EVO Space Combat (RH)', kind: 'main', ready: true, photo: '/flight-profile/scg.jpg', hand: 'right', role: 'stick', ports: stickPorts },
  { id: 'scg-lh', name: 'NXT EVO Space Combat (LH)', kind: 'main', ready: true, photo: '/flight-profile/scg-lh.jpg', hand: 'left', role: 'stick', ports: stickPorts },
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

/** ATEM uses the rear plate, which this bay draws as the front mount, and only on Mini Plus and Max. */
export function mountsFor(rule: ModuleRule): Partial<Record<ModuleId, SlotId[]>> | undefined {
  if (rule.id !== 'atem') return rule.mounts
  const mounts: Partial<Record<ModuleId, SlotId[]>> = {}
  for (const main of MODULE_RULES) {
    if (main.acceptsAtem) mounts[main.id] = ['bottom']
  }
  return mounts
}
