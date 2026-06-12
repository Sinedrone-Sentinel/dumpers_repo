import { useState, useEffect, useMemo } from 'react'

interface BlueprintLookupEntry {
  internalName: string
  blueprintName: string
  categoryName: string
}

let blueprintCache: BlueprintLookupEntry[] | null = null
let blueprintByNameMap: Map<string, BlueprintLookupEntry> | null = null

export function useBlueprintLookup() {
  const [data, setData] = useState<BlueprintLookupEntry[]>(blueprintCache || [])
  const [loading, setLoading] = useState(!blueprintCache)

  useEffect(() => {
    if (blueprintCache) {
      setData(blueprintCache)
      setLoading(false)
      return
    }

    const fetchBlueprints = async () => {
      try {
        const response = await fetch('/data/Blueprints.json')
        const json = await response.json()
        
        const entries: BlueprintLookupEntry[] = (json.blueprints || []).map((bp: {
          internalName: string
          blueprintName: string
          categoryName: string
        }) => ({
          internalName: bp.internalName,
          blueprintName: bp.blueprintName,
          categoryName: bp.categoryName,
        }))

        blueprintCache = entries
        
        // Build lookup map
        blueprintByNameMap = new Map()
        for (const entry of entries) {
          // Use lowercase for case-insensitive matching
          blueprintByNameMap.set(entry.blueprintName.toLowerCase(), entry)
        }

        setData(entries)
      } catch (error) {
        console.error('Failed to load blueprints for lookup:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBlueprints()
  }, [])

  // Build the map from our data if not cached
  const byNameMap = useMemo(() => {
    if (blueprintByNameMap) return blueprintByNameMap
    
    const map = new Map<string, BlueprintLookupEntry>()
    for (const entry of data) {
      map.set(entry.blueprintName.toLowerCase(), entry)
    }
    return map
  }, [data])

  return {
    loading,
    
    // Look up a blueprint by the crafted item name (e.g., "Glacier")
    getBlueprintByItemName: (itemName: string): BlueprintLookupEntry | undefined => {
      return byNameMap.get(itemName.toLowerCase())
    },
    
    // Check if a blueprint exists for an item name
    hasBlueprintForItem: (itemName: string): boolean => {
      return byNameMap.has(itemName.toLowerCase())
    },
  }
}

// Standalone function for quick checks (requires cache to be populated)
export function getBlueprintForItem(itemName: string): BlueprintLookupEntry | undefined {
  return blueprintByNameMap?.get(itemName.toLowerCase())
}

export function hasBlueprintForItem(itemName: string): boolean {
  return blueprintByNameMap?.has(itemName.toLowerCase()) ?? false
}
