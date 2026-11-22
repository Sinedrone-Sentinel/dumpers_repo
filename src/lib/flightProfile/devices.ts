import spec from './devices.json'
import generated from './generatedDevices.json'

export interface ControlDef {
  label: string
  input: string
  name: string
  x?: number
  y?: number
  tx?: number
  ty?: number
  pin?: boolean
}

export interface BreakoutDef {
  name: string
  cx?: number
  cy?: number
  r?: number
  x: number
  y: number
  kind: 'hat' | 'col' | 'row'
  slots?: Partial<Record<'up' | 'right' | 'down' | 'left' | 'press', string>>
  items?: string[]
  extra?: string[]
}

export interface DeviceDef {
  id: string
  title: string
  subtitle: string
  photo: string
  columns: number
  breakouts?: BreakoutDef[]
  controls: ControlDef[]
}

export const DEVICES = [...(spec.devices as DeviceDef[]), ...(generated.devices as DeviceDef[])]

export const PHOTO_SIZE: Record<string, { width: number; height: number }> = {
  'scg.jpg': { width: 823, height: 823 },
  'scg-lh.jpg': { width: 600, height: 600 },
  'fsm.jpg': { width: 750, height: 750 },
  'stecs.jpg': { width: 726, height: 948 },
  'stem.jpg': { width: 1200, height: 1200 },
  'semv.jpg': { width: 600, height: 600 },
  'sem.jpg': { width: 600, height: 600 },
  'gear/ota.jpg': { width: 600, height: 600 },
  'gear/ota-lh.jpg': { width: 600, height: 600 },
  'gear/scg-std.jpg': { width: 823, height: 823 },
  'gear/scg-std-lh.jpg': { width: 600, height: 600 },
  'gear/t-rudder.jpg': { width: 600, height: 600 },
  'gear/thq.jpg': { width: 600, height: 600 },
  'gear/thq-v.jpg': { width: 600, height: 600 },
  'gear/atem.jpg': { width: 600, height: 600 },
}

for (const device of generated.devices as DeviceDef[]) {
  if (!PHOTO_SIZE[device.photo]) PHOTO_SIZE[device.photo] = { width: 485, height: 770 }
}
