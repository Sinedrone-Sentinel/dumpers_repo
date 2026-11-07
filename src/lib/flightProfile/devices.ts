import spec from './devices.json'

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

export const DEVICES = spec.devices as DeviceDef[]

export const PHOTO_SIZE: Record<string, { width: number; height: number }> = {
  'scg.jpg': { width: 485, height: 770 },
  'scg-lh.jpg': { width: 485, height: 770 },
  'fsm.jpg': { width: 750, height: 750 },
  'stecs.jpg': { width: 726, height: 948 },
  'stem.jpg': { width: 1200, height: 1200 },
  'semv.jpg': { width: 490, height: 326 },
  'sem.jpg': { width: 750, height: 750 },
}
