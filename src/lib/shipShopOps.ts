import { supabase } from './supabase'
import { emptyShipShopStore, parseShipShopStore, type ShipShopStore } from './shipShopData'

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
