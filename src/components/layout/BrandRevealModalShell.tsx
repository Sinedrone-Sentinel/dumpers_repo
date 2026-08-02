import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import BrandModalBack from '../BrandModalBack'
import { useAuth } from '../../contexts/AuthContext'
import { preloadOrgLogoCandidates } from '../../lib/orgLogo'
import AppModal, { type AppModalSize, type AppModalZIndex } from './AppModal'

const sizeMaxWidth: Record<AppModalSize, number> = {
  sm: 448,
  md: 512,
  lg: 576,
  xl: 1024,
  '2xl': 896,
  '3xl': 1280,
}

const zIndexClasses: Record<AppModalZIndex, string> = {
  60: 'z-[60]',
  70: 'z-[70]',
  80: 'z-[80]',
}

const FLIP_EASE = [0.32, 0.72, 0, 1] as const
const EXPAND_EASE = [0.22, 1, 0.36, 1] as const
const BLINDS_EASE = [0.22, 1, 0.36, 1] as const
const WORMHOLE_EASE = [0.55, 0, 1, 0.45] as const
/** Shrink stays visible; opacity only dips at the end. */
const WORMHOLE_SHRINK_EASE = [0.42, 0, 0.58, 1] as const
const WORMHOLE_MIN_SCALE = 0.1

const BRAND_GRADIENT =
  'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #ea580c 100%)'

/**
 * Open sequence (strictly one-by-one):
 * 1. flip — card flips in-place at click origin, Black Star on back
 * 2. expand — branded card zooms to screen center
 * 3. blinds-open — side wipes reveal detail panel
 * 4. ready — interactive
 */
const TIMING = {
  backdropIn: 0.18,
  flipInPlace: 0.6,
  expandToCenter: 0.5,
  blindsIn: 0.8,
  wormholeOut: 0.72,
  backdropOut: 0.22,
} as const

/** Matches AppModal lg — top inset + fill remaining viewport. */
const MODAL_TOP_VH = 0.05
const MODAL_HEIGHT_VH = 0.9

const backFaceStyle: React.CSSProperties = {
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
  transform: 'rotateY(180deg) translateZ(1px)',
}

const frontFaceStyle: React.CSSProperties = {
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
  transform: 'translateZ(1px)',
}

type ModalStage = 'flip' | 'expand' | 'blinds-open' | 'ready' | 'wormhole-close'

export interface BrandRevealModalShellProps {
  title: string
  subtitle?: string
  onClose: () => void
  originRect: DOMRect | null
  size?: AppModalSize
  zIndex?: AppModalZIndex
  children: React.ReactNode
  footer?: React.ReactNode
  headerExtra?: React.ReactNode
  closeOnBackdrop?: boolean
  titleId?: string
}

