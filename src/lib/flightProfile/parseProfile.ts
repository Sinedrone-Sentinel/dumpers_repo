import { ACTION_NAMES } from './actionNames'
import type { DeviceDef } from './devices'

const INPUT_OK = /^js[12]_(button\d+|hat\d+_(up|down|left|right)|x|y|z|rotx|roty|rotz)$/
const MAX_XML = 2_000_000

export interface ProfileBind {
  action: string
  label: string
  input: string
}

export interface ParsedFlightProfile {
  profileName: string
  fileName: string
  binds: Map<string, string[]>
  profileBinds: ProfileBind[]
}

export type ReadFlightResult =
  | { ok: true; profile: ParsedFlightProfile }
  | { ok: false; error: string }

function fileBase(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, '').trim()
}

export function readFlightProfile(xml: string, fileName: string): ReadFlightResult {
  const base = fileBase(fileName).slice(0, 180)
  if (!base.toLowerCase().endsWith('.xml')) {
    return { ok: false, error: 'Upload a Star Citizen .xml flight profile.' }
  }
  if (xml.length < 1 || xml.length > MAX_XML) {
    return { ok: false, error: 'That profile is empty or larger than 2 MB.' }
  }
  const lower = xml.toLowerCase()
  if (!lower.includes('<actionmaps') || !lower.includes('<rebind')) {
    return { ok: false, error: 'That file is not a Star Citizen flight profile.' }
  }

  const nameMatch = xml.match(/<ActionMaps\b[^>]*\bprofileName="([^"]*)"/i)
  let profileName = (nameMatch?.[1] ?? '').trim()
  if (!profileName) profileName = base.replace(/\.xml$/i, '') || 'Flight profile'
  profileName = profileName.slice(0, 120)

  const binds = new Map<string, string[]>()
  const profileBinds: ProfileBind[] = []
  const actionRe = /<action name="([^"]+)">([\s\S]*?)<\/action>/g
  let actionMatch: RegExpExecArray | null
  while ((actionMatch = actionRe.exec(xml))) {
    const action = actionMatch[1]
    const label = ACTION_NAMES[action] ?? action
    const rebindRe = /<rebind input="([^"]*)"/g
    let rebindMatch: RegExpExecArray | null
    while ((rebindMatch = rebindRe.exec(actionMatch[2]))) {
      const input = rebindMatch[1].trim()
      if (!input || /^js[12]_\s*$/.test(input) || !INPUT_OK.test(input)) continue
      profileBinds.push({ action, label, input })
      const list = binds.get(input) ?? []
      if (!list.includes(label)) list.push(label)
      binds.set(input, list)
    }
  }

  return { ok: true, profile: { profileName, fileName: base, binds, profileBinds } }
}

function inputSort(input: string): [number, number, number, string] {
  const button = input.match(/^js([12])_button(\d+)$/)
  if (button) return [Number(button[1]), 0, Number(button[2]), input]
  const hat = input.match(/^js([12])_hat(\d+)_(up|down|left|right)$/)
  if (hat) return [Number(hat[1]), 1, Number(hat[2]), hat[3]]
  const axis = input.match(/^js([12])_(x|y|z|rotx|roty|rotz)$/)
  if (axis) return [Number(axis[1]), 2, 0, axis[2]]
  return [9, 0, 0, input]
}

export function inputParts(input: string): [string, string] {
  const button = input.match(/^js([12])_button(\d+)$/)
  if (button) return [`Joystick ${button[1]}`, `Button ${button[2]}`]
  const hat = input.match(/^js([12])_hat(\d+)_(up|down|left|right)$/)
  if (hat) return [`Joystick ${hat[1]}`, `Hat ${hat[2]} ${hat[3]}`]
  const axisNames: Record<string, string> = {
    x: 'X axis',
    y: 'Y axis',
    z: 'Z axis',
    rotx: 'X rotation',
    roty: 'Y rotation',
    rotz: 'Z rotation',
  }
  const axis = input.match(/^js([12])_(x|y|z|rotx|roty|rotz)$/)
  if (axis) return [`Joystick ${axis[1]}`, axisNames[axis[2]]]
  return ['Joystick', input]
}

export function deadBinds(profile: ParsedFlightProfile, devices: DeviceDef[]): ProfileBind[] {
  const known = new Set<string>()
  const knownButtons = new Set<number>()
  for (const device of devices) {
    for (const control of device.controls) {
      known.add(control.input)
      const button = control.input.match(/^js\d+_button(\d+)$/)
      if (button) knownButtons.add(Number(button[1]))
    }
  }
  const dead: ProfileBind[] = []
  const seen = new Set<string>()
  for (const bind of profile.profileBinds) {
    const button = bind.input.match(/^js\d+_button(\d+)$/)
    if (known.has(bind.input) || (button && knownButtons.has(Number(button[1])))) continue
    const key = `${bind.input}\0${bind.label}`
    if (seen.has(key)) continue
    seen.add(key)
    dead.push(bind)
  }
  dead.sort((a, b) => {
    const left = inputSort(a.input)
    const right = inputSort(b.input)
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] < right[i]) return -1
      if (left[i] > right[i]) return 1
    }
    return a.label.localeCompare(b.label)
  })
  return dead
}
