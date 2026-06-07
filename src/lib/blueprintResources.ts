export interface BlueprintRequirementOption {
  type?: string
  resourceName?: string
  entityName?: string
}

export interface BlueprintSlot {
  options?: BlueprintRequirementOption[]
}

export interface BlueprintWithSlots {
  blueprintName?: string
  file?: string
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
