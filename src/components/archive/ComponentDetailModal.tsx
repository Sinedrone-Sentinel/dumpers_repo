import React, { useMemo } from 'react'
import AppModal from '../layout/AppModal'
import { type ComponentData } from '../../hooks/useArchiveData'

interface ComponentDetailModalProps {
  component: ComponentData
  allComponents: ComponentData[]
  onClose: () => void
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  B: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  C: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  D: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
}

const CLASS_COLORS: Record<string, string> = {
  Military: 'text-red-300',
  Civilian: 'text-green-300',
  Stealth: 'text-purple-300',
  Competition: 'text-yellow-300',
  Industrial: 'text-orange-300',
}

function SimilarComponents({
  components,
  currentId,
  onSelect,
}: {
  components: ComponentData[]
  currentId: number
  onSelect: (c: ComponentData) => void
}) {
  if (components.length === 0) return null

  return (
    <div className="space-y-1">
      {components.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          disabled={c.id === currentId}
          className={`site-menu-item w-full justify-between py-1.5 px-2 ${
            c.id === currentId ? 'site-menu-item-active cursor-default' : ''
          }`}
        >
          <span className="text-sm text-white">{c.display_name}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${CLASS_COLORS[c.class] || 'text-slate-300'}`}>
              {c.class}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${GRADE_COLORS[c.grade] || GRADE_COLORS.D}`}>
              {c.grade}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function UpgradePath({
  components,
  currentGrade,
  onSelect,
}: {
  components: ComponentData[]
  currentGrade: string
  onSelect: (c: ComponentData) => void
}) {
  const gradeOrder = ['D', 'C', 'B', 'A']
  const sorted = [...components].sort(
    (a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade)
  )

  if (sorted.length <= 1) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sorted.map((c, idx) => (
        <React.Fragment key={c.id}>
          <button
            onClick={() => onSelect(c)}
            disabled={c.grade === currentGrade}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              c.grade === currentGrade
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                : 'site-filter-idle'
            }`}
          >
            Grade {c.grade}
          </button>
          {idx < sorted.length - 1 && (
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function ComponentDetailModal({
  component,
  allComponents,
  onClose,
}: ComponentDetailModalProps) {
  const _gradeClass = GRADE_COLORS[component.grade] || GRADE_COLORS.D
  const _classColor = CLASS_COLORS[component.class] || 'text-slate-300'

  // Find similar components (same type + size, different grade/class)
  const similarComponents = useMemo(() => {
    return allComponents.filter(
      (c) =>
        c.component_type === component.component_type &&
        c.size === component.size &&
        c.id !== component.id
    )
  }, [allComponents, component])

  // Find upgrade path (same type + size + class, different grades)
  const upgradePathComponents = useMemo(() => {
    return allComponents.filter(
      (c) =>
        c.component_type === component.component_type &&
        c.size === component.size &&
        c.class === component.class
    )
  }, [allComponents, component])

  const [selectedComponent, setSelectedComponent] = React.useState(component)

  // Update selected when prop changes
  React.useEffect(() => {
    setSelectedComponent(component)
  }, [component])

  const handleSelectComponent = (c: ComponentData) => {
    setSelectedComponent(c)
  }

  // Use the currently selected component for display
  const displayComponent = selectedComponent

  return (
    <AppModal
      title={displayComponent.display_name}
      subtitle={`${displayComponent.component_type} • Size ${displayComponent.size}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-6">
        {/* Header badges */}
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 text-sm font-bold rounded border ${GRADE_COLORS[displayComponent.grade] || GRADE_COLORS.D}`}>
            Grade {displayComponent.grade}
          </span>
          <span className={`text-sm font-medium ${CLASS_COLORS[displayComponent.class] || 'text-slate-300'}`}>
            {displayComponent.class}
          </span>
          <span className="text-sm text-slate-400">
            by {displayComponent.manufacturer}
          </span>
        </div>

        {/* Upgrade Path */}
        {upgradePathComponents.length > 1 && (
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Upgrade Path ({displayComponent.class})
            </h3>
            <div className="p-3 site-surface">
              <UpgradePath
                components={upgradePathComponents}
                currentGrade={displayComponent.grade}
                onSelect={handleSelectComponent}
              />
            </div>
          </div>
        )}

        {/* Similar Components */}
        {similarComponents.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Similar Components (Size {displayComponent.size} {displayComponent.component_type})
            </h3>
            <div className="p-3 site-surface max-h-[200px] overflow-y-auto">
              <SimilarComponents
                components={similarComponents}
                currentId={displayComponent.id}
                onSelect={handleSelectComponent}
              />
            </div>
          </div>
        )}

        {/* Full label / internal ID */}
        <div className="pt-2 site-divider">
          <div className="text-xs text-slate-600">
            Internal: {displayComponent.internal_id}
          </div>
        </div>
      </div>
    </AppModal>
  )
}
