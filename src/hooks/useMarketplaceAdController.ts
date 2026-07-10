import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  fetchMarketplaceAdCandidates,
  fulfillmentHighlightPath,
  isMarketplaceAdValid,
  recordMarketplaceAdAction,
  type MarketplaceAdCandidate,
} from '../lib/marketplaceAds'
import { useUiOverlayPaused } from '../contexts/UiOverlayContext'

const BOOTSTRAP_MS = 30_000
const SHOW_IDLE_MS = 2 * 60_000
const COOLDOWN_MIN_MS = 10 * 60_000
const COOLDOWN_MAX_MS = 15 * 60_000

export type AdControllerPhase = 'off' | 'bootstrapping' | 'idle' | 'fetching' | 'showing' | 'paused'

export interface MarketplaceAdControllerState {
  phase: AdControllerPhase
  candidate: MarketplaceAdCandidate | null
  visible: boolean
  closing: boolean
  onClose: () => void
  onNotInterested: () => void
  onDontShowAgain: () => void
  onOohGimme: () => void
  onOpenSettings: () => void
}

let sessionCache: MarketplaceAdCandidate[] = []

function randomCooldownMs() {
  return COOLDOWN_MIN_MS + Math.floor(Math.random() * (COOLDOWN_MAX_MS - COOLDOWN_MIN_MS + 1))
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)] ?? null
}

interface UseMarketplaceAdControllerOptions {
  enabled: boolean
  onOpenSettings: () => void
}

export function useMarketplaceAdController({
  enabled,
  onOpenSettings,
}: UseMarketplaceAdControllerOptions): MarketplaceAdControllerState {
  const navigate = useNavigate()
  const paused = useUiOverlayPaused()
  const [phase, setPhase] = useState<AdControllerPhase>(enabled ? 'bootstrapping' : 'off')
  const [candidate, setCandidate] = useState<MarketplaceAdCandidate | null>(null)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  const idleTimerRef = useRef<number | null>(null)
  const cooldownTimerRef = useRef<number | null>(null)
  const bootstrapTimerRef = useRef<number | null>(null)
  const activityRef = useRef(0)

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current)
    if (bootstrapTimerRef.current) window.clearTimeout(bootstrapTimerRef.current)
    idleTimerRef.current = null
    cooldownTimerRef.current = null
    bootstrapTimerRef.current = null
  }, [])

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    if (!visible || paused) return
    idleTimerRef.current = window.setTimeout(() => {
      void (async () => {
        if (candidate) {
          await recordMarketplaceAdAction(candidate.order_id, 'not_interested')
        }
        setClosing(true)
        setVisible(false)
        setCandidate(null)
        setPhase('idle')
        cooldownTimerRef.current = window.setTimeout(() => {
          setPhase('fetching')
        }, randomCooldownMs())
      })()
    }, SHOW_IDLE_MS)
  }, [visible, paused, candidate])

  const startCooldown = useCallback(() => {
    setPhase('idle')
    cooldownTimerRef.current = window.setTimeout(() => {
      setPhase('fetching')
    }, randomCooldownMs())
  }, [])

  const closeAd = useCallback(() => {
    setClosing(true)
    setVisible(false)
    if (candidate) {
      sessionCache = sessionCache.filter((c) => c.order_id !== candidate.order_id)
    }
    setCandidate(null)
    startCooldown()
  }, [candidate, startCooldown])

  const showNext = useCallback(async () => {
    if (!enabled || paused) return

    if (sessionCache.length === 0) {
      const { data, error } = await fetchMarketplaceAdCandidates()
      if (error || data.length === 0) {
        startCooldown()
        return
      }
      sessionCache = [...data]
    }

    let attempts = sessionCache.length
    while (attempts > 0) {
      const pick = pickRandom(sessionCache)
      if (!pick) break
      sessionCache = sessionCache.filter((c) => c.order_id !== pick.order_id)
      const valid = await isMarketplaceAdValid(pick.order_id)
      if (valid) {
        setCandidate(pick)
        setClosing(false)
        setVisible(true)
        setPhase('showing')
        activityRef.current = Date.now()
        resetIdleTimer()
        return
      }
      attempts -= 1
    }

    startCooldown()
  }, [enabled, paused, resetIdleTimer, startCooldown])

  useEffect(() => {
    if (!enabled) {
      clearTimers()
      setPhase('off')
      setVisible(false)
      setCandidate(null)
      return
    }

    if (paused) {
      clearTimers()
      if (visible) {
        setVisible(false)
        setClosing(false)
        setCandidate(null)
      }
      setPhase('paused')
      return
    }

    if (phase === 'paused') {
      setPhase('bootstrapping')
      bootstrapTimerRef.current = window.setTimeout(() => {
        setPhase('fetching')
      }, BOOTSTRAP_MS)
    }
  }, [enabled, paused, phase, visible, clearTimers])

  useEffect(() => {
    if (!enabled || paused) return

    if (phase === 'bootstrapping') {
      bootstrapTimerRef.current = window.setTimeout(() => {
        setPhase('fetching')
      }, BOOTSTRAP_MS)
      return () => {
        if (bootstrapTimerRef.current) window.clearTimeout(bootstrapTimerRef.current)
      }
    }

    if (phase === 'fetching') {
      void showNext()
    }
  }, [phase, enabled, paused, showNext])

  useEffect(() => () => clearTimers(), [clearTimers])

  const bumpActivity = useCallback(() => {
    activityRef.current = Date.now()
    resetIdleTimer()
  }, [resetIdleTimer])

  const onNotInterested = useCallback(() => {
    if (!candidate) return
    bumpActivity()
    void (async () => {
      await recordMarketplaceAdAction(candidate.order_id, 'not_interested')
      closeAd()
    })()
  }, [candidate, bumpActivity, closeAd])

  const onDontShowAgain = useCallback(() => {
    if (!candidate) return
    bumpActivity()
    void (async () => {
      await recordMarketplaceAdAction(candidate.order_id, 'dont_show_again')
      closeAd()
    })()
  }, [candidate, bumpActivity, closeAd])

  const onOohGimme = useCallback(() => {
    if (!candidate) return
    bumpActivity()
    void (async () => {
      await recordMarketplaceAdAction(candidate.order_id, 'ooh_gimme')
      setVisible(false)
      setClosing(true)
      setCandidate(null)
      startCooldown()
      void navigate({ to: fulfillmentHighlightPath(candidate.order_id) })
    })()
  }, [candidate, bumpActivity, navigate, startCooldown])

  return {
    phase,
    candidate,
    visible,
    closing,
    onClose: closeAd,
    onNotInterested,
    onDontShowAgain,
    onOohGimme,
    onOpenSettings,
  }
}

export function clearMarketplaceAdSessionCache() {
  sessionCache = []
}
