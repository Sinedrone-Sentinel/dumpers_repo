export interface BlueprintRequirementOption {
  type?: string
  resourceName?: string
  entityName?: string
}

export interface BlueprintSlot {
  requiredCount?: number
  options?: BlueprintRequirementOption[]
}

export interface BlueprintWithSlots {
  blueprintName?: string
  file?: string
  categoryName?: string
  subCategoryName?: string
  slots?: BlueprintSlot[]
}

export interface ExtractedBlueprintResource {
  resourceKey: string
  label: string
}

export function slugifyResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function extractBlueprintResources(
  blueprints: BlueprintWithSlots[]
): ExtractedBlueprintResource[] {
  const byKey = new Map<string, ExtractedBlueprintResource>()

  for (const blueprint of blueprints) {
    for (const slot of blueprint.slots ?? []) {
      for (const option of slot.options ?? []) {
        const label = option.resourceName || option.entityName
        if (!label) continue

        const resourceKey = slugifyResourceName(label)
        if (!resourceKey) continue

        if (!byKey.has(resourceKey)) {
          byKey.set(resourceKey, { resourceKey, label })
        }
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function buildResourceLabelMap(
  catalog: { resource_key: string; label: string }[]
): Record<string, string> {
  return Object.fromEntries(catalog.map((row) => [row.resource_key, row.label]))
}

export function getResourceLabel(
  resourceKey: string,
  labelMap: Record<string, string>
): string {
  return labelMap[resourceKey] ?? resourceKey
}

export interface BlueprintOrderLineItem {
  resourceKey: string
  label: string
  quantity: number
}

/** Derive resource line items from blueprint slots × order quantity. */
export function extractOrderLineItemsFromBlueprint(
  blueprint: BlueprintWithSlots,
  orderQuantity: number
): BlueprintOrderLineItem[] {
  const qty = Math.max(1, orderQuantity)
  const totals = new Map<string, BlueprintOrderLineItem>()

  for (const slot of blueprint.slots ?? []) {
    const slotCount = slot.requiredCount ?? 1
    for (const option of slot.options ?? []) {
      const label = option.resourceName || option.entityName
      if (!label) continue

      const resourceKey = slugifyResourceName(label)
      if (!resourceKey) continue

      const addQty = slotCount * qty
      const existing = totals.get(resourceKey)
      if (existing) {
        existing.quantity += addQty
      } else {
        totals.set(resourceKey, { resourceKey, label, quantity: addQty })
      }
    }
  }

  return [...totals.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Aggregate resource lines across multiple blueprint × quantity rows. */
export function extractOrderLineItemsFromBlueprints(
  lines: { blueprint: BlueprintWithSlots; quantity: number }[]
): BlueprintOrderLineItem[] {
  const totals = new Map<string, BlueprintOrderLineItem>()

  for (const { blueprint, quantity } of lines) {
    for (const item of extractOrderLineItemsFromBlueprint(blueprint, quantity)) {
      const existing = totals.get(item.resourceKey)
      if (existing) {
        existing.quantity += item.quantity
      } else {
        totals.set(item.resourceKey, { ...item })
      }
    }
  }

  return [...totals.values()].sort((a, b) => a.label.localeCompare(b.label))
}
