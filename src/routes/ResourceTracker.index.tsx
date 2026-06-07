import React, { useMemo, useState } from 'react'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { useAuth } from '../contexts/AuthContext'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { canManageOrgInventory, canUseFeature } from '../lib/featureAccess'
import { adjustInventoryQuantity, setInventoryQuantity, type InventoryScope } from '../lib/operations'

export default function ResourceTrackerRoute() {
  const { user, profile, organization, visibilityContext } = useAuth()
  const canViewOrg = canUseFeature('org_resources', visibilityContext)
  const canEditOrg = canManageOrgInventory(visibilityContext)

  const defaultTab: InventoryScope =
    profile?.org_only_mode && canViewOrg ? 'org' : 'personal'

  const [activeTab, setActiveTab] = useState<InventoryScope>(defaultTab)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const inventoryContext = useMemo(() => {
    if (!user?.id) return null
    return {
      scope: activeTab,
      userId: user.id,
      orgId: profile?.org_id ?? null,
    }
  }, [user?.id, profile?.org_id, activeTab])

  const readOnly = activeTab === 'org' && !canEditOrg

  const {
    catalogWithInventory,
    syncResult,
    loading,
    error,
    refresh,
  } = useResourceCatalog({
    syncOnLoad: true,
    includeInactive: showInactive,
    withInventory: true,
    inventoryContext,
  })

  const filteredResources = catalogWithInventory.filter((resource) => {
    const matchesSearch =
      search === '' ||
      resource.label.toLowerCase().includes(search.toLowerCase()) ||
      resource.resource_key.toLowerCase().includes(search.toLowerCase())
    const matchesActive = showInactive || resource.is_active
    return matchesSearch && matchesActive
  })

  const activeCount = catalogWithInventory.filter((r) => r.is_active).length
  const inStockCount = catalogWithInventory.filter((r) => r.is_active && r.quantity > 0).length
  const totalQty = catalogWithInventory
    .filter((r) => r.is_active)
    .reduce((sum, r) => sum + r.quantity, 0)

  const handleAdjust = async (resourceKey: string, delta: number) => {
    if (!inventoryContext || readOnly) return
    const result = await adjustInventoryQuantity(inventoryContext, resourceKey, delta)
    if (result.error) return
    await refresh()
  }

  const handleSaveEdit = async (resourceKey: string) => {
    if (!inventoryContext || readOnly) return
    const qty = Number(editValue)
    if (Number.isNaN(qty) || qty < 0) return

    const result = await setInventoryQuantity(inventoryContext, resourceKey, qty)
    if (result.error) return

    setEditingKey(null)
    setEditValue('')
    await refresh()
  }

  const tabLabel = activeTab === 'personal' ? 'My Resources' : 'Org Resources'

  return (
    <FeaturePageLayout
      title="Resource Tracker"
      subtitle={
        activeTab === 'personal'
          ? 'Your personal crafting material inventory'
          : `${organization?.name ?? 'Organization'} shared stock`
      }
      actions={
        <button
          onClick={() => void refresh()}
          className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg transition-colors"
        >
          Sync & refresh
        </button>
      }
    >
      {profile?.org_id && !visibilityContext.orgVerified && (
        <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-200 text-sm">
          Org stock unlocks after an officer verifies your organization membership. You can still
          track <strong className="text-amber-100">My Resources</strong> below. Join or change org in
          Settings.
        </div>
      )}

      {canViewOrg && (
        <div className="flex gap-2 mb-6 p-1 bg-slate-900/60 border border-slate-700 rounded-xl w-fit">
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
          <button
            type="button"
            onClick={() => setActiveTab('org')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'org'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Org Resources
          </button>
        </div>
      )}

      {readOnly && (
        <div className="mb-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-400 text-sm">
          Org inventory is read-only for members. Org officers and site officers can update stock.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {error}
          {error.includes('relation') && (
            <p className="mt-2 text-red-200/80">
              Run <code className="text-red-100">013_resource_inventory_v2.sql</code> then{' '}
              <code className="text-red-100">014_fulfill_org_inventory.sql</code> in Supabase first.
            </p>
          )}
        </div>
      )}

      {syncResult && (
        <div className="mb-4 p-3 rounded-lg bg-purple-900/20 border border-purple-500/30 text-purple-200 text-sm">
          Catalog synced from blueprints: {syncResult.totalActive} active
          {syncResult.added > 0 && ` · ${syncResult.added} new`}
          {syncResult.reactivated > 0 && ` · ${syncResult.reactivated} reactivated`}
          {syncResult.deactivated > 0 && ` · ${syncResult.deactivated} retired`}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">{tabLabel} · types</p>
          <p className="text-2xl font-bold text-white mt-1">{activeCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">In stock (types)</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{inStockCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Total quantity</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{totalQty.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search resources..."
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
          <p className="text-slate-400 mt-4">Syncing resources from blueprints...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredResources.map((resource) => {
            const isEditing = editingKey === resource.resource_key

            return (
              <div
                key={resource.resource_key}
                className={`bg-gradient-to-br from-slate-900 to-slate-800 border rounded-xl p-4 ${
                  resource.is_active ? 'border-slate-700' : 'border-slate-800 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-white font-medium">{resource.label}</h3>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {resource.is_active ? 'From blueprints' : 'Retired — no longer in blueprints'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs border ${
                      resource.quantity > 0
                        ? 'bg-green-950/50 text-green-400 border-green-500/30'
                        : 'bg-slate-800 text-slate-500 border-slate-600'
                    }`}
                  >
                    {resource.quantity > 0 ? 'In stock' : 'Empty'}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {isEditing && !readOnly ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                      />
                      <button
                        onClick={() => void handleSaveEdit(resource.resource_key)}
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
                        {resource.quantity}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => {
                            setEditingKey(resource.resource_key)
                            setEditValue(String(resource.quantity))
                          }}
                          className="text-xs text-slate-400 hover:text-white ml-1"
                        >
                          Set
                        </button>
                      )}
                    </>
                  )}
                </div>

                {resource.is_active && !readOnly && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void handleAdjust(resource.resource_key, -1)}
                      className="flex-1 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg"
                    >
                      −1
                    </button>
                    <button
                      onClick={() => void handleAdjust(resource.resource_key, 1)}
                      className="flex-1 py-1.5 text-sm bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/30 rounded-lg"
                    >
                      +1
                    </button>
                    <button
                      onClick={() => void handleAdjust(resource.resource_key, 10)}
                      className="flex-1 py-1.5 text-sm bg-purple-950/50 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 rounded-lg"
                    >
                      +10
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-slate-500 text-xs mt-6">
        Resources are extracted automatically from <code>Blueprints.json</code> on sync. Update the
        blueprint file and click Sync & refresh to pick up new requirements.
      </p>
    </FeaturePageLayout>
  )
}
