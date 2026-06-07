import React, { useEffect, useMemo, useState } from 'react'
import PersonalStockAddPanel from '../components/PersonalStockAddPanel'
import ResourceBuyOrderPanel from '../components/ResourceBuyOrderPanel'
import { useBlueprintData } from './blueprints'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { isSalvageResource } from '../config/extraResources'
import { DEFAULT_STOCK_QUALITY } from '../config/dfp'
import { SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { canUseFeature } from '../lib/featureAccess'
import { inventoryLineKey } from '../lib/inventoryStock'
import { adjustInventoryQuantity, setInventoryQuantity } from '../lib/operations'
import type { InventoryScope } from '../lib/operations'
import {
  formatResourceQuantity,
  parseResourceQuantity,
  RESOURCE_QUANTITY_STEP,
  roundResourceQuantity,
} from '../lib/resourceQuantity'

type TrackerTab = InventoryScope | 'place-order'

const ADJUST_STEPS = [0.001, 0.01, 0.1, 1] as const

export default function ResourceTrackerRoute() {
  const { user, siteOrg, visibilityContext, isSuperAdmin, isGhostMode } = useAuth()
  const canViewOrgTotal =
    !isGhostMode && canUseFeature('org_resources', visibilityContext)

  const [activeTab, setActiveTab] = useState<TrackerTab>('personal')
  const [orderError, setOrderError] = useState<string | null>(null)
  const [stockError, setStockError] = useState<string | null>(null)
  const { data: blueprints = [] } = useBlueprintData()

  useEffect(() => {
    if (isGhostMode && activeTab === 'org') setActiveTab('personal')
  }, [isGhostMode, activeTab])

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const inventoryScope: InventoryScope =
    activeTab === 'org' ? 'org' : 'personal'

  const inventoryContext = useMemo(() => {
    if (!user?.id) return null
    return {
      scope: inventoryScope,
      userId: user.id,
      orgId: siteOrg?.id ?? null,
    }
  }, [user?.id, siteOrg?.id, inventoryScope])

  const readOnly = activeTab === 'org'
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
    syncFromBlueprints,
  } = useResourceCatalog({
    enableCatalogSync: isSuperAdmin,
    includeInactive: showInactive,
    withInventory: activeTab !== 'place-order',
    inventoryContext: activeTab === 'place-order' ? null : inventoryContext,
  })

  const stockCards = catalogWithInventory

  const existingLineKeys = useMemo(() => new Set(personalLineKeys), [personalLineKeys])

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
  const totalQty = roundResourceQuantity(
    stockCards.reduce((sum, c) => sum + c.quantity, 0)
  )

  const handleAdjust = async (resourceKey: string, quality: number, delta: number) => {
    if (!inventoryContext || readOnly) return
    const result = await adjustInventoryQuantity(inventoryContext, resourceKey, quality, delta)
    if (result.error) {
      setStockError(result.error)
      return
    }
    setStockError(null)
    await refresh()
  }

  const handleSaveEdit = async (resourceKey: string, quality: number) => {
    if (!inventoryContext || readOnly) return
    const qty = parseResourceQuantity(editValue)
    if (qty == null) return

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

  const tabLabel =
    activeTab === 'personal'
      ? 'My stock cards'
      : activeTab === 'org'
        ? 'Org Total'
        : 'Place order'

  const isInventoryTab = activeTab === 'personal' || activeTab === 'org'

  return (
    <FeaturePageLayout
      title="Resource Tracker"
      subtitle={SITE_SLOGAN}
      actions={
        isSuperAdmin && isInventoryTab ? (
          <button
            onClick={() => void syncFromBlueprints()}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg transition-colors"
          >
            Sync from blueprints
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-900/60 border border-slate-700 rounded-xl w-fit">
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
        {canViewOrgTotal && (
          <button
            type="button"
            onClick={() => setActiveTab('org')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'org'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Org Total
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('place-order')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'place-order'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Place order
        </button>
      </div>

      {readOnly && (
        <div className="mb-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-400 text-sm">
          Org Total is a read-only aggregate ledger — summed from every approved member&apos;s My
          Resources. Update your own quantities under My Resources.
        </div>
      )}

      {(error || stockError) && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {stockError ?? error}
          {(stockError ?? error)?.includes('relation') && (
            <p className="mt-2 text-red-200/80">
              Run pending Supabase migrations (030 for quality-tier stock) first.
            </p>
          )}
        </div>
      )}

      {isSuperAdmin && syncResult && isInventoryTab && (
        <div className="mb-4 p-3 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-200 text-sm">
          Catalog synced from blueprints: {syncResult.totalActive} active
          {syncResult.added > 0 && ` · ${syncResult.added} new`}
          {syncResult.reactivated > 0 && ` · ${syncResult.reactivated} reactivated`}
          {syncResult.deactivated > 0 && ` · ${syncResult.deactivated} deactivated`}
        </div>
      )}

      {orderError && activeTab === 'place-order' && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {orderError}
        </div>
      )}

      {activeTab === 'place-order' ? (
        user?.id ? (
          <ResourceBuyOrderPanel
            userId={user.id}
            blueprints={blueprints}
            catalog={catalog}
            labelMap={labelMap}
            onError={setOrderError}
            onSubmitted={() => {
              setOrderError(null)
              setActiveTab('personal')
            }}
          />
        ) : null
      ) : (
        <>
          {isPersonalTab && user?.id && (
            <PersonalStockAddPanel
              userId={user.id}
              orgId={siteOrg?.id ?? null}
              catalog={catalog}
              labelMap={labelMap}
              existingKeys={existingLineKeys}
              onAdded={() => void refresh()}
              onError={setStockError}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
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
                isPersonalTab ? 'Search your stock cards...' : 'Search org totals...'
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

          {loading ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 mt-4">Loading resources...</p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
              <p className="text-slate-400">
                {isPersonalTab
                  ? 'No stock cards yet. Use Add material stock above to create your first Q-tier entry.'
                  : 'No org-wide stock recorded yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredCards.map((card) => {
                const quality = card.quality ?? DEFAULT_STOCK_QUALITY
                const isSalvage = isSalvageResource(card.resource_key)
                const lineKey = inventoryLineKey(card.resource_key, quality)
                const isEditing = editingKey === lineKey

                return (
                  <div
                    key={lineKey}
                    className={`bg-gradient-to-br from-slate-900 to-slate-800 border rounded-xl p-4 ${
                      card.is_active ? 'border-slate-700' : 'border-slate-800 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-white font-medium">{card.label}</h3>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {card.is_active
                            ? isPersonalTab
                              ? `Q${quality} · SCU on hand`
                              : 'SCU org-wide total'
                            : 'Retired — no longer in blueprints'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isPersonalTab && (
                          <span className="px-2 py-0.5 rounded text-xs border bg-amber-950/40 text-amber-200 border-amber-500/30 font-medium">
                            {isSalvage ? 'Q0 (salvage)' : `Q${quality}`}
                          </span>
                        )}
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
                          <input
                            type="number"
                            min="0"
                            step={RESOURCE_QUANTITY_STEP}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-28 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm tabular-nums"
                          />
                          <span className="text-slate-500 text-xs">SCU</span>
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
                            {formatResourceQuantity(card.quantity)}
                          </span>
                          <span className="text-slate-500 text-sm">SCU</span>
                          {!readOnly && (
                            <button
                              onClick={() => {
                                setEditingKey(lineKey)
                                setEditValue(formatResourceQuantity(card.quantity))
                              }}
                              className="text-xs text-slate-400 hover:text-white ml-1"
                            >
                              Set
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {card.is_active && !readOnly && (
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {ADJUST_STEPS.map((step) => (
                          <div key={step} className="flex gap-1">
                            <button
                              onClick={() =>
                                void handleAdjust(card.resource_key, quality, -step)
                              }
                              className="flex-1 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded"
                            >
                              −{step}
                            </button>
                            <button
                              onClick={() =>
                                void handleAdjust(card.resource_key, quality, step)
                              }
                              className="flex-1 py-1 text-xs bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/30 rounded"
                            >
                              +{step}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {isSuperAdmin && (
            <p className="text-slate-500 text-xs mt-6">
              Quantities are in SCU (3 decimal precision). Resource names come from{' '}
              <code>Blueprints.json</code> — use <strong className="text-slate-400">Sync from
              blueprints</strong> after catalog updates.
            </p>
          )}
        </>
      )}
    </FeaturePageLayout>
  )
}
