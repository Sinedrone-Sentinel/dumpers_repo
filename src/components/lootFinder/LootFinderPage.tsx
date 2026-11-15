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
  kindChipForItem,
  kindChipsForItems,
  locationSelectGroups,
  locationTypeById,
  lootStatChips,
  systemsLabel,
  type SiteLootItem,
  type SiteLootKindChipId,
  type SiteLootLocationItem,
} from '../../lib/siteLoot'
import { BLUEPRINT_TAG_CHIP_CLASS } from '../../lib/blueprintTaxonomy'

const LOCATION_SELECT = locationSelectGroups()
const GROUP_SORT = ['contested_zone']

const CHIP =
  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors site-btn-shimmer'

function RateBadge({ ratePct }: { ratePct: number }) {
  return (
    <SiteTooltip side="top" content={RATE_TOOLTIP}>
      <span className="site-badge-slate cursor-help tabular-nums shrink-0">{formatRatePct(ratePct)}</span>
    </SiteTooltip>
  )
}

function LootStatChips({ stats }: { stats?: Record<string, unknown> }) {
  const tags = lootStatChips(stats)
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={`${tag.kind}-${tag.label}`}
          className={`px-1.5 py-0.5 rounded text-[10px] border ${BLUEPRINT_TAG_CHIP_CLASS[tag.kind]}`}
        >
          {tag.label}
        </span>
      ))}
    </div>
  )
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
  return (
    <div className="site-card p-3 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-slate-100 leading-snug">{item.displayName}</p>
        <RateBadge ratePct={item.ratePct} />
      </div>
      <p className="text-xs text-slate-400">{item.kindLabel}</p>
      <LootStatChips stats={item.stats} />
    </div>
  )
}

export default function LootFinderPage() {
  const [mode, setMode] = React.useState<'item' | 'location'>('item')
  const [query, setQuery] = React.useState('')
  const [selectedItemKey, setSelectedItemKey] = React.useState<string | null>(null)
  const [locationId, setLocationId] = React.useState(SITE_LOOT_LOCATION_TYPES[0]?.id ?? '')
  const [kindChip, setKindChip] = React.useState<SiteLootKindChipId | 'all'>('all')
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

  const selectedItemLocations = React.useMemo(() => {
    if (!selectedItem) return []
    return [...selectedItem.locations].sort((a, b) => {
      const la = locationTypeById(a.locationTypeId)
      const lb = locationTypeById(b.locationTypeId)
      const ga = la?.group ? GROUP_SORT.indexOf(la.group) : -1
      const gb = lb?.group ? GROUP_SORT.indexOf(lb.group) : -1
      const gRankA = ga === -1 ? 100 : ga
      const gRankB = gb === -1 ? 100 : gb
      if (gRankA !== gRankB) return gRankA - gRankB
      return (la?.label || '').localeCompare(lb?.label || '')
    })
  }, [selectedItem])

  const locationItems = React.useMemo(
    () => SITE_LOOT_BY_LOCATION[locationId] ?? [],
    [locationId],
  )

  const availableKindChips = React.useMemo(() => kindChipsForItems(locationItems), [locationItems])

  const kindCounts = React.useMemo(() => {
    const counts: Partial<Record<SiteLootKindChipId, number>> = {}
    for (const item of locationItems) {
      const id = kindChipForItem(item)
      counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  }, [locationItems])

  React.useEffect(() => {
    setKindChip('all')
  }, [locationId])

  React.useEffect(() => {
    if (kindChip === 'all') return
    if (!availableKindChips.some((chip) => chip.id === kindChip)) setKindChip('all')
  }, [availableKindChips, kindChip])

  const filteredLocationItems = React.useMemo(() => {
    if (kindChip === 'all') return locationItems
    return locationItems.filter((item) => kindChipForItem(item) === kindChip)
  }, [locationItems, kindChip])

  const pickItem = (item: SiteLootItem) => {
    setSelectedItemKey(item.key)
    setQuery(item.displayName)
    setSuggestOpen(false)
    setMode('item')
  }

  return (
    <FeaturePageLayout
      title="Loot Finder"
      seoIntro="Star Citizen Loot Finder — search loot by item or named site for Lazarus, Onyx, OLP/PAF, Checkmate / Orbituary / Ruin Contested Zones, Executive Hangar, QV Investigation, and Siege of Orison, with relative drop rates from game data."
      meta={
        <>
          <span>{SITE_LOOT_ITEM_COUNT} loot entries</span>
          <span className="mx-2">·</span>
          <span>{SITE_LOOT_LOCATION_TYPES.length} locations</span>
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
          <div className="min-w-0 flex flex-col gap-2">
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
              <div className="site-dropdown-list !relative mt-1 z-30 max-h-52 overflow-y-auto overscroll-contain">
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
                <div className="mb-3 flex flex-col gap-1.5">
                  <p className="text-lg font-medium text-slate-100">{selectedItem.displayName}</p>
                  <p className="text-sm text-slate-400">{selectedItem.kindLabel}</p>
                  <LootStatChips stats={selectedItem.stats} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedItemLocations.map((hit) => (
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
              Location
            </label>
            <select
              id="loot-finder-location"
              className="site-input px-3 py-2"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {LOCATION_SELECT.ungrouped.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label}
                </option>
              ))}
              {LOCATION_SELECT.groups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="site-hint">{systemsLabel(locationTypeById(locationId))}</p>
          </div>

          <div className="min-w-0 flex flex-col gap-3">
            {locationItems.length === 0 ? (
              <div className="site-empty">No allowlisted loot for this location.</div>
            ) : (
              <>
                <div className="site-chip-strip w-fit max-w-full">
                  <button
                    type="button"
                    className={`${CHIP} ${kindChip === 'all' ? 'site-filter-selected-orange' : 'site-filter-idle'}`}
                    onClick={() => setKindChip('all')}
                  >
                    All
                    <span className="ml-1.5 tabular-nums opacity-80">{locationItems.length}</span>
                  </button>
                  {availableKindChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`${CHIP} ${kindChip === chip.id ? 'site-filter-selected-orange' : 'site-filter-idle'}`}
                      onClick={() => setKindChip(chip.id)}
                    >
                      {chip.label}
                      <span className="ml-1.5 tabular-nums opacity-80">{kindCounts[chip.id] ?? 0}</span>
                    </button>
                  ))}
                </div>
                {filteredLocationItems.length === 0 ? (
                  <div className="site-empty">No loot in that filter for this location.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredLocationItems.map((item) => (
                      <LootMiniCard key={item.key} item={item} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </FeaturePageLayout>
  )
}
