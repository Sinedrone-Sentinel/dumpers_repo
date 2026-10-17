import {
  formatComponentItemClass,
  getComponentGrade,
  getComponentItemClass,
} from './blueprintSpec'
import {
  getBlueprintDisplayTags,
  type BlueprintDisplayTag,
  type BlueprintTaxonomyInput,
} from './blueprintTaxonomy'

export interface BlueprintTagRequirement {
  family: string
  required: number
}

/** Tag minimum for a listed blueprint family. Null when the family has no minimum. */
export function blueprintTagRequirement(
  bp: { categoryName?: string | null },
): BlueprintTagRequirement | null {
  const cat = bp.categoryName ?? ''
  if (cat === 'FPSWeapons' || cat === 'Ammo') {
    return { family: 'FPS Weapons and Ammo', required: 2 }
  }
  if (cat === 'FPSArmours') return { family: 'FPS Armour', required: 4 }
  if (cat.startsWith('Veh. Weapons')) return { family: 'Vehicle Weapons', required: 3 }
  if (cat.startsWith('Veh. Comp.')) return { family: 'Vehicle Components', required: 5 }
  if (cat.startsWith('Ind. Comp.')) return { family: 'Industrial Components', required: 3 }
  return null
}

/**
 * Every chip a member can see on a blueprint card.
 * Vehicle Components add class and grade. Industrial Components add grade only.
 */
export function collectBlueprintCategoryTags(bp: BlueprintTaxonomyInput): BlueprintDisplayTag[] {
  const tags = [...getBlueprintDisplayTags(bp)]
  const cat = bp.categoryName ?? ''
  if (cat.startsWith('Veh. Comp.')) {
    const itemClass = getComponentItemClass(bp)
    if (itemClass) {
      tags.push({ kind: 'itemClass', label: formatComponentItemClass(itemClass) })
    }
    const grade = getComponentGrade(bp)
    if (grade) tags.push({ kind: 'grade', label: grade })
  } else if (cat.startsWith('Ind. Comp.')) {
    const grade = getComponentGrade(bp)
    if (grade) tags.push({ kind: 'grade', label: grade })
  }
  return tags
}
