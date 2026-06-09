import { calculateBlueprintDfp, formatDfpLabel } from '../lib/dfp'
import { useAuth } from '../contexts/AuthContext'

const FPS_WEAPON_TYPE_OPTIONS = ['crossbow', 'lmg', 'pistol', 'rifle', 'shotgun', 'smg', 'sniper']

const getFpsWeaponTypeFromFilename = (filename) => {
  const fn = (filename || '').toLowerCase()
  for (const type of FPS_WEAPON_TYPE_OPTIONS) {
    if (fn.includes(`_${type}_`) || fn.includes(`_${type}.`)) return type
  }
  return null
}

const getSubType = (bp) => {
  const parts = bp.file.split('\\')
  const filename = parts[parts.length - 1] || ''
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'vehiclegear' && parts[i + 1] === 'weapons') {
      let next = parts[i + 2]?.replace('$', '')
      if (next === 'templates' && parts[i + 3]) next = parts[i + 3]
      return next || null
    }
    if (parts[i] === 'weapons' && parts[i - 1] === 'fpsgear') {
      let sub = parts[i + 1]?.replace('$', '')
      if (sub === 'templates') {
        return getFpsWeaponTypeFromFilename(filename)
      }
      return sub
    }
    if (parts[i] === 'ammo' && parts[i - 1] === 'fpsgear') {
      const fromFilename = getFpsWeaponTypeFromFilename(filename)
      if (fromFilename) return fromFilename
      const folderType = parts[i + 1]?.replace('$', '')
      if (FPS_WEAPON_TYPE_OPTIONS.includes(folderType)) return folderType
      return null
    }
    if (parts[i] === 'armour' && parts[i - 1] === 'fpsgear') {
      let sub = parts[i + 1]?.replace('$', '')
      if (sub === 'templates' && parts[i + 2]) sub = parts[i + 2]
      // Combat armor shows as "standard" type - weight is shown separately
      if (sub === 'combat') return 'standard'
      // For flightsuit: helmets are "standard" type, bodies are "flightsuit" type
      if (sub === 'flightsuit') {
        if (filename.includes('_helmet')) return 'standard'
        return 'flightsuit'
      }
      return sub
    }
    if (parts[i] === 'vehiclegear' && parts[i + 1] !== 'weapons') {
      return parts[i + 1]?.replace('$', '')
    }
  }
  return null
}

const formatSubType = (sub) => {
  if (!sub) return null
  return sub.charAt(0).toUpperCase() + sub.slice(1)
}

const getArmorWeightFromPath = (parts) => {
  const armourIdx = parts.indexOf('armour')
  if (armourIdx < 0) return null
  for (let i = armourIdx + 1; i < parts.length - 1; i++) {
    const segment = parts[i]?.toLowerCase()
    if (['superheavy', 'heavy', 'medium', 'light'].includes(segment)) return segment
  }
  return null
}

const isFlightArmor = (parts, filename, blueprintName = '') => {
  if (parts.some(p => p.toLowerCase() === 'flightsuit')) return true
  if (parts.some(p => p.toLowerCase() === 'racer')) return true
  if (filename.includes('flightsuit')) return true
  const name = (blueprintName || '').toLowerCase()
  if (name.includes('flight') || name.includes('racing')) return true
  return false
}

const getArmorWeight = (bp) => {
  const parts = bp.file.split('\\')
  const filename = parts[parts.length - 1]?.toLowerCase() || ''
  
  // Check if this is FPS armor
  const isArmor = parts.some((p, i) => p === 'armour' && parts[i - 1] === 'fpsgear')
  if (!isArmor) return null
  
  // Flight suits, racing gear, and flight/racing helmets
  if (isFlightArmor(parts, filename, bp.blueprintName)) return 'flight'
  
  // Extract weight from filename (works for both combat and template armor)
  if (filename.includes('_superheavy_') || filename.includes('_superheavy.')) return 'superheavy'
  if (filename.includes('_heavy_') || filename.includes('_heavy.')) return 'heavy'
  if (filename.includes('_medium_') || filename.includes('_medium.')) return 'medium'
  if (filename.includes('_light_') || filename.includes('_light.')) return 'light'
  
  // Fallback: weight from folder path (e.g. combat\light\bp_craft_gys_jacket_01_01_01.json)
  const fromPath = getArmorWeightFromPath(parts)
  if (fromPath) return fromPath

  // Undersuits are the lightest base layer
  if (parts.some(p => p.toLowerCase() === 'undersuit')) return 'light'
  
  return null
}

