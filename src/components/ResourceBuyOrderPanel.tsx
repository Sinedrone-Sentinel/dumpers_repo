import React, { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AuecTransferLimitModal from './AuecTransferLimitModal'
import { ORDER_QUALITY_TIERS } from '../config/dfp'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import {
  formatDfpAuec,
  formatDfpLabel,
  formatDfpRequiredPrice,
  formatOrderQualityLabel,
  isAmmoBlueprint,
} from '../lib/dfp'
import {
  buildOrderFulfillmentItems,
  buildOrderTitle,
  pricingForBlueprintLine,
  pricingForResourceLine,
  type OrderBlueprintLine,
  type OrderResourceLine,
} from '../lib/orderPricing'
import { createCustomOrder, type BlueprintResourceRow } from '../lib/operations'
import {
  formatResourceQuantity,
  parseResourceQuantity,
  RESOURCE_QUANTITY_STEP,
} from '../lib/resourceQuantity'

interface CartBlueprintLine extends OrderBlueprintLine {
  cartKey: string
}

interface CartResourceLine extends OrderResourceLine {
  cartKey: string
}

interface ResourceBuyOrderPanelProps {
  userId: string
  blueprints: BlueprintWithSlots[]
  catalog: BlueprintResourceRow[]
  labelMap: Record<string, string>
  onSubmitted?: () => void
  onError?: (message: string) => void
}

function nextCartKey() {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ResourceBuyOrderPanel({
  userId,
  blueprints,
  catalog,
  labelMap,
  onSubmitted,
  onError,
}: ResourceBuyOrderPanelProps) {
  const [mode, setMode] = useState<'blueprint' | 'resource'>('blueprint')
  const [bpSearch, setBpSearch] = useState('')
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('')
  const [bpQuality, setBpQuality] = useState(String(ORDER_QUALITY_TIERS[0]))
  const [bpQty, setBpQty] = useState('1')
  const [resourceKey, setResourceKey] = useState('')
  const [resQuality, setResQuality] = useState(String(ORDER_QUALITY_TIERS[0]))
  const [resQty, setResQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [bpCart, setBpCart] = useState<CartBlueprintLine[]>([])
  const [resCart, setResCart] = useState<CartResourceLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)

  const blueprintById = useMemo(() => {
    const map = new Map<string, BlueprintWithSlots>()
    blueprints.forEach((bp) => {
      if (bp.file) map.set(bp.file, bp)
    })
    return map
  }, [blueprints])

  const activeCatalog = useMemo(
    () => [...catalog].filter((r) => r.is_active).sort((a, b) => a.label.localeCompare(b.label)),
    [catalog]
  )

  const filteredBlueprints = useMemo(() => {
    const q = bpSearch.trim().toLowerCase()
    if (!q) return blueprints.slice(0, 80)
    return blueprints
      .filter(
        (bp) =>
          (bp.blueprintName || '').toLowerCase().includes(q) ||
          (bp.file || '').toLowerCase().includes(q)
      )
      .slice(0, 80)
  }, [blueprints, bpSearch])

  const selectedBlueprint = blueprintById.get(selectedBlueprintId)
  const selectedIsAmmo = selectedBlueprint ? isAmmoBlueprint(selectedBlueprint) : false
  const selectedResource = activeCatalog.find((r) => r.resource_key === resourceKey)

  const cartTotalDfp = useMemo(
    () =>
      bpCart.reduce((s, l) => s + l.lineDfpAuec, 0) +
      resCart.reduce((s, l) => s + l.lineDfpAuec, 0),
    [bpCart, resCart]
  )

  const fulfillmentPreview = useMemo(
    () =>
      buildOrderFulfillmentItems({
        blueprintLines: bpCart.map((line) => ({
          blueprint: blueprintById.get(line.blueprintId)!,
          quantity: line.quantity,
        })).filter((row) => row.blueprint),
        resourceLines: resCart.map((line) => ({
          resourceKey: line.resourceKey,
          quantityScu: line.quantityScu,
        })),
      }),
    [bpCart, resCart, blueprintById]
  )

  useEffect(() => {
    if (selectedBlueprintId || filteredBlueprints.length === 0) return
    setSelectedBlueprintId(filteredBlueprints[0].file ?? '')
  }, [filteredBlueprints, selectedBlueprintId])

  useEffect(() => {
    if (resourceKey || activeCatalog.length === 0) return
    setResourceKey(activeCatalog[0].resource_key)
  }, [activeCatalog, resourceKey])

  const addBlueprint = () => {
    if (!selectedBlueprint?.file) return
    const qty = Math.max(1, Number(bpQty) || 1)
    const selectedQuality = Number(bpQuality) || ORDER_QUALITY_TIERS[0]
    const pricing = pricingForBlueprintLine(selectedBlueprint, selectedQuality, qty)
    setBpCart((prev) => [
      ...prev,
      {
        cartKey: nextCartKey(),
        blueprintId: selectedBlueprint.file,
        blueprintTitle: selectedBlueprint.blueprintName || selectedBlueprint.file,
        minQuality: pricing.orderMinQuality,
        quantity: qty,
        unitDfpAuec: pricing.unitDfpAuec,
        lineDfpAuec: pricing.lineDfpAuec,
      },
    ])
    setBpQty('1')
  }

  const addResource = () => {
    if (!selectedResource) return
    const qty = parseResourceQuantity(resQty)
    if (qty == null || qty <= 0) return
    const quality = Math.min(1000, Math.max(0, Number(resQuality) || 500))
    const pricing = pricingForResourceLine(selectedResource.label, quality, qty)
    setResCart((prev) => [
      ...prev,
      {
        cartKey: nextCartKey(),
        resourceKey: selectedResource.resource_key,
        resourceLabel: selectedResource.label,
        minQuality: quality,
        quantityScu: qty,
        unitDfpAuec: pricing.unitDfpAuec,
        lineDfpAuec: pricing.lineDfpAuec,
      },
    ])
    setResQty('1')
  }

  const submitOrder = async () => {
    if (bpCart.length === 0 && resCart.length === 0) return

    setSubmitting(true)
    onError?.('')

    const result = await createCustomOrder({
      requesterId: userId,
      title: buildOrderTitle(bpCart.length, resCart.length),
      notes,
      totalDfpAuec: cartTotalDfp,
      blueprints: bpCart.map((line) => ({
        blueprintId: line.blueprintId,
        blueprintTitle: line.blueprintTitle,
        minQuality: line.minQuality,
        quantity: line.quantity,
        unitDfpAuec: line.unitDfpAuec,
        lineDfpAuec: line.lineDfpAuec,
      })),
      resources: resCart.map((line) => ({
        resourceKey: line.resourceKey,
        resourceLabel: line.resourceLabel,
        minQuality: line.minQuality,
        quantityScu: line.quantityScu,
        unitDfpAuec: line.unitDfpAuec,
        lineDfpAuec: line.lineDfpAuec,
      })),
      items: fulfillmentPreview.map((item) => ({
        resourceKey: item.resourceKey,
        quantity: item.quantity,
      })),
    })

    setSubmitting(false)
    setShowTransferModal(false)

    if (result.error) {
      onError?.(result.error)
      return
    }

    setBpCart([])
    setResCart([])
    setNotes('')
    onSubmitted?.()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (bpCart.length === 0 && resCart.length === 0) return
    if (exceedsSingleTransferLimit(cartTotalDfp)) {
      setShowTransferModal(true)
      return
    }
    void submitOrder()
  }

  return (
    <>
      <p className="text-slate-400 text-sm mb-4">
        Build a buy order from <strong className="text-slate-300">crafted blueprints</strong>{' '}
        (full DFP) and/or <strong className="text-slate-300">refined materials</strong>{' '}
        (material-only DFP at your quality tier). Submits as a custom order — view progress on{' '}
        <Link to="/orders" className="text-red-400 hover:text-red-300">
          Custom Orders
        </Link>
        .
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2 p-1 bg-slate-900/60 border border-slate-700 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setMode('blueprint')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              mode === 'blueprint' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Add blueprint
          </button>
          <button
            type="button"
            onClick={() => setMode('resource')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              mode === 'resource' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Add resource
          </button>
        </div>

        {mode === 'blueprint' ? (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <input
              value={bpSearch}
              onChange={(e) => setBpSearch(e.target.value)}
              placeholder="Search blueprints..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
            />
            <select
              value={selectedBlueprintId}
              onChange={(e) => setSelectedBlueprintId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
            >
              {filteredBlueprints.map((bp) => (
                <option key={bp.file} value={bp.file}>
                  {bp.blueprintName || bp.file}
                </option>
              ))}
            </select>
            {selectedIsAmmo && (
              <p className="text-slate-400 text-xs">
                Ammo — no min quality on the order. Fulfiller may use lowest quality materials on
                hand (in-game, ammo craft quality does not matter).
              </p>
            )}
            <div className={`grid gap-2 ${selectedIsAmmo ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {!selectedIsAmmo && (
                <select
                  value={bpQuality}
                  onChange={(e) => setBpQuality(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                  aria-label="Min quality tier"
                >
                  {ORDER_QUALITY_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      Q{tier}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="number"
                min={1}
                value={bpQty}
                onChange={(e) => setBpQty(e.target.value)}
                placeholder="Qty"
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
              />
              <button
                type="button"
                onClick={addBlueprint}
                disabled={!selectedBlueprint}
                className="py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <select
              value={resourceKey}
              onChange={(e) => setResourceKey(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
            >
              {activeCatalog.map((r) => (
                <option key={r.resource_key} value={r.resource_key}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={resQuality}
                onChange={(e) => setResQuality(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
              >
                {ORDER_QUALITY_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    Q{tier}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={RESOURCE_QUANTITY_STEP}
                step={RESOURCE_QUANTITY_STEP}
                value={resQty}
                onChange={(e) => setResQty(e.target.value)}
                placeholder="SCU"
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
              />
              <button
                type="button"
                onClick={addResource}
                disabled={!selectedResource}
                className="py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                Add
              </button>
            </div>
            {selectedResource && parseResourceQuantity(resQty) != null && (
              <p className="text-amber-200/90 text-xs">
                Material DFP:{' '}
                {formatDfpLabel(
                  pricingForResourceLine(
                    selectedResource.label,
                    Number(resQuality) || 500,
                    parseResourceQuantity(resQty)!
                  ).lineDfpAuec
                )}
              </p>
            )}
          </div>
        )}

        {(bpCart.length > 0 || resCart.length > 0) && (
          <div className="border border-slate-700 rounded-xl overflow-hidden">
            <ul className="divide-y divide-slate-800">
              {bpCart.map((line) => (
                <li
                  key={line.cartKey}
                  className="px-3 py-2 flex justify-between gap-2 text-sm bg-slate-900/40"
                >
                  <span className="text-white">
                    {line.blueprintTitle} × {line.quantity} ·{' '}
                    {formatOrderQualityLabel(line.minQuality)}
                  </span>
                  <span className="text-amber-300 shrink-0">{formatDfpAuec(line.lineDfpAuec)}</span>
                  <button
                    type="button"
                    onClick={() => setBpCart((p) => p.filter((l) => l.cartKey !== line.cartKey))}
                    className="text-red-400 text-xs"
                  >
                    ×
                  </button>
                </li>
              ))}
              {resCart.map((line) => (
                <li
                  key={line.cartKey}
                  className="px-3 py-2 flex justify-between gap-2 text-sm bg-slate-900/40"
                >
                  <span className="text-white">
                    {line.resourceLabel} · {formatResourceQuantity(line.quantityScu)} SCU ·{' '}
                    {formatOrderQualityLabel(line.minQuality)}
                  </span>
                  <span className="text-amber-300 shrink-0">{formatDfpAuec(line.lineDfpAuec)}</span>
                  <button
                    type="button"
                    onClick={() => setResCart((p) => p.filter((l) => l.cartKey !== line.cartKey))}
                    className="text-red-400 text-xs"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-3 py-3 bg-amber-950/30 border-t border-amber-500/20 flex justify-between">
              <span className="text-amber-200 text-sm font-medium">Required total (DFP)</span>
              <span className="text-amber-100 font-bold">
                {formatDfpRequiredPrice(cartTotalDfp)}
              </span>
            </div>
          </div>
        )}

        {exceedsSingleTransferLimit(cartTotalDfp) && (
          <p className="text-orange-300/90 text-xs">
            Over 1M DFP — confirm in-game payment limits before submitting.
          </p>
        )}

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
        />

        {fulfillmentPreview.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fulfillmentPreview.map((item) => (
              <span
                key={item.resourceKey}
                className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded border border-slate-600"
              >
                {getResourceLabel(item.resourceKey, labelMap)} ×{' '}
                {formatResourceQuantity(item.quantity)}
              </span>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (bpCart.length === 0 && resCart.length === 0)}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
        >
          {submitting ? 'Submitting...' : `Submit buy order · ${formatDfpAuec(cartTotalDfp)}`}
        </button>
      </form>

      {showTransferModal && (
        <AuecTransferLimitModal
          totalAuec={cartTotalDfp}
          onConfirm={() => void submitOrder()}
          onCancel={() => setShowTransferModal(false)}
          confirming={submitting}
        />
      )}
    </>
  )
}
