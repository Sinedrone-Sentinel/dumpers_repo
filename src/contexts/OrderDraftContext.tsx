import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'

const STORAGE_KEY = 'dumpers_order_draft'
const RESOURCE_STORAGE_KEY = 'dumpers_order_draft_resources'

export interface DraftOrderItem {
  cartKey: string
  blueprintId: string
  blueprintTitle: string
  slotQualities: Record<number, number>
  quantity: number
  unitDfpAuec: number
  lineDfpAuec: number
  addedAt: number
}

/** Catalog resource line (Wikelo gear, currency, commodities) added to the draft cart. */
export interface DraftResourceItem {
  cartKey: string
  resourceKey: string
  resourceLabel: string
  quantity: number
  addedAt: number
}

interface OrderDraftContextValue {
  draftItems: DraftOrderItem[]
  draftResourceItems: DraftResourceItem[]
  addToDraft: (item: Omit<DraftOrderItem, 'cartKey' | 'addedAt'>) => void
  addResourceToDraft: (item: Omit<DraftResourceItem, 'cartKey' | 'addedAt'>) => void
  updateDraftItem: (cartKey: string, updates: Partial<Omit<DraftOrderItem, 'cartKey' | 'addedAt'>>) => void
  removeFromDraft: (cartKey: string) => void
  clearDraft: () => void
  draftCount: number
  draftTotalDfp: number
}

const OrderDraftContext = createContext<OrderDraftContextValue | undefined>(undefined)

function generateCartKey(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readDraftFromStorage(): DraftOrderItem[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is DraftOrderItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.cartKey === 'string' &&
        typeof item.blueprintId === 'string' &&
        typeof item.blueprintTitle === 'string' &&
        typeof item.slotQualities === 'object' &&
        typeof item.quantity === 'number' &&
        typeof item.unitDfpAuec === 'number' &&
        typeof item.lineDfpAuec === 'number' &&
        typeof item.addedAt === 'number'
    )
  } catch {
    return []
  }
}

function writeDraftToStorage(items: DraftOrderItem[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage errors
  }
}

function readResourceDraftFromStorage(): DraftResourceItem[] {
  try {
    const stored = sessionStorage.getItem(RESOURCE_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is DraftResourceItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.cartKey === 'string' &&
        typeof item.resourceKey === 'string' &&
        typeof item.resourceLabel === 'string' &&
        typeof item.quantity === 'number' &&
        typeof item.addedAt === 'number'
    )
  } catch {
    return []
  }
}

function writeResourceDraftToStorage(items: DraftResourceItem[]): void {
  try {
    sessionStorage.setItem(RESOURCE_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage errors
  }
}

export function OrderDraftProvider({ children }: { children: React.ReactNode }) {
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>(() => readDraftFromStorage())
  const [draftResourceItems, setDraftResourceItems] = useState<DraftResourceItem[]>(() =>
    readResourceDraftFromStorage()
  )

  useEffect(() => {
    writeDraftToStorage(draftItems)
  }, [draftItems])

  useEffect(() => {
    writeResourceDraftToStorage(draftResourceItems)
  }, [draftResourceItems])

  const addToDraft = useCallback((item: Omit<DraftOrderItem, 'cartKey' | 'addedAt'>) => {
    const newItem: DraftOrderItem = {
      ...item,
      cartKey: generateCartKey(),
      addedAt: Date.now(),
    }
    setDraftItems((prev) => [...prev, newItem])
  }, [])

  const addResourceToDraft = useCallback(
    (item: Omit<DraftResourceItem, 'cartKey' | 'addedAt'>) => {
      setDraftResourceItems((prev) => {
        // Same item added again just bumps the quantity
        const existing = prev.find((row) => row.resourceKey === item.resourceKey)
        if (existing) {
          return prev.map((row) =>
            row.resourceKey === item.resourceKey
              ? { ...row, quantity: row.quantity + item.quantity }
              : row
          )
        }
        return [...prev, { ...item, cartKey: generateCartKey(), addedAt: Date.now() }]
      })
    },
    []
  )

  const updateDraftItem = useCallback(
    (cartKey: string, updates: Partial<Omit<DraftOrderItem, 'cartKey' | 'addedAt'>>) => {
      setDraftItems((prev) =>
        prev.map((item) =>
          item.cartKey === cartKey ? { ...item, ...updates } : item
        )
      )
    },
    []
  )

  const removeFromDraft = useCallback((cartKey: string) => {
    setDraftItems((prev) => prev.filter((item) => item.cartKey !== cartKey))
    setDraftResourceItems((prev) => prev.filter((item) => item.cartKey !== cartKey))
  }, [])

  const clearDraft = useCallback(() => {
    setDraftItems([])
    setDraftResourceItems([])
  }, [])

  const draftCount = useMemo(
    () =>
      draftItems.reduce((sum, item) => sum + item.quantity, 0) +
      draftResourceItems.reduce((sum, item) => sum + item.quantity, 0),
    [draftItems, draftResourceItems]
  )

  const draftTotalDfp = useMemo(
    () => draftItems.reduce((sum, item) => sum + item.lineDfpAuec, 0),
    [draftItems]
  )

  const value: OrderDraftContextValue = useMemo(
    () => ({
      draftItems,
      draftResourceItems,
      addToDraft,
      addResourceToDraft,
      updateDraftItem,
      removeFromDraft,
      clearDraft,
      draftCount,
      draftTotalDfp,
    }),
    [
      draftItems,
      draftResourceItems,
      addToDraft,
      addResourceToDraft,
      updateDraftItem,
      removeFromDraft,
      clearDraft,
      draftCount,
      draftTotalDfp,
    ]
  )

  return (
    <OrderDraftContext.Provider value={value}>
      {children}
    </OrderDraftContext.Provider>
  )
}

export function useOrderDraft(): OrderDraftContextValue {
  const context = useContext(OrderDraftContext)
  if (context === undefined) {
    throw new Error('useOrderDraft must be used within an OrderDraftProvider')
  }
  return context
}
