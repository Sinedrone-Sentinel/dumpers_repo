import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PersonalStockAddPanel from '../components/PersonalStockAddPanel'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { isSalvageResource } from '../config/extraResources'
import { DEFAULT_STOCK_QUALITY } from '../config/dfp'
import {
  isHarvestResource,
  resourceLabelClassName,
  resourceQuantityUnitLabel,
} from '../config/resourceTypes'
import { SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { canUseFeature } from '../lib/featureAccess'
import { inventoryLineKey } from '../lib/inventoryStock'
import {
  type GuestResourceEntry,
  readGuestResources,
  writeGuestResources,
} from '../lib/localGuestCache'
import { adjustInventoryQuantity, setInventoryQuantity } from '../lib/operations'
import type { InventoryScope } from '../lib/operations'
import ResourceQuantityInput from '../components/ResourceQuantityInput'
import {
  addResourceQuantities,
  adjustStepsForResource,
  formatQuantityForResource,
  formatResourceQuantity,
  parseQuantityForResource,
} from '../lib/resourceQuantity'
import type { BlueprintResourceRow } from '../lib/operations'

interface GuestStockAddPanelProps {
  catalog: BlueprintResourceRow[]
  labelMap: Record<string, string>
  existingKeys: Set<string>
  onAdd: (resourceKey: string, quality: number, quantity: number) => void
}

function GuestStockAddPanel({ catalog, labelMap, existingKeys, onAdd }: GuestStockAddPanelProps) {
  const [selectedResource, setSelectedResource] = useState('')
  const [quantity, setQuantity] = useState('')
  const [search, setSearch] = useState('')

  const quality = DEFAULT_STOCK_QUALITY

  const filteredCatalog = useMemo(() => {
    if (search.length < 2) return []
    const lowerSearch = search.toLowerCase()
    return catalog
      .filter(
        (c) =>
          c.is_active &&
          (c.label.toLowerCase().includes(lowerSearch) ||
            c.resource_key.toLowerCase().includes(lowerSearch))
      )
      .slice(0, 20)
  }, [catalog, search])

  const handleAdd = () => {
    if (!selectedResource) return
    const qty = parseQuantityForResource(selectedResource, quantity)
    if (qty == null || qty <= 0) return

    onAdd(selectedResource, quality, qty)
    setSelectedResource('')
    setQuantity('')
    setSearch('')
  }

  const selectedLabel = labelMap[selectedResource] ?? selectedResource

  return (
    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Add Material Stock</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          {!selectedResource ? (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search resources..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50"
              />
              {filteredCatalog.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredCatalog.map((c) => {
                    const lineKey = inventoryLineKey(c.resource_key, quality)
                    const alreadyExists = existingKeys.has(lineKey)
                    return (
                      <button
                        key={c.resource_key}
                        type="button"
                        disabled={alreadyExists}
                        onClick={() => {
                          setSelectedResource(c.resource_key)
                          setSearch('')
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${
                          alreadyExists
                            ? 'text-slate-500 cursor-not-allowed'
                            : 'text-white hover:bg-slate-700'
                        }`}
                      >
                        {c.label}
                        {alreadyExists && (
                          <span className="ml-2 text-xs text-slate-500">(already added)</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`text-sm ${resourceLabelClassName(selectedResource)}`}>
                {selectedLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectedResource('')}
                className="text-slate-400 hover:text-white text-xs"
              >
                (change)
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ResourceQuantityInput
            resourceKey={selectedResource}
            value={quantity}
            onValueChange={setQuantity}
            placeholder="Qty"
            className="w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50"
          />
          <span className="text-slate-500 text-sm">
            {resourceQuantityUnitLabel(selectedResource)}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedResource || !quantity}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-500 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ResourceTrackerRoute() {
  const { user, visibilityContext, isSuperAdmin, isGhostMode, isGuestPreview } = useAuth()
  const isGuest = !user && isGuestPreview
  const canViewSiteTotal =
    !isGhostMode && !isGuest && canUseFeature('site_total', visibilityContext)

  const [activeTab, setActiveTab] = useState<InventoryScope>('personal')
  const [stockError, setStockError] = useState<string | null>(null)
  const [guestResources, setGuestResources] = useState<GuestResourceEntry[]>([])

  useEffect(() => {
    if ((isGhostMode || isGuest) && activeTab === 'site') setActiveTab('personal')
  }, [isGhostMode, isGuest, activeTab])

  // Load guest resources from localStorage on mount / guest enter
  useEffect(() => {
    if (isGuest) {
      setGuestResources(readGuestResources())
    }
  }, [isGuest])

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const inventoryContext = useMemo(() => {
    if (isGuest || !user?.id) return null
    return {
      scope: activeTab,
      userId: user.id,
    }
  }, [isGuest, user?.id, activeTab])

  const readOnly = activeTab === 'site'
  const isPersonalTab = activeTab === 'personal'

  const {
    catalog,
    catalogWithInventory,
    personalLineKeys,
    labelMap,
    syncResult,
    loading,
    error,
    refresh,
  } = useResourceCatalog({
    enableCatalogSync: isSuperAdmin,
    includeInactive: showInactive,
    withInventory: !isGuest,
    inventoryContext,
  })

  // Build stock cards: for guests, merge catalog with localStorage resources
  const stockCards = useMemo(() => {
    if (!isGuest) return catalogWithInventory

    // For guests: merge catalog with their localStorage resources
    const guestQtyMap = new Map<string, GuestResourceEntry>()
    guestResources.forEach((r) => {
      guestQtyMap.set(`${r.resource_key}::${r.quality}`, r)
    })

    return catalog.map((c) => {
      const quality = DEFAULT_STOCK_QUALITY
      const entry = guestQtyMap.get(`${c.resource_key}::${quality}`)
      return {
        resource_key: c.resource_key,
        label: c.label,
        is_active: c.is_active,
        synced_at: c.synced_at,
        quantity: entry?.quantity ?? 0,
        quality,
      }
    })
  }, [isGuest, catalog, catalogWithInventory, guestResources])

  const existingLineKeys = useMemo(() => {
    if (isGuest) {
      return new Set(guestResources.map((r) => inventoryLineKey(r.resource_key, r.quality)))
    }
    return new Set(personalLineKeys)
  }, [isGuest, guestResources, personalLineKeys])

  const filteredCards = stockCards.filter((card) => {
    const matchesSearch =
      search === '' ||
      card.label.toLowerCase().includes(search.toLowerCase()) ||
      card.resource_key.toLowerCase().includes(search.toLowerCase()) ||
      (card.quality != null && `q${card.quality}`.includes(search.toLowerCase()))
    const matchesActive = showInactive || card.is_active
    return matchesSearch && matchesActive
  })

  const cardCount = stockCards.length
  const inStockCount = stockCards.filter((c) => c.quantity > 0).length
  const totalQty = stockCards.reduce(
    (sum, c) => addResourceQuantities(sum, c.quantity),
    0
  )

  // Guest localStorage helpers
  const updateGuestResource = useCallback(
    (resourceKey: string, quality: number, quantity: number) => {
      const updated = guestResources.filter(
        (r) => !(r.resource_key === resourceKey && r.quality === quality)
      )
      if (quantity > 0) {
        updated.push({ resource_key: resourceKey, quality, quantity })
      }
      setGuestResources(updated)
      writeGuestResources(updated)
    },
    [guestResources]
  )

  const handleAdjust = async (resourceKey: string, quality: number, delta: number) => {
    if (readOnly) return

    if (isGuest) {
      const existing = guestResources.find(
        (r) => r.resource_key === resourceKey && r.quality === quality
      )
      const currentQty = existing?.quantity ?? 0
      const newQty = Math.max(0, currentQty + delta)
      updateGuestResource(resourceKey, quality, newQty)
      setStockError(null)
      return
    }

    if (!inventoryContext) return
    const result = await adjustInventoryQuantity(inventoryContext, resourceKey, quality, delta)
    if (result.error) {
      setStockError(result.error)
      return
    }
    setStockError(null)
    await refresh()
  }

  const handleSaveEdit = async (resourceKey: string, quality: number) => {
    if (readOnly) return
    const qty = parseQuantityForResource(resourceKey, editValue)
    if (qty == null) return

    if (isGuest) {
      updateGuestResource(resourceKey, quality, qty)
      setEditingKey(null)
      setEditValue('')
      setStockError(null)
      return
    }

    if (!inventoryContext) return
    const result = await setInventoryQuantity(inventoryContext, resourceKey, quality, qty)
    if (result.error) {
      setStockError(result.error)
      return
    }

    setEditingKey(null)
    setEditValue('')
    setStockError(null)
    await refresh()
  }

  // Guest add resource handler
  const handleGuestAddResource = useCallback(
    (resourceKey: string, quality: number, quantity: number) => {
      updateGuestResource(resourceKey, quality, quantity)
    },
    [updateGuestResource]
  )

  const tabLabel = activeTab === 'personal' ? 'My stock cards' : 'Site Total'

  return (
    <FeaturePageLayout
      title="Resource Tracker"
      subtitle={SITE_SLOGAN}
    >
      {isGuest && (
        <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-200 text-sm">
          <strong className="text-amber-100">Offline Mode</strong> — Your resource inventory is saved locally in this browser.
          Sign in to sync it to your account.
        </div>
      )}

      <div className="w-full min-w-0 overflow-x-hidden">
      <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-900/60 border border-slate-700 rounded-xl w-fit max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'personal'
              ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          My Resources
        </button>
        {canViewSiteTotal && (
          <button
            type="button"
            onClick={() => setActiveTab('site')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'site'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Site Total
          </button>
        )}
      </div>

      <div className="mb-6 min-h-[11.5rem] w-full min-w-0">
        {isPersonalTab && user?.id ? (
          <PersonalStockAddPanel
            userId={user.id}
            catalog={catalog}
            labelMap={labelMap}
            existingKeys={existingLineKeys}
            onAdded={() => void refresh()}
            onError={setStockError}
          />
        ) : isPersonalTab && isGuest ? (
          <GuestStockAddPanel
            catalog={catalog}
            labelMap={labelMap}
            existingKeys={existingLineKeys}
            onAdd={handleGuestAddResource}
          />
        ) : readOnly ? (
          <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-400 text-sm">
            Site Total is a read-only rollup — summed from every approved member&apos;s My
            Resources (excluding ghost and banned accounts). Update your own quantities under My
            Resources.
          </div>
        ) : null}
      </div>

      {(error || stockError) && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {stockError ?? error}
          {(stockError ?? error)?.includes('get_site_total_inventory') && (
            <p className="mt-2 text-red-200/80">
              Run pending Supabase migrations (038 for site totals) first.
            </p>
          )}
        </div>
      )}

      {isSuperAdmin && syncResult && (
        <div className="mb-4 p-3 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-200 text-sm">
          Catalog synced from blueprints: {syncResult.totalActive} active
          {syncResult.added > 0 && ` · ${syncResult.added} new`}
          {syncResult.reactivated > 0 && ` · ${syncResult.reactivated} reactivated`}
          {syncResult.deactivated > 0 && ` · ${syncResult.deactivated} deactivated`}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 w-full min-w-0">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">{tabLabel}</p>
          <p className="text-2xl font-bold text-white mt-1">{cardCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">In stock</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{inStockCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Total SCU</p>
          <p className="text-2xl font-bold text-purple-400 mt-1 tabular-nums">
            {formatResourceQuantity(totalQty)}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            isPersonalTab ? 'Search your stock cards...' : 'Search site totals...'
          }
          className="flex-1 px-3 py-2 bg-slate-900/70 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
        />
        <label className="flex items-center gap-2 px-3 py-2 bg-slate-900/70 border border-slate-600 rounded-lg text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-500"
          />
          Show retired
        </label>
      </div>

      <div className="relative w-full min-w-0 min-h-[24rem]">
      {loading && stockCards.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading resources...</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
          <p className="text-slate-400">
            {isPersonalTab
              ? 'No stock cards yet. Use Add material stock above to create your first Q-tier entry.'
              : 'No site-wide stock recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full min-w-0">
          {filteredCards.map((card) => {
            const quality = card.quality ?? DEFAULT_STOCK_QUALITY
            const isSalvage = isSalvageResource(card.resource_key)
            const isHarvest = isHarvestResource(card.resource_key)
            const qtyUnit = resourceQuantityUnitLabel(card.resource_key)
            const adjustSteps = adjustStepsForResource(card.resource_key)
            const lineKey = inventoryLineKey(card.resource_key, quality)
            const isEditing = editingKey === lineKey

            return (
              <div
                key={lineKey}
                className={`min-w-0 bg-gradient-to-br from-slate-900 to-slate-800 border rounded-xl p-4 ${
                  card.is_active ? 'border-slate-700' : 'border-slate-800 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-medium truncate ${resourceLabelClassName(card.resource_key)}`}>
                      {card.label}
                    </h3>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {card.is_active
                        ? isPersonalTab
                          ? `${isSalvage ? 'Q0 (salvage)' : isHarvest ? 'Harvest' : `Q${quality}`} · ${qtyUnit} on hand`
                          : `${qtyUnit} site-wide total`
                        : 'Retired — no longer in blueprints'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-xs border font-medium ${
                        isPersonalTab
                          ? 'bg-amber-950/40 text-amber-200 border-amber-500/30'
                          : 'invisible border-transparent'
                      }`}
                      aria-hidden={!isPersonalTab}
                    >
                      {isSalvage ? 'Q0 (salvage)' : isHarvest ? 'Harvest' : `Q${quality}`}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs border ${
                        card.quantity > 0
                          ? 'bg-green-950/50 text-green-400 border-green-500/30'
                          : 'bg-slate-800 text-slate-500 border-slate-600'
                      }`}
                    >
                      {card.quantity > 0 ? 'In stock' : 'Empty'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {isEditing && !readOnly ? (
                    <>
                      <ResourceQuantityInput
                        resourceKey={card.resource_key}
                        value={editValue}
                        onValueChange={setEditValue}
                        className="w-28 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm tabular-nums"
                      />
                      <span className="text-slate-500 text-xs">{qtyUnit}</span>
                      <button
                        onClick={() => void handleSaveEdit(card.resource_key, quality)}
                        className="px-2 py-1 text-xs bg-green-900/50 text-green-300 border border-green-500/30 rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null)
                          setEditValue('')
                        }}
                        className="px-2 py-1 text-xs text-slate-400"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-white tabular-nums">
                        {formatQuantityForResource(card.resource_key, card.quantity)}
                      </span>
                      <span className="text-slate-500 text-sm">{qtyUnit}</span>
                      {!readOnly && (
                        <button
                          onClick={() => {
                            setEditingKey(lineKey)
                            setEditValue(formatQuantityForResource(card.resource_key, card.quantity))
                          }}
                          className="text-xs text-slate-400 hover:text-white ml-1"
                        >
                          Set
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-3 min-h-[6.75rem]">
                  {card.is_active && !readOnly && (
                    <div className="grid grid-cols-2 gap-1.5 min-w-0">
                      {adjustSteps.map((step) => (
                        <div key={step} className="flex gap-1 min-w-0">
                          <button
                            onClick={() =>
                              void handleAdjust(card.resource_key, quality, -step)
                            }
                            className="flex-1 min-w-0 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded tabular-nums"
                          >
                            −{step}
                          </button>
                          <button
                            onClick={() =>
                              void handleAdjust(card.resource_key, quality, step)
                            }
                            className="flex-1 min-w-0 py-1 text-xs bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/30 rounded tabular-nums"
                          >
                            +{step}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {loading && stockCards.length > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-slate-950/40 rounded-2xl"
          aria-busy="true"
        >
          <div className="w-10 h-10 border-t-2 border-b-2 border-red-500 rounded-full animate-spin" />
        </div>
      )}
      </div>

      {isSuperAdmin && (
        <p className="text-slate-500 text-xs mt-6">
          Quantities are in SCU (3 decimal precision). Resource names come from{' '}
          <code>Blueprints.json</code> — use <strong className="text-slate-400">Sync from
          blueprints</strong> after catalog updates.
        </p>
      )}
      </div>
    </FeaturePageLayout>
  )
}