const getArmorSlot = (bp) => {
  const parts = bp.file.split('\\')
  const filename = parts[parts.length - 1]?.toLowerCase() || ''
  
  // Check if this is FPS armor
  const isArmor = parts.some((p, i) => p === 'armour' && parts[i - 1] === 'fpsgear')
  if (!isArmor) return null
  
  // Extract slot from filename
  if (filename.includes('_helmet')) return 'helmet'
  if (filename.includes('_arms')) return 'arms'
  if (filename.includes('_core') || filename.includes('_jacket')) return 'core'
  if (filename.includes('_legs') || filename.includes('_pants')) return 'legs'
  if (filename.includes('_backpack') || filename.includes('backpack_')) return 'backpack'
  
  return null
}

export default function BlueprintCard({
  blueprint,
  onClick,
  isAcquired,
  onToggleAcquired,
  canModify = true,
  isPending = false,
  showTargetControl = false,
  isOnTargetList = false,
  onToggleTarget,
}) {
  const { dfpDisplayEnabled } = useAuth()

  if (!blueprint.file || !blueprint.blueprintName) return null

  const hasRequirements = blueprint.slots && Array.isArray(blueprint.slots) && blueprint.slots.length > 0
  const subType = getSubType(blueprint)
  const armorWeight = getArmorWeight(blueprint)
  const armorSlot = getArmorSlot(blueprint)
  const dfp = calculateBlueprintDfp(blueprint)
  const dfpLabel = formatDfpLabel(dfp.total)

  const handleCheckboxClick = (e) => {
    e.stopPropagation()
    if (canModify) {
      onToggleAcquired()
    }
  }

  const handleTargetClick = (e) => {
    e.stopPropagation()
    if (showTargetControl && onToggleTarget) {
      onToggleTarget()
    }
  }

  const hasCategoryTags = !!(blueprint.categoryName || subType || armorWeight || armorSlot)
  const hasRewardLabel = typeof blueprint.isReward === 'boolean'
  const showFooter = showTargetControl || hasCategoryTags || hasRewardLabel

  return (
    <div
      onClick={() => onClick(blueprint)}
      className={`group relative bg-gradient-to-br from-slate-900 to-slate-800 border rounded-xl p-5 cursor-pointer hover:shadow-xl transition-all duration-200 overflow-hidden min-h-[140px] ${
        isAcquired 
          ? 'border-green-500/50 ring-1 ring-green-500/20' 
          : 'border-slate-700 hover:border-red-500/30'
      }`}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2 mb-2">
          {dfpDisplayEnabled ? (
            <span
              className="text-xs font-semibold text-amber-400/90 tabular-nums shrink-0"
              title="Dumpers Fair-Value Price at 500 quality"
            >
              {dfpLabel}
              <span className="text-amber-600/70 font-normal ml-0.5">aUEC</span>
            </span>
          ) : (
            <span className="shrink-0" />
          )}
          <button
            onClick={handleCheckboxClick}
            disabled={!canModify}
            className={`ml-2 shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
              isAcquired
                ? 'bg-green-500 border-green-500 text-white'
                : canModify
                  ? 'bg-transparent border-slate-500 hover:border-green-400'
                  : 'bg-transparent border-slate-600 cursor-not-allowed opacity-50'
            }`}
            title={!canModify ? (isPending ? 'Awaiting officer approval' : 'Sign in to track blueprints') : isAcquired ? 'Mark as not acquired' : 'Mark as acquired'}
          >
            {isAcquired && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>

        <h3
          className="font-bold text-white line-clamp-3 flex-1 min-w-0 mb-3 text-sm leading-snug"
          title={blueprint.blueprintName}
        >
          {blueprint.blueprintName}
        </h3>

        <div className="space-y-2 text-sm">
          {hasRequirements ? (
            <div className="bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/50">
              <p className="text-slate-400 flex items-center gap-1.5 text-xs mb-2">
                <span>⏱️</span>
                <span className="font-mono">
                  <strong>{blueprint.craftTime?.hours || 0}h</strong>
                  {' '}
                  <strong>{blueprint.craftTime?.minutes || 0}m</strong>
                  {' '}
                  <strong>{blueprint.craftTime?.seconds || 0}s</strong>
                </span>
              </p>
              <div className="flex flex-wrap gap-1">
                {blueprint.slots.flatMap((slot, slotIdx) => 
                  (slot.options || []).map((opt, optIdx) => {
                    const name = opt.resourceName || opt.entityName
                    return name ? (
                      <span 
                        key={`${slotIdx}-${optIdx}`} 
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border whitespace-nowrap ${
                          opt.type === 'item' 
                            ? 'bg-purple-950/30 text-purple-400 border-purple-500/20' 
                            : 'bg-red-950/30 text-red-400 border-red-500/20'
                        }`}
                      >
                        {name}{opt.quantity > 1 ? ` ×${opt.quantity}` : ''}
                      </span>
                    ) : null
                  })
                ).slice(0, 6)}
                {blueprint.slots.flatMap(s => s.options || []).filter(o => o.resourceName || o.entityName).length > 6 && (
                  <span className="text-slate-500 text-xs">+{blueprint.slots.flatMap(s => s.options || []).filter(o => o.resourceName || o.entityName).length - 6} more</span>
                )}
              </div>
            </div>
          ) : null}

          {showFooter && (
            <div className="mt-3 pt-2.5 border-t border-slate-700">
              <div className="flex items-end justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  {hasCategoryTags && (
                    <div className="flex flex-wrap gap-1">
                      {blueprint.categoryName && (
                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] border border-slate-700">
                          {blueprint.categoryName}
                        </span>
                      )}
                      {armorWeight && (
                        <span className="px-1.5 py-0.5 bg-blue-950/50 text-blue-400 rounded text-[10px] border border-blue-500/30">
                          {armorWeight === 'superheavy' ? 'Super Heavy' : formatSubType(armorWeight)}
                        </span>
                      )}
                      {armorSlot && (
                        <span className="px-1.5 py-0.5 bg-green-950/50 text-green-400 rounded text-[10px] border border-green-500/30">
                          {formatSubType(armorSlot)}
                        </span>
                      )}
                      {subType && (
                        <span className="px-1.5 py-0.5 bg-orange-950/50 text-orange-400 rounded text-[10px] border border-orange-500/30">
                          {formatSubType(subType)}
                        </span>
                      )}
                    </div>
                  )}
                  {hasRewardLabel && (
                    <span className="text-xs text-slate-500">{blueprint.isReward ? '★ Reward Blueprint' : '🔶 Standard'}</span>
                  )}
                </div>
                {showTargetControl && (
                  <button
                    onClick={handleTargetClick}
                    className={`shrink-0 px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${
                      isOnTargetList
                        ? 'bg-amber-900/50 text-amber-300 border-amber-500/50 hover:bg-amber-900/70'
                        : 'bg-slate-800/80 text-slate-400 border-slate-600 hover:border-amber-500/40 hover:text-amber-300'
                    }`}
                    title={isOnTargetList ? 'Remove from target list' : 'Add to target list'}
                  >
                    {isOnTargetList ? '★ Target' : '+ Target'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
