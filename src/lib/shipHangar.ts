import { supabase } from './supabase'
import { getShip, stockPorts, type GameShip } from './shipShopData'
import type { FittedPart } from './shipShopMath'

export const HANGAR_CAP = 10
export const HANGAR_CAP_VERIFIED = 20
export const HANGAR_SIGN_IN = 'Sign in to use your hangar.'

export interface HangarBuild {
  ports: Record<string, FittedPart>
  power?: Record<string, number>
}

export interface HangarShip {
  id: string
  shipId: string
  label: string
  build: HangarBuild
}

export function hangarCap(rsiVerified: boolean): number {
  return rsiVerified ? HANGAR_CAP_VERIFIED : HANGAR_CAP
}

/** First copy keeps the display name. Later copies are "Name 2", "Name 10", with no leading zero. */
export function nextHangarLabel(ships: HangarShip[], shipId: string, displayName: string): string {
  const used = new Set(ships.filter((ship) => ship.shipId === shipId).map((ship) => ship.label))
  if (!used.has(displayName)) return displayName
  for (let number = 2; number < 1000; number += 1) {
    const label = `${displayName} ${number}`
    if (!used.has(label)) return label
  }
  return `${displayName} ${used.size + 1}`
}

export function stockHangarBuild(ship: GameShip): HangarBuild {
  return { ports: stockPorts(ship) }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function parseHangarShips(raw: unknown): HangarShip[] {
  if (!Array.isArray(raw)) return []
  const ships: HangarShip[] = []
  for (const row of raw) {
    const record = asRecord(row)
    const build = asRecord(record?.build)
    const shipId = typeof record?.shipId === 'string' ? record.shipId : ''
    const label = typeof record?.label === 'string' ? record.label : ''
    const id = typeof record?.id === 'string' ? record.id : ''
    if (!record || !build || !shipId || !label || !id || !getShip(shipId)) continue
    const ports: HangarBuild['ports'] = {}
    const rawPorts = asRecord(build.ports) || {}
    for (const [portId, fitted] of Object.entries(rawPorts)) {
      const part = asRecord(fitted)
      if (!part) continue
      const entityClass = typeof part.entityClass === 'string' ? part.entityClass : ''
      if (!entityClass) continue
      const qualities: Record<number, number> = {}
      const rawQualities = asRecord(part.qualities)
      if (rawQualities) {
        for (const [key, value] of Object.entries(rawQualities)) {
          const band = Number(key)
          if (Number.isInteger(band) && typeof value === 'number' && Number.isFinite(value)) qualities[band] = value
        }
      }
      ports[portId] = Object.keys(qualities).length > 0
        ? { entityClass, source: part.source === 'crafted' ? 'crafted' : 'stock', qualities }
        : { entityClass, source: part.source === 'crafted' ? 'crafted' : 'stock' }
    }
    const power: Record<string, number> = {}
    const rawPower = asRecord(build.power)
    if (rawPower) {
      for (const [key, value] of Object.entries(rawPower)) {
        if (typeof value === 'number' && Number.isFinite(value)) power[key] = value
      }
    }
    ships.push({
      id,
      shipId,
      label,
      build: Object.keys(power).length > 0 ? { ports, power } : { ports },
    })
  }
  return ships
}

export async function fetchShipHangar(): Promise<HangarShip[]> {
  const { data, error } = await supabase.rpc('get_ship_hangar')
  if (error) throw error
  return parseHangarShips(data)
}

export async function saveShipHangar(ships: HangarShip[]): Promise<void> {
  const { error } = await supabase.rpc('save_ship_hangar', { p_ships: ships })
  if (error) throw error
}
