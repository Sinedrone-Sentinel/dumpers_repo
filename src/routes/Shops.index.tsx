import React, { useEffect, useMemo, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { useAuth } from '../contexts/AuthContext'
import {
  useShopSystems,
  useShopLocations,
  useShopsAtLocation,
  useShopById,
  useShopInventory,
  useShopInventoryTypes,
  type Shop,
  type ShopInventoryItem,
} from '../hooks/useShopData'
import { useBlueprintLookup } from '../hooks/useBlueprintLookup'
import GuestPreviewBanner from '../components/layout/GuestPreviewBanner'

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—'
  return price.toLocaleString() + ' aUEC'
}

function LocationTypeBadge({ type }: { type: string | null }) {
  if (!type) return null

  const colors: Record<string, string> = {
    city: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rest_stop: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    orbital: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    refinery: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    prison: 'bg-red-500/20 text-red-300 border-red-500/30',
    dealership: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    unknown: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  }

  const labels: Record<string, string> = {
    city: 'City',
    rest_stop: 'Rest Stop',
    orbital: 'Orbital',
    refinery: 'Refinery',
    prison: 'Prison',
    dealership: 'Dealership',
    unknown: 'Unknown',
  }

  const colorClass = colors[type] || colors.unknown
  const label = labels[type] || type

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colorClass}`}>
      {label}
    </span>
  )
}

function TransactionBadges({ item }: { item: ShopInventoryItem }) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {item.shop_sells && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">
          Sells
        </span>
      )}
      {item.shop_buys && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
          Buys
        </span>
      )}
      {item.shop_rents && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
          Rents
        </span>
      )}
    </div>
  )
}

export default function ShopsRoute() {
  const { isGuestPreview, exitGuestPreview, acquiredBlueprints } = useAuth()
  const search = useSearch({ from: '/shops' })
  const { getBlueprintByItemName } = useBlueprintLookup()

  const [selectedSystem, setSelectedSystem] = useState<string | null>('Stanton')
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<string | null>(null)
  const [inventorySearch, setInventorySearch] = useState('')
  const [sellsOnlyFilter, setSellsOnlyFilter] = useState(false)

  const { data: systems, loading: systemsLoading } = useShopSystems()
  const { data: locations, loading: locationsLoading } = useShopLocations(selectedSystem)
  const { data: shops, loading: shopsLoading } = useShopsAtLocation(selectedSystem, selectedLocation)
  const { data: shopDetails, loading: shopLoading } = useShopById(selectedShopId)
  const { data: inventory, loading: inventoryLoading } = useShopInventory(
    selectedShopId,
    inventoryTypeFilter,
    inventorySearch.length >= 2 ? inventorySearch : null,
    sellsOnlyFilter
  )
  const { data: inventoryTypes } = useShopInventoryTypes()

  // Deep link handling - if ?shop=123 is in URL, select that shop
  useEffect(() => {
    const shopIdParam = (search as { shop?: string }).shop
    if (shopIdParam) {
      const id = parseInt(shopIdParam, 10)
      if (!isNaN(id)) {
        setSelectedShopId(id)
      }
    }
  }, [search])

  // When shop details load from deep link, set the system/location to match
  useEffect(() => {
    if (shopDetails && !selectedLocation) {
      setSelectedSystem(shopDetails.system)
      setSelectedLocation(shopDetails.location)
    }
  }, [shopDetails, selectedLocation])

  const handleSystemChange = (system: string) => {
    setSelectedSystem(system)
    setSelectedLocation(null)
    setSelectedShopId(null)
  }

  const handleLocationChange = (location: string | null) => {
    setSelectedLocation(location)
    setSelectedShopId(null)
  }

  const handleShopSelect = (shop: Shop) => {
    setSelectedShopId(shop.id)
  }

  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      const typeOrder: Record<string, number> = {
        city: 0,
        orbital: 1,
        rest_stop: 2,
        refinery: 3,
        dealership: 4,
        prison: 5,
        unknown: 6,
      }
      const aOrder = typeOrder[a.location_type || 'unknown'] ?? 6
      const bOrder = typeOrder[b.location_type || 'unknown'] ?? 6
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.location.localeCompare(b.location)
    })
  }, [locations])

  const isEmpty = systems.length === 0 && !systemsLoading

  return (
    <FeaturePageLayout
      title="Shops"
      subtitle="Browse in-game shop inventories and prices"
    >
      {isGuestPreview && <GuestPreviewBanner onExit={exitGuestPreview} />}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No shop data available</h3>
          <p className="text-sm text-slate-400 max-w-md">
            Shop data hasn't been synced yet. A super-admin needs to run the Shop Data sync from the DB Actions panel.
          </p>
        </div>
      ) : (
        <div className="flex gap-6 min-h-[600px]">
          {/* Left sidebar - filters and shop list */}
          <div className="w-64 shrink-0 space-y-4">
            {/* System dropdown */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">System</label>
              <select
                value={selectedSystem || ''}
                onChange={(e) => handleSystemChange(e.target.value)}
                className="site-input w-full px-3 py-2 text-sm"
                disabled={systemsLoading}
              >
                {systems.map((s) => (
                  <option key={s.system} value={s.system}>
                    {s.system} ({s.shop_count})
                  </option>
                ))}
              </select>
            </div>

            {/* Location dropdown */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Location</label>
              <select
                value={selectedLocation || ''}
                onChange={(e) => handleLocationChange(e.target.value || null)}
                className="site-input w-full px-3 py-2 text-sm"
                disabled={locationsLoading || !selectedSystem}
              >
                <option value="">All Locations</option>
                {sortedLocations.map((l) => (
                  <option key={l.location} value={l.location}>
                    {l.location} ({l.shop_count})
                  </option>
                ))}
              </select>
            </div>

            {/* Shop list */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Shops {shops.length > 0 && `(${shops.length})`}
              </label>
              <div className="border border-slate-700/50 rounded-lg bg-slate-800/30 max-h-[400px] overflow-y-auto">
                {shopsLoading ? (
                  <div className="p-4 text-center text-sm text-slate-500">Loading...</div>
                ) : shops.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">
                    {selectedSystem ? 'No shops found' : 'Select a system'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/50">
                    {shops.map((shop) => (
                      <button
                        key={shop.id}
                        onClick={() => handleShopSelect(shop)}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-700/30 transition-colors ${
                          selectedShopId === shop.id ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''
                        }`}
                      >
                        <div className="text-sm text-white truncate">{shop.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <LocationTypeBadge type={shop.location_type} />
                          {shop.accepts_stolen_goods && (
                            <span className="text-[10px] text-red-400">Stolen OK</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main content - shop details and inventory */}
          <div className="flex-1 min-w-0">
            {!selectedShopId ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <svg className="w-12 h-12 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-slate-400">Select a shop to view inventory</p>
              </div>
            ) : shopLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : shopDetails ? (
              <div className="space-y-4">
                {/* Shop header */}
                <div className="p-4 rounded-xl border border-slate-700/50 bg-slate-800/30">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{shopDetails.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-slate-400">{shopDetails.system}</span>
                        {shopDetails.location && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-sm text-slate-400">{shopDetails.location}</span>
                          </>
                        )}
                        <LocationTypeBadge type={shopDetails.location_type} />
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {shopDetails.accepts_stolen_goods && (
                        <div className="text-red-400 text-xs">Accepts stolen goods</div>
                      )}
                      {shopDetails.profit_margin > 0 && (
                        <div className="text-slate-500 text-xs">
                          Markup: {shopDetails.profit_margin}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inventory filters */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      className="site-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                  <select
                    value={inventoryTypeFilter || ''}
                    onChange={(e) => setInventoryTypeFilter(e.target.value || null)}
                    className="site-input px-3 py-2 text-sm"
                  >
                    <option value="">All Types</option>
                    {inventoryTypes.map((t) => (
                      <option key={t.item_type} value={t.item_type}>
                        {t.item_type} ({t.item_count})
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sellsOnlyFilter}
                      onChange={(e) => setSellsOnlyFilter(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500"
                    />
                    Sells only
                  </label>
                </div>

                {/* Inventory list */}
                <div className="border border-slate-700/50 rounded-xl bg-slate-800/20 overflow-hidden">
                  {inventoryLoading ? (
                    <div className="p-8 text-center text-slate-500">Loading inventory...</div>
                  ) : inventory.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      {inventorySearch.length >= 2 || inventoryTypeFilter
                        ? 'No items match your filters'
                        : 'No inventory data'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700/30">
                      <div className="grid grid-cols-[1fr,120px,140px,100px] gap-4 px-4 py-2 bg-slate-800/50 text-xs text-slate-500 font-medium uppercase tracking-wider">
                        <div>Item</div>
                        <div className="text-right">Price</div>
                        <div className="text-center">Type</div>
                        <div className="text-center">Trade</div>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto">
                        {inventory.map((item) => {
                          const itemName = item.display_name || item.item_name
                          const blueprint = getBlueprintByItemName(itemName)
                          const isAcquired = blueprint ? acquiredBlueprints[blueprint.internalName] : false

                          return (
                            <div
                              key={item.id}
                              className="grid grid-cols-[1fr,120px,140px,100px] gap-4 px-4 py-3 hover:bg-slate-700/20 items-center"
                            >
                              <div>
                                <div className="text-sm text-white">
                                  {itemName}
                                </div>
                                {blueprint && (
                                  <span
                                    className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
                                      isAcquired
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                        : 'bg-red-500/20 text-red-300 border-red-500/30'
                                    }`}
                                    title={isAcquired ? 'Blueprint acquired' : 'Blueprint not acquired'}
                                  >
                                    {isAcquired ? 'BP Acquired' : 'BP Not Acquired'}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-amber-400 font-medium">
                                  {formatPrice(item.effective_price)}
                                </div>
                                {item.effective_price !== item.base_price && (
                                  <div className="text-xs text-slate-600">
                                    Base: {formatPrice(item.base_price)}
                                  </div>
                                )}
                              </div>
                              <div className="text-center">
                                {item.item_type && (
                                  <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                                    {item.item_type}
                                  </span>
                                )}
                              </div>
                              <div className="text-center">
                                <TransactionBadges item={item} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {inventory.length > 0 && (
                  <div className="text-xs text-slate-500 text-right">
                    Showing {inventory.length} items
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Shop not found
              </div>
            )}
          </div>
        </div>
      )}
    </FeaturePageLayout>
  )
}
