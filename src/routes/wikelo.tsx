import gameWikeloTrades from '../data/game-wikelo-trades.json'
import { useQuery } from '@tanstack/react-query'

export interface WikeloTradeCost {
  entityClass?: string
  resourceName?: string
  name: string
  amount?: number
  scu?: number
}

export interface WikeloTradeReward {
  entityClass: string
  name: string
  amount: number
  kind: 'item' | 'vehicle'
}

export interface WikeloStanding {
  name: string
  minReputation: number
}

export interface WikeloTrade {
  id: string
  debugName: string
  title: string
  description: string | null
  category: 'vehicle' | 'gear' | 'favor' | 'intro' | 'food'
  subCategory: string
  costs: WikeloTradeCost[]
  rewards: WikeloTradeReward[]
  blueprintPools: string[]
  repReward: number
  minStanding: WikeloStanding | null
  maxStanding: WikeloStanding | null
  requiresIntro: boolean
  maxPerPlayer: number | null
  isVehicleReward: boolean
}

const trades = gameWikeloTrades.trades as WikeloTrade[]

export const WIKELO_FACTION_NAME = 'Wikelo Emporium'

export function useWikeloTrades() {
  return useQuery({
    queryKey: ['wikelo-trades'],
    queryFn: () => trades,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 30,
    initialData: () => trades,
  })
}
