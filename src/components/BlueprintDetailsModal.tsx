import React from 'react'
import AppModal from './layout/AppModal'

interface BlueprintRecord {
  file: string
  blueprintName?: string
  categoryName?: string
  isReward?: boolean
  craftTime?: { hours?: number; minutes?: number; seconds?: number }
  slots?: Array<{
    slotDisplayName?: string
    requiredCount?: number
    options?: Array<{
      type?: string
      resourceName?: string
      entityName?: string
      quantity?: number
      standardCargoUnits?: number
    }>
  }>
  rewardMissions?: unknown[]
}

interface BlueprintDetailsModalProps {
  blueprint: BlueprintRecord
  subTypeLabel?: string | null
  onClose: () => void
  isApproved: boolean
  isAcquired: boolean
  isOnTarget: boolean
}

export default function BlueprintDetailsModal({
  blueprint,
  subTypeLabel,
  onClose,
  isApproved,
  isAcquired,
  isOnTarget,
}: BlueprintDetailsModalProps) {
  return (
    <AppModal
      title={blueprint.blueprintName || 'Blueprint'}
      onClose={onClose}
      size="lg"
      zIndex={60}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-slate-300">
            {blueprint.categoryName || 'Unknown'}
          </span>
          {subTypeLabel && (
            <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-slate-300">{subTypeLabel}</span>
          )}
          {blueprint.isReward === true && (
            <span className="px-2.5 py-1 bg-amber-900/50 text-amber-400 rounded-lg">★ Reward</span>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-3 sm:p-4">
          <h3 className="text-slate-400 text-sm mb-2">Craft Time</h3>
          <p className="text-white text-base font-mono">
            {blueprint.craftTime?.hours || 0}h {blueprint.craftTime?.minutes || 0}m{' '}
            {blueprint.craftTime?.seconds || 0}s
          </p>
        </div>

        {blueprint.slots && blueprint.slots.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl p-3 sm:p-4">
            <h3 className="text-slate-400 text-sm mb-3">Required Resources</h3>
            <div className="space-y-3">
              {blueprint.slots.map((slot, idx) => (
                <div key={idx} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                  <div className="flex justify-between items-center gap-2 mb-2">
                    <span className="text-white font-medium text-sm">{slot.slotDisplayName}</span>
                    <span className="text-slate-400 text-sm shrink-0">×{slot.requiredCount || 1}</span>
                  </div>
                  {slot.options && slot.options.length > 0 && (
                    <div className="space-y-1">
                      {slot.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex justify-between gap-2 text-sm min-w-0">
                          <span
                            className={`min-w-0 break-words ${
                              opt.type === 'item' ? 'text-purple-400' : 'text-red-400'
                            }`}
                          >
                            {opt.resourceName || opt.entityName || 'Unknown'}
                          </span>
                          {(opt.standardCargoUnits ?? 0) > 0 ? (
                            <span className="text-slate-500 shrink-0">{opt.standardCargoUnits} SCU</span>
                          ) : (opt.quantity ?? 0) > 0 ? (
                            <span className="text-slate-500 shrink-0">×{opt.quantity}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {blueprint.rewardMissions && blueprint.rewardMissions.length > 0 && (
          <div className="bg-amber-950/20 border border-amber-500/25 rounded-xl p-3 sm:p-4">
            <h3 className="text-amber-300/90 text-sm font-semibold mb-2">
              Reward Missions ({blueprint.rewardMissions.length})
            </h3>
            {!isApproved ? (
              <p className="text-sm text-slate-400">
                After your account is approved, add this blueprint to your Target BP List to track which
                missions reward it.
              </p>
            ) : isAcquired ? (
              <p className="text-sm text-slate-400">
                This blueprint is already in your pool. Reward missions are only tracked on your Target BP
                List while you are still hunting a blueprint.
              </p>
            ) : isOnTarget ? (
              <p className="text-sm text-slate-400">
                This blueprint is on your Target BP List. Open{' '}
                <strong className="text-amber-300/90">Target BP List</strong> from the menu to see grouped
                missions, toggle them on/off, and track progress.
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                Use <strong className="text-amber-300/90">+ Target</strong> on the card to add this blueprint
                to your Target BP List. Missions that reward it will appear on the{' '}
                <strong className="text-amber-300/90">Target BP List</strong> page.
              </p>
            )}
          </div>
        )}
      </div>
    </AppModal>
  )
}
