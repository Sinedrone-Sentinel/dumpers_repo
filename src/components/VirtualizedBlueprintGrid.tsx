import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { BlueprintGridItem } from '../lib/blueprintVariantGroups'

const MIN_COL_PX = 280
const GRID_GAP_SM_PX = 16
const GRID_GAP_DEFAULT_PX = 12
const DEFAULT_ROW_HEIGHT = 340
/** Collapsed variant-group cards are much shorter than full BlueprintCards. */
const COLLAPSED_GROUP_ROW_HEIGHT = 148
const GROUP_HEADER_HEIGHT = 120
const GROUP_BODY_PADDING = 32

function gridGapPx(): number {
  if (typeof window === 'undefined') return GRID_GAP_SM_PX
  return window.matchMedia('(min-width: 640px)').matches ? GRID_GAP_SM_PX : GRID_GAP_DEFAULT_PX
}

function gridItemKey(item: BlueprintGridItem): string {
  if (item.kind === 'single') return item.blueprint.internalName || item.blueprint.file || 'single'
  return item.familyKey
}

function isExpandedGroup(item: BlueprintGridItem, expandedGroupKey: string | null): boolean {
  return item.kind === 'group' && expandedGroupKey === item.familyKey
}

/** Pack flat grid items into virtual rows; expanded groups always occupy a full-width row. */
function buildVirtualRows(
  items: BlueprintGridItem[],
  columnCount: number,
  expandedGroupKey: string | null
): BlueprintGridItem[][] {
  const rows: BlueprintGridItem[][] = []
  let currentRow: BlueprintGridItem[] = []

  const flushRow = () => {
    if (currentRow.length === 0) return
    rows.push(currentRow)
    currentRow = []
  }

  for (const item of items) {
    if (isExpandedGroup(item, expandedGroupKey)) {
      flushRow()
      rows.push([item])
      continue
    }

    currentRow.push(item)
    if (currentRow.length >= columnCount) {
      flushRow()
    }
  }

  flushRow()
  return rows
}

function estimateExpandedGroupHeight(
  memberCount: number,
  columnCount: number,
  gridGap: number
): number {
  const innerColumns = Math.max(1, columnCount)
  const memberRows = Math.ceil(memberCount / innerColumns)
  return (
    GROUP_HEADER_HEIGHT +
    GROUP_BODY_PADDING +
    memberRows * DEFAULT_ROW_HEIGHT +
    Math.max(0, memberRows - 1) * gridGap
  )
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

  const rows = useMemo(
    () => buildVirtualRows(items, columnCount, expandedGroupKey),
    [items, columnCount, expandedGroupKey]
  )

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index]
      const lone = row.length === 1 ? row[0] : null
      if (lone?.kind === 'group' && isExpandedGroup(lone, expandedGroupKey)) {
        return estimateExpandedGroupHeight(lone.members.length, columnCount, gridGap)
      }
      // Mixed rows (groups + LH86-style singles) still need full card height.
      // All-collapsed-group rows are short — wrong estimate causes measure churn.
      if (row.every((item) => item.kind === 'group')) {
        return COLLAPSED_GROUP_ROW_HEIGHT
      }
      return DEFAULT_ROW_HEIGHT
    },
    gap: gridGap,
    overscan: 4,
    scrollMargin,
  })

  return (
    <div ref={listRef} className="w-full min-w-0 overflow-x-clip">
      <div
        className="relative w-full max-w-full overflow-x-clip"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowItems = rows[virtualRow.index]
          const isExpandedGroupRow =
            rowItems.length === 1 && isExpandedGroup(rowItems[0], expandedGroupKey)

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full max-w-full grid items-stretch overflow-x-clip overflow-y-visible"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                columnGap: `${gridGap}px`,
                gridTemplateColumns: isExpandedGroupRow
                  ? 'minmax(0, 1fr)'
                  : `repeat(${columnCount}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((item) => (
                <div key={gridItemKey(item)} className="h-full min-h-0 min-w-0 max-w-full overflow-visible">
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