function readTickerHeightPx(): number {
  if (typeof document === 'undefined') return 0
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--site-ticker-height')
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

function readHeaderHeightPx(): number {
  if (typeof document === 'undefined') return 56
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--site-header-height')
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 56
}

function computeTargetRect(size: AppModalSize) {
  const marginX = 16
  const header = readHeaderHeightPx()
  const marginTop = Math.max(12, header + 8, window.innerHeight * MODAL_TOP_VH)
  const ticker = readTickerHeightPx()
  const marginBottom = Math.max(16, ticker + 12)
  const maxW = sizeMaxWidth[size] ?? 576
  const width = Math.min(maxW, window.innerWidth - marginX * 2)
  const left = Math.max(marginX, (window.innerWidth - width) / 2)
  const available = window.innerHeight - marginTop - marginBottom
  const ideal = window.innerHeight * MODAL_HEIGHT_VH
  const height = Math.max(240, Math.min(ideal, available))
  return { top: marginTop, left, width, height }
}

function pickRandomWormholeTarget(rect: { top: number; left: number; width: number; height: number }) {
  const inset = 32
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const targetX = inset + Math.random() * (window.innerWidth - inset * 2)
  const targetY = inset + Math.random() * (window.innerHeight - inset * 2)
  return { x: targetX - centerX, y: targetY - centerY }
}

function rectToBox(rect: { top: number; left: number; width: number; height: number }) {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function isOriginUsable(originRect: DOMRect | null): originRect is DOMRect {
  if (!originRect) return false
  return originRect.width > 0 && originRect.height > 0
}

function ms(seconds: number): number {
  return Math.round(seconds * 1000)
}

export default function BrandRevealModalShell({
  title,
  subtitle,
  onClose,
  originRect,
  size = 'md',
  zIndex = 70,
  children,
  footer,
  headerExtra,
  closeOnBackdrop = true,
  titleId: titleIdProp,
}: BrandRevealModalShellProps) {
  const reducedMotion = usePrefersReducedMotion()
  const generatedId = useId()
  const titleId = titleIdProp ?? generatedId

  if (reducedMotion || !isOriginUsable(originRect)) {
    return (
      <AppModal
        title={title}
        subtitle={subtitle}
        onClose={onClose}
        size={size}
        zIndex={zIndex}
        footer={footer}
        headerExtra={headerExtra}
        closeOnBackdrop={closeOnBackdrop}
        titleId={titleId}
      >
        {children}
      </AppModal>
    )
  }

  return (
    <BrandRevealAnimatedModal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      originRect={originRect}
      size={size}
      zIndex={zIndex}
      footer={footer}
      headerExtra={headerExtra}
      closeOnBackdrop={closeOnBackdrop}
      titleId={titleId}
    >
      {children}
    </BrandRevealAnimatedModal>
  )
}

function BrandRevealAnimatedModal({
  title,
  subtitle,
  onClose,
  originRect,
  size,
  zIndex,
  children,
  footer,
  headerExtra,
  closeOnBackdrop,
  titleId,
}: BrandRevealModalShellProps & { originRect: DOMRect; titleId: string }) {
  const { orgLogoUpdatedAt } = useAuth()
  const [stage, setStage] = useState<ModalStage>('flip')
  const [wormholeTarget, setWormholeTarget] = useState({ x: 0, y: 0 })
  const originRef = useRef(originRect)
  originRef.current = originRect

  const targetRect = useMemo(() => computeTargetRect(size ?? 'md'), [size])

  const originBox = useMemo(() => rectToBox(originRef.current), [])
  const interactive = stage === 'ready'

  useBodyScrollLock(true)

  useEffect(() => {
    preloadOrgLogoCandidates(orgLogoUpdatedAt)
  }, [orgLogoUpdatedAt])

  useEffect(() => {
    if (stage === 'flip') {
      const timer = window.setTimeout(() => setStage('expand'), ms(TIMING.flipInPlace))
      return () => window.clearTimeout(timer)
    }
    if (stage === 'expand') {
      const timer = window.setTimeout(() => setStage('blinds-open'), ms(TIMING.expandToCenter))
      return () => window.clearTimeout(timer)
    }
    if (stage === 'blinds-open') {
      const timer = window.setTimeout(() => setStage('ready'), ms(TIMING.blindsIn))
      return () => window.clearTimeout(timer)
    }
    if (stage === 'wormhole-close') {
      const timer = window.setTimeout(
        () => onClose(),
        ms(TIMING.wormholeOut + TIMING.backdropOut * 0.5)
      )
      return () => window.clearTimeout(timer)
    }
  }, [stage, onClose])

  const requestClose = useCallback(() => {
    if (stage !== 'ready') return
    setWormholeTarget(pickRandomWormholeTarget(targetRect))
    setStage('wormhole-close')
  }, [stage, targetRect])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stage === 'ready') {
        event.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stage, requestClose])

  const showFlipCard = stage === 'flip' || stage === 'expand'
  const showModal = stage === 'blinds-open' || stage === 'ready' || stage === 'wormhole-close'
  const showBlinds = stage === 'blinds-open'
  const closing = stage === 'wormhole-close'

  const flipCardBox = stage === 'flip' ? originBox : targetRect

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClasses[zIndex ?? 70]} flex items-start justify-center overflow-hidden p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <motion.div
        className="absolute inset-0 bg-black/85"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{
          duration: closing ? TIMING.backdropOut : TIMING.backdropIn,
          delay: closing ? TIMING.wormholeOut * 0.88 : 0,
        }}
        onClick={closeOnBackdrop && interactive ? requestClose : undefined}
      />

      {showFlipCard && (
        <motion.div
          className="fixed pointer-events-none z-[62]"
          style={{ perspective: 1200, transformStyle: 'preserve-3d' }}
          initial={originBox}
          animate={flipCardBox}
          transition={{
            duration: stage === 'flip' ? 0 : TIMING.expandToCenter,
            ease: EXPAND_EASE,
          }}
        >
          <motion.div
            className="relative w-full h-full"
            style={{ transformStyle: 'preserve-3d' }}
            initial={{ rotateY: 0 }}
            animate={{ rotateY: 180 }}
            transition={{
              duration: stage === 'flip' ? TIMING.flipInPlace : 0,
              ease: FLIP_EASE,
            }}
          >
            <div
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 shadow-2xl"
              style={frontFaceStyle}
            />
            <div className="absolute inset-0" style={backFaceStyle}>
              <BrandModalBack className="w-full h-full rounded-2xl border-0" />
            </div>
          </motion.div>
        </motion.div>
      )}

      {showModal && (
        <motion.div
          className="fixed z-[60] pointer-events-auto"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            maxHeight: targetRect.height,
            transformOrigin: 'center center',
          }}
          initial={false}
          animate={
            closing
              ? {
                  scale: WORMHOLE_MIN_SCALE,
                  opacity: 0,
                  rotate: -540,
                  x: wormholeTarget.x,
                  y: wormholeTarget.y,
                }
              : {
                  scale: 1,
                  opacity: 1,
                  rotate: 0,
                  x: 0,
                  y: 0,
                }
          }
          transition={
            closing
              ? {
                  scale: { duration: TIMING.wormholeOut, ease: WORMHOLE_SHRINK_EASE },
                  x: { duration: TIMING.wormholeOut, ease: WORMHOLE_SHRINK_EASE },
                  y: { duration: TIMING.wormholeOut, ease: WORMHOLE_SHRINK_EASE },
                  rotate: { duration: TIMING.wormholeOut, ease: WORMHOLE_SHRINK_EASE },
                  opacity: {
                    duration: 0.1,
                    delay: TIMING.wormholeOut * 0.88,
                    ease: 'easeIn',
                  },
                }
              : {
                  duration: TIMING.wormholeOut,
                  ease: WORMHOLE_EASE,
                }
          }
        >
          <div
            className={`site-modal-shell w-full h-full ${closing ? 'pointer-events-none' : ''}`}
            style={{
              height: targetRect.height,
              maxHeight: targetRect.height,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex flex-col flex-1 min-h-0 min-w-0">
              <div className="flex items-start justify-between gap-3 p-3 sm:p-4 border-b border-orange-500/15 shrink-0">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-lg font-bold text-white leading-snug">
                    {title}
                  </h2>
                  {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
                </div>
                <button
                  type="button"
                  onClick={interactive ? requestClose : undefined}
                  className="text-slate-400 hover:text-white text-xl leading-none shrink-0 disabled:opacity-40"
                  aria-label="Close"
                  disabled={!interactive}
                >
                  ×
                </button>
              </div>

              {headerExtra}

              <div className="p-3 sm:p-4 overflow-y-auto overflow-x-auto overscroll-contain flex-1 min-h-0 min-w-0">
                {children}
              </div>

              {footer && (
                <div className="p-3 sm:p-4 border-t border-orange-500/15 shrink-0 bg-black/20">
                  {footer}
                </div>
              )}

              {showBlinds && (
                <div className="absolute inset-0 z-20 flex pointer-events-none overflow-hidden rounded-2xl">
                  <motion.div
                    className="w-1/2 h-full border-r border-orange-500/20"
                    style={{ background: BRAND_GRADIENT }}
                    initial={{ x: '0%' }}
                    animate={{ x: '-100%' }}
                    transition={{ duration: TIMING.blindsIn, ease: BLINDS_EASE }}
                  />
                  <motion.div
                    className="w-1/2 h-full border-l border-orange-500/20"
                    style={{ background: BRAND_GRADIENT }}
                    initial={{ x: '0%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: TIMING.blindsIn, ease: BLINDS_EASE }}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>,
    document.body,
  )
}
