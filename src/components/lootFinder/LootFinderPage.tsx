import React from 'react'
import FeaturePageLayout from '../layout/FeaturePageLayout'
import SiteTooltip from '../SiteTooltip'
import { setAnalyticsSubTool } from '../../lib/analytics'
import {
  SITE_LOOT_BY_LOCATION,
  SITE_LOOT_EXTRACTED,
  SITE_LOOT_ITEM_COUNT,
  SITE_LOOT_ITEMS,
  SITE_LOOT_LOCATION_TYPES,
  RATE_TOOLTIP,
  filterItemsByQuery,
  formatRatePct,
  locationTypeById,
  systemsLabel,
  type SiteLootItem,
  type SiteLootLocationItem,
} from '../../lib/siteLoot'

function RateBadge({ ratePct }: { ratePct: number }) {
  return (
    <SiteTooltip side="top" content={RATE_TOOLTIP}>
      <span className="site-badge-slate cursor-help tabular-nums shrink-0">{formatRatePct(ratePct)}</span>
    </SiteTooltip>
  )
}

function statsLine(stats?: Record<string, unknown>): string | null {
  if (!stats) return null
  const bits: string[] = []
  if (typeof stats.weaponType === 'string') bits.push(stats.weaponType)
  if (typeof stats.componentType === 'string') bits.push(stats.componentType)
  if (stats.size != null) bits.push(`Size ${stats.size}`)
  if (stats.grade != null) bits.push(`Grade ${stats.grade}`)
  if (typeof stats.itemClass === 'string') bits.push(stats.itemClass)
  if (typeof stats.slot === 'string') bits.push(stats.slot)
  if (typeof stats.consumableType === 'string') bits.push(stats.consumableType)
  return bits.length ? bits.join(' · ') : null
}

function LocationMiniCard({
  locationTypeId,
  ratePct,
}: {
  locationTypeId: string
  ratePct: number
}) {
  const loc = locationTypeById(locationTypeId)
  if (!loc) return null
  return (
    <div className="site-card p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-slate-100 truncate">{loc.label}</p>
        <RateBadge ratePct={ratePct} />
      </div>
      <p className="text-xs text-slate-400">{systemsLabel(loc)}</p>
    </div>
  )
}

function LootMiniCard({ item }: { item: SiteLootLocationItem }) {
  const detail = statsLine(item.stats)
  return (
    <div className="site-card p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-slate-100 leading-snug">{item.displayName}</p>
        <RateBadge ratePct={item.ratePct} />
      </div>
      <p className="text-xs text-slate-400">
        {item.kindLabel}
        {detail ? ` · ${detail}` : ''}
      </p>
    </div>
  )
}

