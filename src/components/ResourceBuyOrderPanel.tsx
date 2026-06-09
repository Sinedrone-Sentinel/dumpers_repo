import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Link } from '@tanstack/react-router'
import BlueprintTypeahead from './BlueprintTypeahead'
import AuecTransferLimitModal from './AuecTransferLimitModal'
import { isSalvageResource, SALVAGE_ORDER_MIN_QUALITY } from '../config/extraResources'
import { DEFAULT_STOCK_QUALITY, ORDER_QUALITY_TIERS } from '../config/dfp'
import { REPUTATION_STAR_OPTIONS } from '../config/reputation'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import {
  formatDfpAuec,
  formatDfpLabel,
  formatDfpRequiredPrice,
  formatBlueprintOrderQualityLabel,
  formatResourceOrderQualityLabel,
  isAmmoBlueprint,
} from '../lib/dfp'
import {
  buildOrderFulfillmentItems,
  buildOrderTitle,
  pricingForBlueprintLine,
  pricingForResourceLine,
  resolveOrderBlueprintLines,
  resolveOrderResourceLines,
  type OrderBlueprintLine,
  type OrderResourceLine,
} from '../lib/orderPricing'
import {
  createCustomOrder,
  updateCustomOrderRequester,
  type BlueprintResourceRow,
  type CustomOrder,
} from '../lib/operations'
import ResourceQuantityInput from './ResourceQuantityInput'
import { formatResourceQuantity, parseResourceQuantity } from '../lib/resourceQuantity'

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
  editOrder?: CustomOrder | null
  onCancelEdit?: () => void
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
  editOrder,
  onCancelEdit,
  onSubmitted,
  onError,
}: ResourceBuyOrderPanelProps) {
  const { dfpDisplayEnabled } = useAuth()
  const isEditing = Boolean(editOrder?.id)
  const [mode, setMode] = useState<'blueprint' | 'resource'>('blueprint')
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('')
  const [bpQuality, setBpQuality] = useState(String(DEFAULT_STOCK_QUALITY))
  const [bpQty, setBpQty] = useState('1')
  const [resourceKey, setResourceKey] = useState('')
  const [resQuality, setResQuality] = useState(String(DEFAULT_STOCK_QUALITY))
  const [resQty, setResQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [minFulfillerRep, setMinFulfillerRep] = useState('')
  const [bpCart, setBpCart] = useState<CartBlueprintLine[]>([])
  const [resCart, setResCart] = useState<CartResourceLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)

  useEffect(() => {
    if (!editOrder) return

    setBpCart(
      resolveOrderBlueprintLines(editOrder).map((line) => ({
        ...line,
        cartKey: nextCartKey(),
      }))
    )
    setResCart(
      resolveOrderResourceLines(editOrder).map((line) => ({
        ...line,
        cartKey: nextCartKey(),
      }))
    )
    setNotes(editOrder.notes ?? '')
    setMinFulfillerRep(
      editOrder.min_fulfiller_reputation != null
        ? String(editOrder.min_fulfiller_reputation)
        : ''
    )
    setMode(
      resolveOrderBlueprintLines(editOrder).length > 0 ? 'blueprint' : 'resource'
    )
  }, [editOrder])

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

  const selectedBlueprint = blueprintById.get(selectedBlueprintId) ?? null
  const selectedIsAmmo = selectedBlueprint ? isAmmoBlueprint(selectedBlueprint) : false
  const selectedResource = activeCatalog.find((r) => r.resource_key === resourceKey)
  const selectedResIsSalvage = selectedResource
    ? isSalvageResource(selectedResource.resource_key)
    : false

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
    if (resourceKey || activeCatalog.length === 0) return
    setResourceKey(activeCatalog[0].resource_key)
  }, [activeCatalog, resourceKey])

  useEffect(() => {
    if (selectedResIsSalvage) setResQuality(String(SALVAGE_ORDER_MIN_QUALITY))
  }, [resourceKey, selectedResIsSalvage])

  const addBlueprint = () => {
    if (!selectedBlueprint?.file) return
    const qty = Math.max(1, Number(bpQty) || 1)
    const selectedQuality = Number(bpQuality) || DEFAULT_STOCK_QUALITY
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
    const pricing = pricingForResourceLine(
      selectedResource.resource_key,
      selectedResource.label,
      Number(resQuality) || DEFAULT_STOCK_QUALITY,
      qty
    )
    setResCart((prev) => [
      ...prev,
      {
        cartKey: nextCartKey(),
        resourceKey: selectedResource.resource_key,
        resourceLabel: selectedResource.label,
        minQuality: pricing.orderMinQuality,
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

    const payload = {
      title: buildOrderTitle(
        bpCart.reduce((sum, line) => sum + line.quantity, 0),
        resCart.length
      ),
      notes,
      totalDfpAuec: cartTotalDfp,
      minFulfillerReputation: minFulfillerRep ? Number(minFulfillerRep) : null,
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
    }

    const result = isEditing
      ? await updateCustomOrderRequester({ orderId: editOrder!.id, ...payload })
      : await createCustomOrder({ requesterId: userId, ...payload })

    setSubmitting(false)
    setShowTransferModal(false)

    if (result.error) {
      onError?.(result.error)
      return
    }

    if (!isEditing) {
      setBpCart([])
      setResCart([])
      setNotes('')
      setMinFulfillerRep('')
    }
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
            <BlueprintTypeahead
              blueprints={blueprints}
              selectedBlueprint={selectedBlueprint}
              onSelect={(bp) => setSelectedBlueprintId(bp.file ?? '')}
              onClear={() => setSelectedBlueprintId('')}
            />
            {selectedBlueprint && (
              <>
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
                    className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
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
            {selectedResIsSalvage && (
              <p className="text-slate-400 text-xs">
                Salvage — always Q0. No quality tier on RMC or construction material.
              </p>
            )}
            <div className={`grid gap-2 ${selectedResIsSalvage ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {!selectedResIsSalvage && (
                <select
                  value={resQuality}
                  onChange={(e) => setResQuality(e.target.value)}
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
              <ResourceQuantityInput
                value={resQty}
                onValueChange={setResQty}
                placeholder="SCU"
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm tabular-nums"
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
            {dfpDisplayEnabled && selectedResource && parseResourceQuantity(resQty) != null && (
              <p className="text-amber-200/90 text-xs">
                Material DFP:{' '}
                {formatDfpLabel(
                  pricingForResourceLine(
                    selectedResource.resource_key,
                    selectedResource.label,
                    Number(resQuality) || DEFAULT_STOCK_QUALITY,
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
                    {formatBlueprintOrderQualityLabel(line.minQuality)}
                  </span>
                  {dfpDisplayEnabled && (
                    <span className="text-amber-300 shrink-0">{formatDfpAuec(line.lineDfpAuec)}</span>
                  )}
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
                    {formatResourceOrderQualityLabel(
                      line.resourceKey,
                      line.resourceLabel,
                      line.minQuality
                    )}
                  </span>
                  {dfpDisplayEnabled && (
                    <span className="text-amber-300 shrink-0">{formatDfpAuec(line.lineDfpAuec)}</span>
                  )}
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
            {dfpDisplayEnabled && (
              <div className="px-3 py-3 bg-amber-950/30 border-t border-amber-500/20 flex justify-between">
                <span className="text-amber-200 text-sm font-medium">Required total (DFP)</span>
                <span className="text-amber-100 font-bold">
                  {formatDfpRequiredPrice(cartTotalDfp)}
                </span>
              </div>
            )}
          </div>
        )}

        {dfpDisplayEnabled && exceedsSingleTransferLimit(cartTotalDfp) && (
          <p className="text-orange-300/90 text-xs">
            Over 1M DFP — confirm in-game payment limits before submitting.
          </p>
        )}

        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-2">
          <label htmlFor="min-fulfiller-rep" className="text-slate-300 text-sm font-medium">
            Min fulfiller reputation
          </label>
          <p className="text-slate-500 text-xs">
            Whole-number minimum (1–5) after fulfillers have 5+ completed jobs. Unrated fulfillers
            are always eligible — they must be given a chance.
          </p>
          <select
            id="min-fulfiller-rep"
            value={minFulfillerRep}
            onChange={(e) => setMinFulfillerRep(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          >
            <option value="">No minimum</option>
            {REPUTATION_STAR_OPTIONS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}+ stars
              </option>
            ))}
          </select>
        </div>

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

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitting || (bpCart.length === 0 && resCart.length === 0)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {submitting
              ? 'Saving...'
              : isEditing
                ? dfpDisplayEnabled
                  ? `Save changes · ${formatDfpAuec(cartTotalDfp)}`
                  : 'Save changes'
                : dfpDisplayEnabled
                  ? `Submit buy order · ${formatDfpAuec(cartTotalDfp)}`
                  : 'Submit buy order'}
          </button>
          {isEditing && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg text-sm"
            >
              Cancel edit
            </button>
          )}
        </div>
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
