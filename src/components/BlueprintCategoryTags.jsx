import {
  BLUEPRINT_TAG_CHIP_CLASS,
  getBlueprintDisplayTags,
} from '../lib/blueprintTaxonomy'
import {
  formatComponentItemClass,
  getComponentGrade,
  getComponentItemClass,
} from '../lib/blueprintSpec'

const SIZE_CLASS = {
  sm: 'px-1.5 py-0.5 rounded text-[10px] border',
  md: 'px-2.5 py-1 rounded-lg text-sm border',
}

export default function BlueprintCategoryTags({ blueprint, size = 'sm', className = '' }) {
  const tags = [...getBlueprintDisplayTags(blueprint)]
  const isVehicleComponent = (blueprint.categoryName || '').startsWith('Veh. Comp.')
  if (isVehicleComponent) {
    const itemClass = getComponentItemClass(blueprint)
    if (itemClass) {
      tags.push({ kind: 'itemClass', label: formatComponentItemClass(itemClass) })
    }
    const grade = getComponentGrade(blueprint)
    if (grade) {
      tags.push({ kind: 'grade', label: grade })
    }
  }
  if (!tags.length) return null

  return (
    <div className={`flex flex-wrap gap-1 ${className}`.trim()}>
      {tags.map((tag) => (
        <span
          key={`${tag.kind}-${tag.label}`}
          className={`${SIZE_CLASS[size]} ${BLUEPRINT_TAG_CHIP_CLASS[tag.kind]}`}
        >
          {tag.label}
        </span>
      ))}
    </div>
  )
}
