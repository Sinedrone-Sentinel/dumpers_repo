import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { BlueprintGridItem } from '../lib/blueprintVariantGroups'

const MIN_COL_PX = 280
const GRID_GAP_SM_PX = 16
const GRID_GAP_DEFAULT_PX = 12
const DEFAULT_ROW_HEIGHT = 340
const EXPANDED_GROUP_ROW_HEIGHT = 520

function gridGapPx(): number {
  if (typeof window === 'undefined') return GRID_GAP_SM_PX
  return window.matchMedia('(min-width: 640px)').matches ? GRID_GAP_SM_PX : GRID_GAP_DEFAULT_PX
}

function gridItemKey(item: BlueprintGridItem): string {
  if (item.kind === 'single') return item.blueprint.internalName || item.blueprint.file || 'single'
  return item.familyKey
}

interface VirtualizedBlueprintGridProps {
  items: BlueprintGridItem[]
  expandedGroupKey: string | null
  renderGridItem: (item: BlueprintGridItem) => React.ReactNode
}

export default function VirtualizedBlueprintGrid({
  items,
  expandedGroupKey,
  renderGridItem,
}: VirtualizedBlueprintGridProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [columnCount, setColumnCount] = useState(1)
  const [gridGap, setGridGap] = useState(GRID_GAP_SM_PX)

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const updateLayout = () => {
      const gap = gridGapPx()
      const width = el.clientWidth
      setGridGap(gap)
      setColumnCount(Math.max(1, Math.floor((width + gap) / (MIN_COL_PX + gap))))
      setScrollMargin(el.offsetTop)
    }

    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(el)
    window.addEventListener('resize', updateLayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateLayout)
    }
  }, [items.length, expandedGroupKey])

  const rows = useMemo(() => {
    const result: BlueprintGridItem[][] = []
    let index = 0
    while (index < items.length) {
      const item = items[index]
      if (item.kind === 'group' && expandedGroupKey === item.familyKey) {
        result.push([item])
        index += 1
        continue
      }
      result.push(items.slice(index, index + columnCount))
      index += columnCount
    }
    return result
  }, [items, columnCount, expandedGroupKey])

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index]
      if (
        row.length === 1 &&
        row[0].kind === 'group' &&
        expandedGroupKey === row[0].familyKey
      ) {
        return EXPANDED_GROUP_ROW_HEIGHT
      }
      return DEFAULT_ROW_HEIGHT
    },
    gap: gridGap,
    overscan: 4,
    scrollMargin,
  })

  return (
    <div ref={listRef} className="w-full min-w-0">
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowItems = rows[virtualRow.index]
          const isExpandedGroupRow =
            rowItems.length === 1 &&
            rowItems[0].kind === 'group' &&
            expandedGroupKey === rowItems[0].familyKey

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full grid items-stretch"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                columnGap: `${gridGap}px`,
                gridTemplateColumns: isExpandedGroupRow
                  ? 'minmax(0, 1fr)'
                  : `repeat(${Math.min(columnCount, rowItems.length)}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((item) => (
                <div key={gridItemKey(item)} className="h-full min-h-0 min-w-0">
                  {renderGridItem(item)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
