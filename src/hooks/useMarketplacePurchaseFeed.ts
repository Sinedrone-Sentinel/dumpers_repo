import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MarketplacePurchaseFeedRow } from '../lib/marketplaceAds'
import { useUiOverlayPaused } from '../contexts/UiOverlayContext'

const TOAST_VISIBLE_MS = 5_000
const SLIDE_MS = 200

export interface PurchaseToastState {
  row: MarketplacePurchaseFeedRow | null
  visible: boolean
  closing: boolean
  onDismiss: () => void
}

export function useMarketplacePurchaseFeed(enabled: boolean): PurchaseToastState {
  const paused = useUiOverlayPaused()
  const [queue, setQueue] = useState<MarketplacePurchaseFeedRow[]>([])
  const [active, setActive] = useState<MarketplacePurchaseFeedRow | null>(null)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const subscribedAtRef = useRef<string>(new Date().toISOString())
  const seenIdsRef = useRef(new Set<string>())
  const dismissTimerRef = useRef<number | null>(null)

  const enqueue = useCallback((row: MarketplacePurchaseFeedRow) => {
    if (seenIdsRef.current.has(row.id)) return
    seenIdsRef.current.add(row.id)
    if (row.created_at < subscribedAtRef.current) return
    setQueue((prev) => [...prev, row])
  }, [])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current)
    setClosing(true)
    setVisible(false)
    window.setTimeout(() => {
      setActive(null)
      setClosing(false)
    }, SLIDE_MS)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setQueue([])
      setActive(null)
      setVisible(false)
      return
    }

    subscribedAtRef.current = new Date().toISOString()

    const channel = supabase
      .channel('marketplace-purchase-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'marketplace_purchase_feed' },
        (payload) => {
          const row = payload.new as MarketplacePurchaseFeedRow
          enqueue(row)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, enqueue])

  useEffect(() => {
    if (!enabled || paused || active || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setActive(next)
    setClosing(false)
    setVisible(true)
    dismissTimerRef.current = window.setTimeout(() => dismiss(), TOAST_VISIBLE_MS)
  }, [enabled, paused, active, queue, dismiss])

  useEffect(() => {
    if (paused && visible) {
      dismiss()
    }
  }, [paused, visible, dismiss])

  useEffect(() => () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current)
  }, [])

  return {
    row: active,
    visible: visible && !paused,
    closing,
    onDismiss: dismiss,
  }
}

export const PURCHASE_TOAST_SLIDE_MS = SLIDE_MS
