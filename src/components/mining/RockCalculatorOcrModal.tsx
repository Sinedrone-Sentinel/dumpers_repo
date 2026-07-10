import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppModal from '../layout/AppModal'
import { isRsTrackerOre } from '../../lib/miningOreCanonical'
import {
  initialOcrCropRect,
  resolveOcrCropForImage,
  writeSavedOcrCropRect,
} from '../../lib/rockCalculatorOcrCropState'
import {
  loadImageFromFile,
  processRockScanCrop,
  terminateOcrWorker,
  type NormalizedCropRect,
} from '../../lib/rockCalculatorOcr'
import type { RockScanOcrResult } from '../../lib/rockCalculatorOcrParse'

interface LoadedImage {
  image: HTMLImageElement
  objectUrl: string
  width: number
  height: number
}

interface DisplayRect {
  left: number
  top: number
  width: number
  height: number
}

interface RockCalculatorOcrModalProps {
  onClose: () => void
  onApply: (result: RockScanOcrResult) => void
}

type DragMode = 'move' | 'resize-se' | null

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function computeContainRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): DisplayRect {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  }
}

function displayToNormalized(
  cropPx: { x: number; y: number; width: number; height: number },
  display: DisplayRect
): NormalizedCropRect {
  const x = clamp((cropPx.x - display.left) / display.width, 0, 1)
  const y = clamp((cropPx.y - display.top) / display.height, 0, 1)
  const width = clamp(cropPx.width / display.width, 0.02, 1 - x)
  const height = clamp(cropPx.height / display.height, 0.02, 1 - y)
  return { x, y, width, height }
}

function normalizedToDisplay(crop: NormalizedCropRect, display: DisplayRect) {
  return {
    x: display.left + crop.x * display.width,
    y: display.top + crop.y * display.height,
    width: crop.width * display.width,
    height: crop.height * display.height,
  }
}

const OCR_PREVIEW_IMAGE_CLASS =
  'absolute pointer-events-none select-none max-w-none [image-rendering:-webkit-optimize-contrast]'

