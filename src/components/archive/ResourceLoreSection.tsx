import React, { useEffect, useMemo, useState } from 'react'
import { getResourceLoreEntries, lore } from '../../data/index'
import {
  getGameLoreCategory,
  LORE_CATEGORY_ORDER,
  mergeSmallLoreCategories,
} from '../../lib/loreCategories'
import {
  hasResourceLoreUiState,
  readResourceLoreUiState,
  writeResourceLoreUiState,
} from '../../lib/resourceLoreUiState'

function readInitialCollapsedCategories(): Set<string> {
  if (!hasResourceLoreUiState()) {
    return new Set(LORE_CATEGORY_ORDER)
  }
  return new Set(readResourceLoreUiState().collapsedCategoryIds)
}

export default function ResourceLoreSection() {
  const [search, setSearch] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    readInitialCollapsedCategories
  )

  const loreEntries = useMemo(() => getResourceLoreEntries(), [])

  const categorizedResources = useMemo(() => {
    const categories = new Map<string, typeof loreEntries>()
    const searchLower = search.toLowerCase()

    for (const entry of loreEntries) {
      if (
        searchLower &&
        !entry.label.toLowerCase().includes(searchLower) &&
        !entry.description.toLowerCase().includes(searchLower)
      ) {
        continue
      }

      const category = getGameLoreCategory(
        entry.resourceKey,
        entry.label,
        entry.locKey,
        entry.kind,
        entry.description
      )
      if (!categories.has(category)) {
        categories.set(category, [])
      }
      categories.get(category)!.push(entry)
    }

    for (const entries of categories.values()) {
      entries.sort((a, b) => a.label.localeCompare(b.label))
    }

    return mergeSmallLoreCategories(categories)
  }, [loreEntries, search])

  const visibleCategories = useMemo(
    () => LORE_CATEGORY_ORDER.filter((category) => (categorizedResources.get(category)?.length ?? 0) > 0),
    [categorizedResources]
  )

  useEffect(() => {
    writeResourceLoreUiState({
      collapsedCategoryIds: [...collapsedCategories],
    })
  }, [collapsedCategories])

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const totalVisible = useMemo(() => {
    let count = 0
    for (const entries of categorizedResources.values()) {
      count += entries.length
    }
    return count
  }, [categorizedResources])

  if (loreEntries.length === 0) {
    return (
      <div className="site-banner-warn p-4">
        <h3 className="text-sm font-medium text-amber-300 mb-2">Game Lore Not Available</h3>
        <p className="text-xs text-amber-200/70">
          Lore entries are not available in this build. They will return with the next game-data
          update.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-400 mb-4">
          Lore and flavor text from Star Citizen game files — commodities, ship components, armor,
          weapons, flair items, and more — extracted via StarBreaker.
        </p>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lore entries..."
            className="site-input w-full pl-10 pr-4 py-2 text-sm"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <p className="text-xs text-slate-500 mt-2">
          Showing {totalVisible} of {lore.summary.totalDescriptions} lore entries
        </p>
      </div>

      {visibleCategories.length > 0 && (
        <div className="flex items-center justify-end gap-1">
          {!visibleCategories.every((category) => collapsedCategories.has(category)) && (
            <button
              type="button"
              onClick={() => setCollapsedCategories(new Set(visibleCategories))}
              className="site-btn-secondary !px-2 !py-1 text-xs"
            >
              Close All
            </button>
          )}
          {visibleCategories.some((category) => collapsedCategories.has(category)) && (
            <button
              type="button"
              onClick={() => setCollapsedCategories(new Set())}
              className="site-btn-secondary !px-2 !py-1 text-xs"
            >
              Open All
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {LORE_CATEGORY_ORDER.map((category) => {
          const entries = categorizedResources.get(category)
          if (!entries || entries.length === 0) return null

          const isCollapsed = collapsedCategories.has(category)

          return (
            <div key={category} className="site-section">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="site-section-header w-full flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-sm font-medium text-slate-200">{category}</span>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{entries.length}</span>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-slate-700/30">
                  {entries.map((entry) => (
                    <div key={entry.resourceKey} className="lore-entry-row site-section-body !py-4">
                      <h4 className="text-sm font-medium text-orange-300 mb-2">{entry.label}</h4>
                      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                        {entry.description.replace(/\\n/g, '\n')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="text-xs text-slate-600 text-center pt-4 site-divider">
        {lore._source} · Last extracted {new Date(lore._extracted).toLocaleDateString()}
      </div>
    </div>
  )
}
