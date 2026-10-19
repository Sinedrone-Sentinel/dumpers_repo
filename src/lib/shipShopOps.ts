import { supabase } from './supabase'
import { emptyShipShopStore, parseShipShopStore, type ShipBuild, type ShipShopStore } from './shipShopData'

/** Survives the guest-cache wipe, same as the notepad. */
const GUEST_SHIP_SHOP_STORAGE_KEY = 'dumpers_guest_ship_shop'

export async function fetchShipShopLoadouts(): Promise<ShipShopStore | null> {
  const { data, error } = await supabase.rpc('get_ship_shop_loadouts')
  if (error) throw error
  if (data == null) return null
  return parseShipShopStore(data)
}

export async function saveShipShopLoadouts(store: ShipShopStore): Promise<void> {
  const { error } = await supabase.rpc('save_ship_shop_loadouts', {
    p_store: { version: 1, builds: store.builds },
  })
  if (error) throw error
}

export function defaultShipShopLoadouts(): ShipShopStore {
  return emptyShipShopStore()
}

export function shipShopStoreHasShip(store: ShipShopStore): boolean {
  return store.builds.some((build) => Boolean(build.shipId))
}

export function readGuestShipShopStore(): ShipShopStore {
  if (typeof localStorage === 'undefined') return emptyShipShopStore()
  try {
    return parseShipShopStore(JSON.parse(localStorage.getItem(GUEST_SHIP_SHOP_STORAGE_KEY) || 'null'))
  } catch {
    return emptyShipShopStore()
  }
}

export function writeGuestShipShopStore(store: ShipShopStore): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    GUEST_SHIP_SHOP_STORAGE_KEY,
    JSON.stringify({ version: 1, builds: store.builds }),
  )
}

export function clearGuestShipShopStore(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(GUEST_SHIP_SHOP_STORAGE_KEY)
}

export type FrakenFit = {
  shipId: string
  ports: ShipBuild['ports']
  power?: Record<string, number>
}

/** Drop unknown parts and any cart. A published fit is ship, ports, and pips. */
export function parseFrakenFit(raw: unknown): FrakenFit | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = parseShipShopStore({ version: 1, builds: [raw] })
  const build = parsed.builds[0]
  if (!build?.shipId) return null
  return build.power
    ? { shipId: build.shipId, ports: build.ports, power: build.power }
    : { shipId: build.shipId, ports: build.ports }
}

export async function fetchShipShopFrakenFit(shipId: string): Promise<FrakenFit | null> {
  const { data, error } = await supabase.rpc('get_ship_shop_fraken_fit', { p_ship_id: shipId })
  if (error) throw error
  return parseFrakenFit(data)
}

export async function fetchFrakenCanSave(): Promise<boolean> {
  const { data, error } = await supabase.rpc('ship_shop_fraken_can_save')
  if (error) throw error
  return data === true
}

export async function saveShipShopFrakenFit(build: ShipBuild): Promise<FrakenFit> {
  if (!build.shipId) throw new Error('No ship')
  const { data, error } = await supabase.rpc('save_ship_shop_fraken_fit', {
    p_ship_id: build.shipId,
    p_build: {
      shipId: build.shipId,
      ports: build.ports,
      power: build.power ?? {},
    },
  })
  if (error) throw error
  const saved = parseFrakenFit(data)
  if (!saved) throw new Error('Save failed')
  return saved
}
