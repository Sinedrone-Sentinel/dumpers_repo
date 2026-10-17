import { supabase } from './supabase'
import { emptyShipShopStore, parseShipShopStore, type ShipShopStore } from './shipShopData'

export async function fetchShipShopLoadouts(): Promise<ShipShopStore> {
  const { data, error } = await supabase.rpc('get_ship_shop_loadouts')
  if (error) throw error
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
