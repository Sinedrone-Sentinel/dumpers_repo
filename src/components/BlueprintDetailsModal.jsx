import { useState } from 'react'

export default function BlueprintDetailsModal({ blueprint, onClose }) {
  if (!blueprint) return null
  
  const [isOwned, setIsOwned] = useState(false)

  const craftTime = blueprint.craftTime || {}
  const timeSeconds = Math.floor(craftTime.seconds || 0) + (typeof craftTime.minutes === 'number' ? craftTime.minutes * 60 : 0) + (typeof craftTime.hours === 'number' ? craftTime.hours * 3600 : 0) + (typeof craftTime.days === 'number' ? craftTime.days * 86400 : 0)
  
  const hours = Math.floor(timeSeconds / 3600)
  const minutes = Math.floor((timeSeconds % 3600) / 60)
  const seconds = timeSeconds % 60

  console.log('[Modal] Blueprint data:', {
    name: blueprint.blueprintName,
    hasSlots: !!blueprint.slots,
    slotsCount: blueprint.slots?.length || 0,
    isReward: blueprint.isReward,
  })

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-4">
          <h2 className="text-lg font-bold text-white mb-1">{blueprint.blueprintName}</h2>
          <p className="text-slate-400 text-sm flex items-center gap-2">
            {blueprint.categoryName} • 
            <span className={isOwned ? "text-green-400" : ""}>
              {isOwned ? '✓ Owned' : blueprint.isReward ? '🏆 Reward Blueprint' : 'Standard'}
            </span>
          </p>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            <button 
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              ✕ Close
            </button>

            <div className="flex flex-wrap items-center gap-3 ml-auto bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
              {typeof timeSeconds === 'number' && timeSeconds > 0 ? (
                <>
                  <span className="text-sm text-slate-400">{isOwned ? 'Craft time: N/A' : `${hours}h ${minutes}m ${seconds}s`}</span>
                  {!isOwned ? (
                    <button 
                      onClick={() => setIsOwned(true)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    >
                      Mark as Owned
                    </button>
                  ) : (
                    <span className="text-green-400 text-sm font-medium flex items-center gap-1">
                      ✓ Confirmed Owned
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-slate-500 text-xs italic">Unknown duration</span>
                  {!isOwned ? (
                    <button 
                      onClick={() => setIsOwned(true)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    >
                      Mark as Owned
                    </button>
                  ) : (
                    <span className="text-green-400 text-sm font-medium flex items-center gap-1">
                      ✓ Confirmed Owned
                    </span>
                  )}
                </>
              )}
            </div>

          </div>
        </div>

        {/* Part Requirements */}
        {Array.isArray(blueprint.slots) && blueprint.slots.length > 0 ? (
          <div className="space-y-3 p-4 bg-slate-950/50">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
              📦 Resources Required
            </h3>
            
            {blueprint.slots.map((slot) => {
              const options = slot.options || []
              
              if (!options?.length) return null

              return (
                <div key={slot.slotDebugName} className="border border-slate-700 rounded-lg overflow-hidden">
                  {(slot.slotDisplayName || slot.slotDebugName) && (
                    <div className={`px-3 py-2 ${slot.requiredCount > 0 ? 'bg-slate-900' : ''} text-xs text-white ${slot.requiredCount === 1 ? '' : 'border-b border-slate-700'} rounded-t-lg`}>
                      {(slot.slotDisplayName && slot.slotDebugName) 
                        ? `${slot.slotDisplayName} ×${slot.requiredCount}`
                        : slot.slotDisplayName
                        || slot.slotDebugName
                      }
                    </div>
                  )}

                  <div className="divide-y divide-slate-800">
                    {options.map((opt) => {
                      if (!opt.resourceName || opt.type !== 'resource') return null
                      
                      const cleanName = String(opt.resourceName)
                        .replace(/\\/g, '')
                        .replace(/"/g, '')
                        .replace(/\$[0-9]/g, 'x') // Replace $digits with x to avoid regex group errors
                      const amount = opt.standardCargoUnits * (slot.requiredCount || 1)

                      return (
                        <div 
                          key={cleanName}
                          className="flex items-center justify-between px-3 py-2 hover:bg-slate-900/50 transition-colors"
                        >
                          <span className="text-slate-300 text-sm">{cleanName}</span>
                          <span className="text-white font-medium">
                            {amount} ×{slot.requiredCount || 1}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

          
          </div>
        ) : (
          <div className="p-4 bg-slate-950/30 border border-slate-800 rounded-lg">
            <p className="text-slate-400 text-sm mb-2">No specific resource requirements available</p>
            {blueprint.isReward ? (
              <p className="text-green-400 text-xs flex items-center gap-1">
                ✓ Reward blueprint - obtain through game missions
              </p>
            ) : null}
          </div>
        )}

        
      </div>
    </div>
  )
}
