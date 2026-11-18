import { useMemo, useState } from 'react'
import AppModal from './layout/AppModal'
import SiteTooltip from './SiteTooltip'
import {
  formatRatePct,
  locationTypeById,
  lootItemForEntityClass,
  systemsLabel,
} from '../lib/siteLoot'

const ICON =
  'inline-flex h-5 shrink-0 items-center justify-center px-0.5 leading-none hover:brightness-125'

function TreasureChestMark() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 9.5V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5H4z" opacity="0.9" />
      <path d="M3 10.5h18v8.25A1.75 1.75 0 0 1 19.25 20.5H4.75A1.75 1.75 0 0 1 3 18.75V10.5z" />
      <path d="M11 10.5h2v3.25a1 1 0 0 1-2 0V10.5z" fill="#1e293b" />
      <path d="M10.25 13.25h3.5v1.5h-3.5z" fill="#1e293b" />
      <path d="M4 9.5h16v1H4z" fill="#fde68a" opacity="0.85" />
    </svg>
  )
}

function LootLocationsModal({ item, onClose }) {
  const rows = useMemo(() => {
    return [...(item.locations || [])]
      .map((hit) => {
        const loc = locationTypeById(hit.locationTypeId)
        if (!loc) return null
        return { loc, ratePct: hit.ratePct }
      })
      .filter(Boolean)
      .sort((a, b) => a.loc.label.localeCompare(b.loc.label))
  }, [item])

  return (
    <AppModal
      title={item.displayName}
      subtitle="Loot Finder locations where this item can drop."
      onClose={onClose}
      size="md"
      zIndex={80}
    >
      <ul className="space-y-1.5">
        {rows.map(({ loc, ratePct }) => (
          <li key={loc.id} className="site-card p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{loc.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{systemsLabel(loc)}</p>
            </div>
            <span className="site-badge-slate tabular-nums shrink-0">{formatRatePct(ratePct)}</span>
          </li>
        ))}
      </ul>
    </AppModal>
  )
}

/**
 * Dumpers-gold treasure chest — opens loot locations when the BP appears in any
 * tracked Loot Finder site. Visibility follows the bake: adding a location can
 * show new chests; removing a location hides the chest only when no sites remain.
 */
export default function BlueprintLootLocations({ entityClass, className = '', label = 'Loot locations' }) {
  const [open, setOpen] = useState(false)
  const lootItem = useMemo(() => lootItemForEntityClass(entityClass), [entityClass])
  if (!lootItem?.locations?.length) return null

  return (
    <>
      <span className={`inline-flex items-center ${className}`.trim()}>
        <SiteTooltip content={label}>
          <button
            type="button"
            className={`${ICON} text-amber-300`}
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(true)
            }}
          >
            <TreasureChestMark />
          </button>
        </SiteTooltip>
      </span>
      {open ? <LootLocationsModal item={lootItem} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
