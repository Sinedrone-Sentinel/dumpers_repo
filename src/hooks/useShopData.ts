import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface ShopSystem {
  system: string
  shop_count: number
}

export interface ShopLocation {
  location: string
  location_type: string | null
  shop_count: number
}

export interface Shop {
  id: number
  shop_reference: string
  name: string
  location_type: string | null
  accepts_stolen_goods: boolean
  profit_margin: number
}

export interface ShopDetails extends Shop {
  container_path: string | null
  system: string
  location: string | null
}

export interface ShopInventoryItem {
  id: number
  item_name: string
  display_name: string | null
  item_type: string | null
  sub_type: string | null
  base_price: number
  effective_price: number | null
  shop_buys: boolean
  shop_sells: boolean
  shop_rents: boolean
  tags: string[] | null
}

export interface ShopInventoryType {
  item_type: string
  item_count: number
}

export interface ComponentShopListing {
  shop_id: number
  shop_name: string
  location: string | null
  system: string
  effective_price: number | null
  base_price: number
}

export interface ComponentPriceSummary {
  component_name: string
  component_type: string | null
  avg_price: number | null
  min_price: number | null
  max_price: number | null
  shop_count: number
}

// Cache for price summaries (loaded once)
let priceSummaryCache: Map<string, ComponentPriceSummary> | null = null

export function useShopSystems() {
  const [data, setData] = useState<ShopSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSystems = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shop_systems')

      if (queryError) {
        setError(queryError.message)
        setData([])
      } else {
        setData(result || [])
      }

      setLoading(false)
    }

    fetchSystems()
  }, [])

  return { data, loading, error }
}

export function useShopLocations(system: string | null) {
  const [data, setData] = useState<ShopLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!system) {
      setData([])
      return
    }

    const fetchLocations = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shop_locations', {
        p_system: system,
      })

      if (queryError) {
        setError(queryError.message)
        setData([])
      } else {
        setData(result || [])
      }

      setLoading(false)
    }

    fetchLocations()
  }, [system])

  return { data, loading, error }
}

export function useShopsAtLocation(system: string | null, location: string | null) {
  const [data, setData] = useState<Shop[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!system) {
      setData([])
      return
    }

    const fetchShops = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shops_at_location', {
        p_system: system,
        p_location: location,
      })

      if (queryError) {
        setError(queryError.message)
        setData([])
      } else {
        setData(result || [])
      }

      setLoading(false)
    }

    fetchShops()
  }, [system, location])

  return { data, loading, error }
}

export function useShopById(shopId: number | null) {
  const [data, setData] = useState<ShopDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shopId) {
      setData(null)
      return
    }

    const fetchShop = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shop_by_id', {
        p_shop_id: shopId,
      })

      if (queryError) {
        setError(queryError.message)
        setData(null)
      } else {
        setData(result?.[0] || null)
      }

      setLoading(false)
    }

    fetchShop()
  }, [shopId])

  return { data, loading, error }
}

export function useShopInventory(
  shopId: number | null,
  itemType: string | null = null,
  search: string | null = null,
  sellsOnly: boolean = false
) {
  const [data, setData] = useState<ShopInventoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shopId) {
      setData([])
      return
    }

    const fetchInventory = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shop_inventory', {
        p_shop_id: shopId,
        p_item_type: itemType,
        p_search: search || null,
        p_sells_only: sellsOnly || null,
      })

      if (queryError) {
        setError(queryError.message)
        setData([])
      } else {
        setData(result || [])
      }

      setLoading(false)
    }

    fetchInventory()
  }, [shopId, itemType, search, sellsOnly])

  return { data, loading, error }
}

export function useShopInventoryTypes() {
  const [data, setData] = useState<ShopInventoryType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTypes = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shop_inventory_types')

      if (queryError) {
        setError(queryError.message)
        setData([])
      } else {
        setData(result || [])
      }

      setLoading(false)
    }

    fetchTypes()
  }, [])

  return { data, loading, error }
}

export function useShopsSellingComponent(componentName: string | null) {
  const [data, setData] = useState<ComponentShopListing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!componentName) {
      setData([])
      return
    }

    const fetchShops = async () => {
      setLoading(true)
      setError(null)

      const { data: result, error: queryError } = await supabase.rpc('get_shops_selling_component', {
        p_component_name: componentName,
      })

      if (queryError) {
        setError(queryError.message)
        setData([])
      } else {
        setData(result || [])
      }

      setLoading(false)
    }

    fetchShops()
  }, [componentName])

  return { data, loading, error }
}

export function useComponentPriceSummaries() {
  const [data, setData] = useState<Map<string, ComponentPriceSummary>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: result, error: queryError } = await supabase.rpc('get_component_price_summaries')

    if (queryError) {
      setError(queryError.message)
      setData(new Map())
    } else {
      const map = new Map<string, ComponentPriceSummary>()
      for (const item of result || []) {
        map.set(item.component_name, item)
      }
      priceSummaryCache = map
      setData(map)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (priceSummaryCache) {
      setData(priceSummaryCache)
      setLoading(false)
      return
    }

    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

export function getComponentPriceFromCache(componentName: string): ComponentPriceSummary | undefined {
  return priceSummaryCache?.get(componentName)
}
