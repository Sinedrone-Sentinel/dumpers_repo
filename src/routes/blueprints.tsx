import bluesPrints from '../data/Blueprints.json'
import { useQuery } from '@tanstack/react-query'

export function useBlueprintData() {
  return useQuery({
    queryKey: ['blueprints'],
    queryFn: () => {
      console.log('[useBlueprintData] Fetching blueprints...')
      return bluesPrints.blueprints
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 30,
    initialData: () => {
      console.log('[useBlueprintData] Using initial data')
      return bluesPrints.blueprints
    },
  })
}
