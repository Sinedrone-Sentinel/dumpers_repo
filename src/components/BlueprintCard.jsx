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
        if (filename.includes('crossbow')) return 'crossbow'
        if (filename.includes('lmg')) return 'lmg'
        if (filename.includes('pistol')) return 'pistol'
        if (filename.includes('rifle')) return 'rifle'
        if (filename.includes('shotgun')) return 'shotgun'
        if (filename.includes('smg')) return 'smg'
        if (filename.includes('sniper')) return 'sniper'
        return null
      }
      return sub
    }
    if (parts[i] === 'ammo' && parts[i - 1] === 'fpsgear') {
      return parts[i + 1]?.replace('$', '')
    }
    if (parts[i] === 'armour' && parts[i - 1] === 'fpsgear') {
      let sub = parts[i + 1]?.replace('$', '')
      if (sub === 'templates' && parts[i + 2]) sub = parts[i + 2]
      if (sub === 'combat' && parts[i + 2]) sub = parts[i + 2]
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

export default function BlueprintCard({ blueprint, onClick, isAcquired, onToggleAcquired, canModify = true }) {
  if (!blueprint.file || !blueprint.blueprintName) return null

  const hasRequirements = blueprint.slots && Array.isArray(blueprint.slots) && blueprint.slots.length > 0
  const subType = getSubType(blueprint)

  const handleCheckboxClick = (e) => {
    e.stopPropagation()
    if (canModify) {
      onToggleAcquired()
    }
  }

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
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-bold text-white line-clamp-2 flex-1 mr-2 min-w-0 truncate" title={blueprint.blueprintName}>{blueprint.blueprintName}</h3>
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
            title={!canModify ? 'Sign in to track blueprints' : isAcquired ? 'Mark as not acquired' : 'Mark as acquired'}
          >
            {isAcquired && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-slate-400 flex items-center gap-1.5">
            ⏱️
            <span className="font-mono">
              <strong>{blueprint.craftTime?.hours || 0}h</strong>
              {' '}
              <strong>{blueprint.craftTime?.minutes || 0}m</strong>
              {' '}
              <strong>{blueprint.craftTime?.seconds || 0}s</strong>
            </span>
          </p>

          {hasRequirements ? (
            <div className="bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/50">
              <p className="text-slate-300 font-medium text-xs">{blueprint.slots.length} parts required</p>
              <div className="flex flex-wrap gap-1 mt-2">
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

          <div className="mt-3 pt-2.5 border-t border-slate-700 space-y-1.5">
            {(blueprint.categoryName || subType) && (
              <div className="flex flex-wrap gap-1">
                {blueprint.categoryName && (
                  <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] border border-slate-700">
                    {blueprint.categoryName}
                  </span>
                )}
                {subType && (
                  <span className="px-1.5 py-0.5 bg-orange-950/50 text-orange-400 rounded text-[10px] border border-orange-500/30">
                    {formatSubType(subType)}
                  </span>
                )}
              </div>
            )}
            {typeof blueprint.isReward === 'boolean' && (
              <span className="text-xs text-slate-500">{blueprint.isReward ? '★ Reward Blueprint' : '🔶 Standard'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
