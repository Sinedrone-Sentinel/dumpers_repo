import { useMemo } from 'react'
import { resourceChipClassName } from '../config/resourceTypes'
import { slugifyResourceName } from '../lib/blueprintResources'
import { getBlueprintDisplayTags } from '../lib/blueprintTaxonomy'
import BlueprintCategoryTags from './BlueprintCategoryTags'
import { formatBlueprintSpecLine } from '../lib/blueprintSpec'
import { calculateBlueprintDfpWithParts, calculateBlueprintDfp, formatCraftDfpBreakdown, formatDfpLabel, isAmmoBlueprint } from '../lib/dfp'
import { buildDefaultSlotQualities } from '../lib/blueprintQuality'
import { isDefaultBlueprint } from '../lib/defaultBlueprints'
import { useDfpEngineReady } from '../hooks/useDfpEngineReady'

const BLUEPRINT_PAPER_PANEL = 'blueprint-paper-panel p-2.5'

export default function BlueprintCard({
  blueprint,
  onClick,
  isAcquired,
  onToggleAcquired,
  canModify = true,
  isPending = false,
  showTargetControl = false,
  showMissionsControl = false,
  showCraftTrackerControl = false,
  onAddToCraftTracker,
  craftTrackerPending = false,
  isOnTargetList = false,
  onToggleTarget,
  onOpenMissions,
  effectiveIsOrderable = false,
  catalogIsReward = false,
  isSuperAdmin = false,
  onToggleOrderable,
  ownerCount,
  dfpDisplayEnabled = true,
}) {
  const _dfpEngineReady = useDfpEngineReady()
  const isStarterBlueprint = isDefaultBlueprint(blueprint.internalName || blueprint.file)

  const defaultSlotQualities = useMemo(
    () => buildDefaultSlotQualities(blueprint),
    [blueprint]
  )
  const dfp = useMemo(
    () =>
      isAmmoBlueprint(blueprint)
        ? calculateBlueprintDfp(blueprint)
        : calculateBlueprintDfpWithParts(blueprint, defaultSlotQualities),
    [blueprint, defaultSlotQualities]
  )

  if (!(blueprint.internalName || blueprint.file) || !blueprint.blueprintName) return null

  const hasRequirements = blueprint.slots && Array.isArray(blueprint.slots) && blueprint.slots.length > 0
  const categoryTags = getBlueprintDisplayTags(blueprint)
  const dfpLabel = formatDfpLabel(dfp.total)
  const dfpBreakdown = formatCraftDfpBreakdown(dfp)
  const specLine = formatBlueprintSpecLine(blueprint)

  const handleCheckboxClick = (e) => {
    e.stopPropagation()
    if (isStarterBlueprint || !canModify) return
    onToggleAcquired()
  }

  const handleTargetClick = (e) => {
    e.stopPropagation()
    if (showTargetControl && onToggleTarget) {
      onToggleTarget()
    }
  }

  const handleMissionsClick = (e) => {
    e.stopPropagation()
    if (showMissionsControl && onOpenMissions) {
      onOpenMissions()
    }
  }

  const handleCraftTrackerClick = (e) => {
    e.stopPropagation()
    if (showCraftTrackerControl && onAddToCraftTracker && !craftTrackerPending) {
      onAddToCraftTracker()
    }
  }

  const handleOrderableToggle = (e) => {
    e.stopPropagation()
    if (isSuperAdmin && onToggleOrderable) {
      onToggleOrderable(!effectiveIsOrderable)
    }
  }

  const hasOverride = isSuperAdmin && effectiveIsOrderable !== catalogIsReward
  const hasCategoryTags = categoryTags.length > 0
  const hasRewardLabel =
    isStarterBlueprint || typeof blueprint.isReward === 'boolean' || isSuperAdmin
  const showActionFooter =
    showTargetControl ||
    showMissionsControl ||
    showCraftTrackerControl ||
    hasRewardLabel
  const acquiredLocked = isStarterBlueprint || isAcquired

  return (
    <div
      onClick={(e) => onClick(blueprint, e)}
      className={`group relative flex flex-col h-full blueprint-card-fixed bg-gradient-to-br from-slate-900 to-slate-800 border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-xl transition-colors transition-shadow duration-200 overflow-hidden ${
        acquiredLocked
          ? 'border-green-500/50 ring-1 ring-green-500/20'
          : 'border-slate-700 hover:border-red-500/30'
      }`}
    >
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        <div className="flex items-start justify-between gap-2 mb-1 shrink-0">
          {dfpDisplayEnabled ? (
            <div className="shrink-0 text-left min-w-0">
              <span
                className="text-xs font-semibold text-amber-400/90 tabular-nums"
                title={dfpBreakdown}
              >
                {dfpLabel}
                <span className="text-amber-600/70 font-normal ml-0.5">aUEC</span>
              </span>
            </div>
          ) : (
            <span className="shrink-0" />
          )}
          <button
            onClick={handleCheckboxClick}
            disabled={!canModify || isStarterBlueprint}
            className={`ml-2 shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
              acquiredLocked
                ? 'bg-green-500 border-green-500 text-white'
                : canModify
                  ? 'bg-transparent border-slate-500 hover:border-green-400'
                  : 'bg-transparent border-slate-600 cursor-not-allowed opacity-50'
            } ${isStarterBlueprint ? 'cursor-default opacity-100' : ''}`}
            title={
              isStarterBlueprint
                ? 'Starter blueprint — always in your collection'
                : !canModify
                  ? isPending
                    ? 'Awaiting officer approval'
                    : 'Sign in to track blueprints'
                  : isAcquired
                    ? 'Mark as not acquired'
                    : 'Mark as acquired'
            }
          >
            {acquiredLocked && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>

        <div className="mb-3 min-w-0 text-left shrink-0">
          <h3
            className="font-bold text-white line-clamp-3 text-sm leading-snug"
            title={blueprint.blueprintName}
          >
            {blueprint.blueprintName}
          </h3>
          {specLine && (
            <p className="text-xs text-slate-400 leading-snug mt-0.5 truncate">
              {specLine}
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col text-sm">
          {hasRequirements ? (
            <div className={BLUEPRINT_PAPER_PANEL}>
              <div className="flex items-center justify-between gap-2 text-xs mb-2">
                <p className="text-sky-100/85 flex items-center gap-1.5">
                  <span>⏱️</span>
                  <span className="font-mono">
                    <strong className="text-white">{blueprint.craftTime?.hours || 0}h</strong>
                    {' '}
                    <strong className="text-white">{blueprint.craftTime?.minutes || 0}m</strong>
                    {' '}
                    <strong className="text-white">{blueprint.craftTime?.seconds || 0}s</strong>
                  </span>
                </p>
                {ownerCount !== undefined && (
                  <span className={`flex items-center gap-1 ${ownerCount === 0 ? 'text-amber-200' : 'text-sky-200/75'}`} title={ownerCount === 0 ? 'No members own this blueprint yet' : `${ownerCount} member${ownerCount !== 1 ? 's' : ''} own this`}>
                    <span>👤</span>
                    <span>{ownerCount}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {blueprint.slots.flatMap((slot, slotIdx) => 
                  (slot.options || []).map((opt, optIdx) => {
                    const name = opt.resourceName || opt.entityName || opt.displayName || opt.itemName
                    if (!name) return null
                    const chipClass = opt.type === 'item'
                      ? 'bg-purple-950/50 text-purple-200 border-purple-400/35'
                      : resourceChipClassName(slugifyResourceName(name))
                    return (
                      <span 
                        key={`${slotIdx}-${optIdx}`} 
                        className={`inline-flex items-center max-w-full px-1.5 py-0.5 rounded text-xs border break-words shadow-sm shadow-sky-950/30 ${chipClass}`}
                      >
                        {name}
                      </span>
                    )
                  })
                ).slice(0, 6)}
                {blueprint.slots.flatMap(s => s.options || []).filter(o => o.resourceName || o.entityName || o.displayName || o.itemName).length > 6 && (
                  <span className="text-sky-200/70 text-xs">+{blueprint.slots.flatMap(s => s.options || []).filter(o => o.resourceName || o.entityName || o.displayName || o.itemName).length - 6} more</span>
                )}
              </div>
            </div>
          ) : (
            <div className={BLUEPRINT_PAPER_PANEL}>
              {ownerCount !== undefined && (
                <p className={`flex items-center justify-end gap-1 text-xs ${ownerCount === 0 ? 'text-amber-200' : 'text-sky-200/75'}`} title={ownerCount === 0 ? 'No members own this blueprint yet' : `${ownerCount} member${ownerCount !== 1 ? 's' : ''} own this`}>
                  <span>👤</span>
                  <span>{ownerCount}</span>
                </p>
              )}
            </div>
          )}

          {hasCategoryTags && (
            <div className="mt-2">
              <BlueprintCategoryTags blueprint={blueprint} size="sm" />
            </div>
          )}
        </div>

        {showActionFooter && (
          <div className="mt-auto pt-2.5 border-t border-slate-700 shrink-0">
            {hasRewardLabel && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5 min-h-[1rem]">
                <span className="text-xs text-slate-500">
                  {isStarterBlueprint
                    ? '⚙ Default Blueprint'
                    : effectiveIsOrderable
                      ? '★ Reward Blueprint'
                      : '🔶 Standard'}
                </span>
                {hasOverride && (
                  <span className="text-[10px] text-slate-600">
                    (catalog: {catalogIsReward ? 'Reward' : 'Standard'})
                  </span>
                )}
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_7.25rem] items-end gap-2 min-h-[1.375rem]">
              <div className="min-w-0 self-end justify-self-start">
                {isSuperAdmin ? (
                  <label
                    className="inline-flex items-center gap-1 text-[10px] text-purple-300/90 cursor-pointer select-none whitespace-nowrap"
                    onClick={handleOrderableToggle}
                  >
                    <input
                      type="checkbox"
                      checked={effectiveIsOrderable}
                      onChange={handleOrderableToggle}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500/40"
                    />
                    Orderable
                  </label>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-1 self-end justify-self-end flex-wrap">
                {(showTargetControl || showMissionsControl || showCraftTrackerControl) && (
                  <>
                    {showCraftTrackerControl && (
                      <button
                        onClick={handleCraftTrackerClick}
                        disabled={craftTrackerPending}
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded transition-colors ${
                          craftTrackerPending
                            ? 'bg-slate-700/50 text-slate-500 cursor-wait'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-purple-600/20 hover:text-purple-300'
                        }`}
                        title="Add blueprint ores to Mining Tracker RS Tracker"
                      >
                        {craftTrackerPending ? 'Adding…' : 'RS Track'}
                      </button>
                    )}
                    {showTargetControl && !isOnTargetList && (
                      <button
                        onClick={handleTargetClick}
                        className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded transition-colors bg-slate-700/50 text-slate-400 hover:bg-orange-600/20 hover:text-orange-300"
                        title="Add to Mission Tracker"
                      >
                        Track
                      </button>
                    )}
                    {showMissionsControl && (
                      <button
                        onClick={handleMissionsClick}
                        className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded transition-colors bg-slate-700/50 text-slate-400 hover:bg-sky-600/20 hover:text-sky-300"
                        title="View missions that reward this blueprint"
                      >
                        Missions
                      </button>
                    )}
                    {showTargetControl && isOnTargetList && (
                      <button
                        onClick={handleTargetClick}
                        className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded transition-colors bg-orange-600/30 text-orange-300 hover:bg-orange-600/40"
                        title="Remove from Mission Tracker"
                      >
                        Tracked
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