export default function LootFinderPage() {
  const [mode, setMode] = React.useState<'item' | 'location'>('item')
  const [query, setQuery] = React.useState('')
  const [selectedItemKey, setSelectedItemKey] = React.useState<string | null>(null)
  const [locationId, setLocationId] = React.useState(SITE_LOOT_LOCATION_TYPES[0]?.id ?? '')
  const [suggestOpen, setSuggestOpen] = React.useState(false)
  const blurTimer = React.useRef<number | null>(null)

  React.useEffect(() => {
    setAnalyticsSubTool(mode === 'item' ? 'by_item' : 'by_location')
  }, [mode])

  React.useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
    }
  }, [])

  const suggestions = React.useMemo(() => filterItemsByQuery(query, 36), [query])

  const selectedItem: SiteLootItem | null = React.useMemo(
    () => SITE_LOOT_ITEMS.find((item) => item.key === selectedItemKey) ?? null,
    [selectedItemKey],
  )

  const locationItems = React.useMemo(
    () => SITE_LOOT_BY_LOCATION[locationId] ?? [],
    [locationId],
  )

  const pickItem = (item: SiteLootItem) => {
    setSelectedItemKey(item.key)
    setQuery(item.displayName)
    setSuggestOpen(false)
    setMode('item')
  }

  return (
    <FeaturePageLayout
      title="Loot Finder"
      seoIntro="Star Citizen Loot Finder — search loot by item or location type for Lazarus, Onyx, OLP, PAF, Contested Zones, Executive Hangar, and QV Investigation, with relative drop rates from game data."
      meta={
        <>
          <span>{SITE_LOOT_ITEM_COUNT} loot entries</span>
          <span className="mx-2">·</span>
          <span>{SITE_LOOT_LOCATION_TYPES.length} location types</span>
          {SITE_LOOT_EXTRACTED ? (
            <>
              <span className="mx-2">·</span>
              <span className="text-slate-400">
                Updated {new Date(SITE_LOOT_EXTRACTED).toLocaleDateString()}
              </span>
            </>
          ) : null}
        </>
      }
    >
      <div className="site-chip-strip mb-4 w-fit">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors site-btn-shimmer ${
            mode === 'item' ? 'site-filter-selected-orange' : 'site-filter-idle'
          }`}
          onClick={() => setMode('item')}
        >
          Search loot
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors site-btn-shimmer ${
            mode === 'location' ? 'site-filter-selected-orange' : 'site-filter-idle'
          }`}
          onClick={() => setMode('location')}
        >
          By location
        </button>
      </div>

      {mode === 'item' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 min-w-0">
          <div className="min-w-0 flex flex-col gap-2 relative">
            <label className="site-label" htmlFor="loot-finder-search">
              Item
            </label>
            <input
              id="loot-finder-search"
              className="site-input px-3 py-2"
              placeholder="Type a weapon, armour piece, component…"
              value={query}
              autoComplete="off"
              onChange={(e) => {
                setQuery(e.target.value)
                setSuggestOpen(true)
                setSelectedItemKey(null)
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => {
                blurTimer.current = window.setTimeout(() => setSuggestOpen(false), 150)
              }}
            />
            {suggestOpen && suggestions.length > 0 ? (
              <div className="site-dropdown-list absolute left-0 right-0 top-[4.5rem] z-30 max-h-72 overflow-y-auto">
                {suggestions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`site-dropdown-item w-full text-left ${
                      item.key === selectedItemKey ? 'site-dropdown-item-active' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickItem(item)}
                  >
                    <span className="block truncate">{item.displayName}</span>
                    <span className="block text-xs text-slate-400">{item.kindLabel}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {!selectedItem && query.trim() && suggestions.length === 0 ? (
              <p className="site-hint">No loot matches that name.</p>
            ) : null}
          </div>

          <div className="min-w-0">
            {!selectedItem ? (
              <div className="site-empty">Pick a loot item to see where it can drop.</div>
            ) : (
              <>
                <div className="mb-3">
                  <p className="text-lg font-medium text-slate-100">{selectedItem.displayName}</p>
                  <p className="text-sm text-slate-400">
                    {selectedItem.kindLabel}
                    {statsLine(selectedItem.stats) ? ` · ${statsLine(selectedItem.stats)}` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedItem.locations.map((hit) => (
                    <LocationMiniCard
                      key={hit.locationTypeId}
                      locationTypeId={hit.locationTypeId}
                      ratePct={hit.ratePct}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4 min-w-0">
          <div className="min-w-0 flex flex-col gap-2">
            <label className="site-label" htmlFor="loot-finder-location">
              Location type
            </label>
            <select
              id="loot-finder-location"
              className="site-input px-3 py-2"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {SITE_LOOT_LOCATION_TYPES.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label}
                </option>
              ))}
            </select>
            <p className="site-hint">{systemsLabel(locationTypeById(locationId))}</p>
          </div>

          <div className="min-w-0">
            {locationItems.length === 0 ? (
              <div className="site-empty">No allowlisted loot for this location type.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {locationItems.map((item) => (
                  <LootMiniCard key={item.key} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </FeaturePageLayout>
  )
}
