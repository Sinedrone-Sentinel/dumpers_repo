import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PersonalStockAddPanel from '../components/PersonalStockAddPanel'
import ResourceStockListView from '../components/ResourceStockListView'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { DEFAULT_STOCK_QUALITY } from '../config/dfp'
import {
  resourceLabelClassName,
  resourceQuantityUnitLabel,
} from '../config/resourceTypes'
import { SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { canUseFeature } from '../lib/featureAccess'
import { setAnalyticsSubTool } from '../lib/analytics'
import { inventoryLineKey } from '../lib/inventoryStock'
import {
  type GuestResourceEntry,
  ensureGuestCacheSchema,
  readGuestResources,
  writeGuestResources,
} from '../lib/localGuestCache'
import { formatInventoryQualityLabel } from '../lib/qualityBands'
import { adjustInventoryQuantity, setInventoryQuantity, updateInventoryNote } from '../lib/operations'
import type { InventoryScope } from '../lib/operations'
import ResourceQuantityInput from '../components/ResourceQuantityInput'
import {
  addResourceQuantities,
  adjustStepsForResource,
  formatQuantityForResource,
  formatResourceQuantity,
  parseQuantityForResource,
} from '../lib/resourceQuantity'

export default function ResourceTrackerRoute() {
  const { user, visibilityContext, isSuperAdmin, isGuestPreview } = useAuth()
  const isGuest = !user && isGuestPreview
  const canViewSiteTotal = !isGuest && canUseFeature('site_total', visibilityContext)

  const [activeTab, setActiveTab] = useState<InventoryScope>('personal')
  const [stockError, setStockError] = useState<string | null>(null)
  const [guestResources, setGuestResources] = useState<GuestResourceEntry[]>([])

  useEffect(() => {
    if (isGuest && activeTab === 'site') setActiveTab('personal')
  }, [isGuest, activeTab])

  useEffect(() => {
    setAnalyticsSubTool(activeTab === 'site' ? 'site_total' : 'my_resources')
  }, [activeTab])

  // Load guest resources from localStorage on mount / guest enter
  useEffect(() => {
    if (isGuest) {
      ensureGuestCacheSchema()
      setGuestResources(readGuestResources())
    }
  }, [isGuest])

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [qualityFilter, setQualityFilter] = useState<string>('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')

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
    loading,
    error,
    refresh,
  } = useResourceCatalog({
    includeInactive: showInactive,
    withInventory: !isGuest,
    inventoryContext,
  })

  // Build stock cards: guests mirror logged-in — one card per (resource_key, quality) row
  const stockCards = useMemo(() => {
    if (!isGuest) return catalogWithInventory

    const catalogByKey = new Map(catalog.map((c) => [c.resource_key, c]))

    return guestResources
      .filter((row) => row.quantity > 0)
      .map((row) => {
        const catalogEntry = catalogByKey.get(row.resource_key)
        return {
          resource_key: row.resource_key,
          label: catalogEntry?.label ?? row.resource_key,
          is_active: catalogEntry?.is_active ?? true,
          synced_at: catalogEntry?.synced_at ?? '',
          quantity: row.quantity,
          quality: row.quality,
          note: null,
        }
      })
      .sort((a, b) => {
        const labelCmp = a.label.localeCompare(b.label)
        if (labelCmp !== 0) return labelCmp
        return a.quality - b.quality
      })
  }, [isGuest, catalog, catalogWithInventory, guestResources])

  const existingLineKeys = useMemo(() => {
    if (isGuest) {
      return new Set(guestResources.map((r) => inventoryLineKey(r.resource_key, r.quality)))
    }
    return new Set(personalLineKeys)
  }, [isGuest, guestResources, personalLineKeys])

  const qualityFilterOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const card of stockCards) {
      const q = card.quality ?? DEFAULT_STOCK_QUALITY
      if (!seen.has(q)) {
        seen.set(q, formatInventoryQualityLabel(card.resource_key, q))
      }
    }
    return [...seen.entries()].sort((a, b) => a[0] - b[0])
  }, [stockCards])

  const filteredCards = stockCards.filter((card) => {
    const quality = card.quality ?? DEFAULT_STOCK_QUALITY
    const matchesSearch =
      search === '' ||
      card.label.toLowerCase().includes(search.toLowerCase()) ||
      card.resource_key.toLowerCase().includes(search.toLowerCase()) ||
      (card.quality != null && `q${card.quality}`.includes(search.toLowerCase()))
    const matchesActive = showInactive || card.is_active
    const matchesQuality =
      qualityFilter === '' || quality === Number(qualityFilter)
    return matchesSearch && matchesActive && matchesQuality
  })

  const cardCount = stockCards.length
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

  const handleSaveNote = async (resourceKey: string, quality: number) => {
    if (readOnly || isGuest) return
    if (!user?.id) return

    const result = await updateInventoryNote({
      userId: user.id,
      resourceKey,
      quality,
      note: noteValue.trim() || null,
    })

    if (result.error) {
      setStockError(result.error)
      return
    }

    setEditingNoteKey(null)
    setNoteValue('')
    setStockError(null)
    await refresh()
  }

  // Guest add resource handler — adds to existing card quantity like logged-in flow
  const handleGuestAddResource = useCallback(
    (resourceKey: string, quality: number, quantity: number) => {
      const existing = guestResources.find(
        (r) => r.resource_key === resourceKey && r.quality === quality
      )
      const newQty = addResourceQuantities(existing?.quantity ?? 0, quantity)
      updateGuestResource(resourceKey, quality, newQty)
      setStockError(null)
    },
    [guestResources, updateGuestResource]
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
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors site-btn-shimmer ${
            activeTab === 'personal'
              ? 'site-filter-selected-red shadow-lg shadow-red-500/10'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          My Resources
        </button>
        {canViewSiteTotal && (
          <button
            type="button"
            onClick={() => setActiveTab('site')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors site-btn-shimmer ${
              activeTab === 'site'
                ? 'site-filter-selected-purple shadow-lg shadow-purple-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Site Total
          </button>
        )}
      </div>

      <div className="mb-6 min-h-[11.5rem] w-full min-w-0">
        {isPersonalTab && (user?.id || isGuest) ? (
          user?.id ? (
            <PersonalStockAddPanel
              userId={user.id}
              catalog={catalog}
              labelMap={labelMap}
              existingKeys={existingLineKeys}
              onAdded={() => void refresh()}
              onError={setStockError}
            />
          ) : (
            <PersonalStockAddPanel
              catalog={catalog}
              labelMap={labelMap}
              existingKeys={existingLineKeys}
              onAdd={handleGuestAddResource}
              onError={setStockError}
            />
          )
        ) : readOnly ? (
          <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-400 text-sm">
            Site Total is a read-only rollup — summed from every approved member&apos;s My
            Resources (excluding banned accounts). Update your own quantities under My
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 w-full min-w-0">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">{tabLabel}</p>
          <p className="text-2xl font-bold text-white mt-1">{cardCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Total SCU</p>
          <p className="text-2xl font-bold text-purple-400 mt-1 tabular-nums">
            {formatResourceQuantity(totalQty)}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="flex rounded-lg border border-slate-600 overflow-hidden shrink-0 w-fit">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-2 text-sm font-medium transition-colors site-btn-shimmer ${
              viewMode === 'cards'
                ? 'site-filter-selected-red'
                : 'bg-slate-900/70 text-slate-400 hover:text-white'
            }`}
          >
            Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-2 text-sm font-medium transition-colors border-l border-slate-600 site-btn-shimmer ${
              viewMode === 'list'
                ? 'site-filter-selected-red'
                : 'bg-slate-900/70 text-slate-400 hover:text-white'
            }`}
          >
            List
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            isPersonalTab ? 'Search your stock cards...' : 'Search site totals...'
          }
          className="flex-1 px-3 py-2 bg-slate-900/70 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
        />
        {qualityFilterOptions.length > 0 && (
          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900/70 border border-slate-600 rounded-lg text-white text-sm min-w-[10rem]"
            aria-label="Filter by quality"
          >
            <option value="">All qualities</option>
            {qualityFilterOptions.map(([q, label]) => (
              <option key={q} value={q}>
                {label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 px-3 py-2 bg-slate-900/70 border border-slate-600 rounded-lg text-slate-300 text-sm cursor-pointer shrink-0">
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
            {isPersonalTab ? (
              <>
                No stock cards yet. Use <span className="text-slate-300 font-medium">Add Material Stock</span> above to create your first Q-tier entry.{' '}
                <a
                  href="/archive#page-guides"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 underline"
                >
                  Learn more in the Archive
                </a>
              </>
            ) : (
              'No site-wide stock recorded yet.'
            )}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <ResourceStockListView cards={filteredCards} isPersonalTab={isPersonalTab} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full min-w-0">
          {filteredCards.map((card) => {
            const quality = card.quality ?? DEFAULT_STOCK_QUALITY
            const qualityLabel = formatInventoryQualityLabel(card.resource_key, quality)
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
                          ? `${qualityLabel} · ${qtyUnit} on hand`
                          : `${qtyUnit} site-wide total`
                        : 'Retired — no longer in blueprints'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isPersonalTab && (
                      <span className="px-2 py-0.5 rounded text-xs border font-medium bg-amber-950/40 text-amber-200 border-amber-500/30">
                        {qualityLabel}
                      </span>
                    )}
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

                {isPersonalTab && !isGuest && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    {editingNoteKey === lineKey ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={noteValue}
                          onChange={(e) => setNoteValue(e.target.value.slice(0, 64))}
                          placeholder="Add note (64 chars max)"
                          maxLength={64}
                          className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-xs placeholder-slate-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void handleSaveNote(card.resource_key, quality)
                            } else if (e.key === 'Escape') {
                              setEditingNoteKey(null)
                              setNoteValue('')
                            }
                          }}
                        />
                        <button
                          onClick={() => void handleSaveNote(card.resource_key, quality)}
                          className="px-2 py-1 text-xs bg-green-900/50 text-green-300 border border-green-500/30 rounded shrink-0"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingNoteKey(null)
                            setNoteValue('')
                          }}
                          className="px-2 py-1 text-xs text-slate-400 shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingNoteKey(lineKey)
                          setNoteValue(card.note ?? '')
                        }}
                        className="w-full text-left text-xs"
                        disabled={readOnly}
                      >
                        {card.note ? (
                          <span className="text-slate-400 italic">"{card.note}"</span>
                        ) : (
                          <span className="text-slate-600 hover:text-slate-400">
                            + Add note
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}
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

      </div>
    </FeaturePageLayout>
  )
}