export default function RockCalculatorOcrModal({ onClose, onApply }: RockCalculatorOcrModalProps) {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)
  const [crop, setCrop] = useState<NormalizedCropRect>(initialOcrCropRect)
  const [deskewDegrees, setDeskewDegrees] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorHints, setErrorHints] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const cropRef = useRef(crop)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    startCropPx: { x: number; y: number; width: number; height: number }
  } | null>(null)

  useEffect(() => {
    cropRef.current = crop
  }, [crop])

  const clearImage = useCallback(() => {
    setLoaded((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl)
      return null
    })
  }, [])

  const handleClose = useCallback(() => {
    clearImage()
    void terminateOcrWorker()
    onClose()
  }, [clearImage, onClose])

  useEffect(() => {
    return () => {
      clearImage()
      void terminateOcrWorker()
    }
  }, [clearImage])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [loaded])

  const displayRect = useMemo(() => {
    if (!loaded) return { left: 0, top: 0, width: 0, height: 0 }
    return computeContainRect(containerSize.width, containerSize.height, loaded.width, loaded.height)
  }, [loaded, containerSize])

  const cropPx = useMemo(
    () => normalizedToDisplay(crop, displayRect),
    [crop, displayRect]
  )

  const cropImageStyle = useMemo(() => {
    if (!displayRect.width || !cropPx.width) return null

    const imageLeft = displayRect.left - cropPx.x
    const imageTop = displayRect.top - cropPx.y

    return {
      width: displayRect.width,
      height: displayRect.height,
      left: imageLeft,
      top: imageTop,
      transformOrigin: `${cropPx.width / 2 - imageLeft}px ${cropPx.height / 2 - imageTop}px`,
      transform: `rotate(${deskewDegrees}deg)`,
    }
  }, [cropPx, deskewDegrees, displayRect])

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (!item.type.startsWith('image/')) continue
        event.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        setError(null)
        setErrorHints([])
        setProgress(null)
        setDeskewDegrees(0)
        clearImage()
        try {
          const next = await loadImageFromFile(file)
          setLoaded(next)
          setCrop(resolveOcrCropForImage(next.width, next.height))
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load pasted image.')
        }
        return
      }
    },
    [clearImage]
  )

  const startDrag = (mode: DragMode, clientX: number, clientY: number) => {
    if (!displayRect.width || !displayRect.height) return
    dragRef.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startCropPx: { ...cropPx },
    }
  }

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current
      if (!drag || !displayRect.width || !displayRect.height) return

      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      const minSize = 24
      const next = { ...drag.startCropPx }

      if (drag.mode === 'move') {
        next.x = clamp(next.x + dx, displayRect.left, displayRect.left + displayRect.width - next.width)
        next.y = clamp(next.y + dy, displayRect.top, displayRect.top + displayRect.height - next.height)
      } else if (drag.mode === 'resize-se') {
        next.width = clamp(next.width + dx, minSize, displayRect.left + displayRect.width - next.x)
        next.height = clamp(next.height + dy, minSize, displayRect.top + displayRect.height - next.y)
      }

      setCrop(displayToNormalized(next, displayRect))
    }

    const onUp = () => {
      if (dragRef.current) {
        writeSavedOcrCropRect(cropRef.current)
      }
      dragRef.current = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [displayRect, cropPx])

  const handleProcess = async () => {
    if (!loaded) {
      setError('Paste a screenshot first (Ctrl+V).')
      return
    }

    setProcessing(true)
    setError(null)
    setErrorHints([])
    setProgress('Preparing image…')

    try {
      setProgress('Running OCR…')
      const parsed = await processRockScanCrop(
        loaded.image,
        loaded.width,
        loaded.height,
        crop,
        deskewDegrees
      )
      if (!parsed.ok) {
        setError(parsed.error)
        setErrorHints(parsed.hints ?? [])
        return
      }

      if (!isRsTrackerOre(parsed.data.primaryOreName)) {
        setError(
          `Could not match the scanned primary ore to an RS Tracker ore — check your crop or pick the ore manually after closing.`
        )
        setErrorHints([])
        return
      }

      onApply(parsed.data)
      clearImage()
      void terminateOcrWorker()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed — try adjusting the crop box.')
      setErrorHints([])
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  return (
    <AppModal
      title="Scanner OCR"
      subtitle="Paste your fracture HUD screenshot, crop SCAN RESULTS, then Process"
      size="3xl"
      bodyClassName="flex flex-col overflow-hidden"
      onClose={handleClose}
      footer={
        <div className="space-y-2">
          {(progress || error || errorHints.length > 0) && (
            <div className="rounded-md border border-slate-700/80 bg-slate-950/60 px-3 py-2 space-y-1">
              {progress ? <p className="text-[11px] text-amber-300/90">{progress}</p> : null}
              {error ? <p className="text-[11px] text-red-400 leading-snug">{error}</p> : null}
              {errorHints.map((hint) => (
                <p key={hint} className="text-[11px] text-amber-200/90 leading-snug">
                  {hint}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-slate-500 leading-snug">
              Preview is scaled for cropping; OCR reads the full-resolution paste ({loaded ? `${loaded.width}×${loaded.height}` : 'paste to see size'}).
              Screenshot is discarded after scan; crop box is remembered on this device.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleProcess()}
                disabled={!loaded || processing}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-orange-600/90 text-white hover:bg-orange-500 disabled:opacity-40"
              >
                {processing ? 'Processing…' : 'Process'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2" onPaste={(e) => void handlePaste(e)}>
        <div
          tabIndex={0}
          className="shrink-0 rounded-lg border border-dashed border-slate-600 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-400 outline-none focus:border-orange-500/60"
        >
          Click here and press <span className="text-slate-200 font-medium">Ctrl+V</span> to paste your
          in-game screenshot (ALT+PrtSc the scan panel first).
        </div>

        {loaded ? (
          <div className="shrink-0 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 space-y-1.5">
            <label htmlFor="ocr-deskew" className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
              Tilt scan inside crop
            </label>
            <input
              id="ocr-deskew"
              type="range"
              min={-4}
              max={4}
              step={0.5}
              value={deskewDegrees}
              onInput={(e) => setDeskewDegrees(Number.parseFloat(e.currentTarget.value))}
              onChange={(e) => setDeskewDegrees(Number.parseFloat(e.target.value))}
              className="w-full accent-orange-400"
            />
            <p className="text-[10px] text-slate-500 leading-snug">
              Drag the slider — the image inside the orange box tilts in real time. The crop box stays
              put. Use if Q values are clipped or the scan panel looks skewed.
            </p>
          </div>
        ) : null}

        <div
          ref={containerRef}
          className="relative min-h-[14rem] flex-1 w-full rounded-lg border border-slate-700 bg-black/60 overflow-hidden"
        >
          {loaded ? (
            <>
              {displayRect.width > 0 ? (
                <img
                  src={loaded.objectUrl}
                  alt="Pasted scanner screenshot"
                  draggable={false}
                  className={OCR_PREVIEW_IMAGE_CLASS}
                  style={{
                    width: displayRect.width,
                    height: displayRect.height,
                    left: displayRect.left,
                    top: displayRect.top,
                  }}
                />
              ) : null}
              {displayRect.width > 0 && cropImageStyle ? (
                <div
                  className="absolute z-10"
                  style={{
                    left: cropPx.x,
                    top: cropPx.y,
                    width: cropPx.width,
                    height: cropPx.height,
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden bg-black pointer-events-none">
                    <img
                      src={loaded.objectUrl}
                      alt=""
                      draggable={false}
                      className={OCR_PREVIEW_IMAGE_CLASS}
                      style={cropImageStyle}
                    />
                  </div>
                  <div
                    className="absolute inset-0 border-2 border-orange-400/90 cursor-move"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      startDrag('move', e.clientX, e.clientY)
                    }}
                  />
                  <div
                    className="absolute w-3 h-3 rounded-sm bg-orange-400 border border-white cursor-se-resize z-20"
                    style={{
                      right: -6,
                      bottom: -6,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      startDrag('resize-se', e.clientX, e.clientY)
                    }}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 px-6 text-center">
              Screenshot preview will appear here after paste. Drag the orange box around SCAN RESULTS
              before processing.
            </div>
          )}
        </div>
      </div>
    </AppModal>
  )
}
