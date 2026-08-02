import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import BlueprintTypeahead from './BlueprintTypeahead'
import BlueprintSlotQualityCard from './BlueprintSlotQualityCard'
import { isSalvageResource, SALVAGE_ORDER_MIN_QUALITY } from '../config/extraResources'
import {
  isHarvestResource,
  resourceLabelClassName,
  resourceQuantityUnitLabel,
} from '../config/resourceTypes'
import { DEFAULT_STOCK_QUALITY, isNoQualityResource } from '../config/dfp'
import {
  getDefaultBandQuality,
  getResourceBands,
  getQualityTier,
  getQualityTierColor,
  PURCHASED_STOCK_QUALITY,
  supportsPurchasedQuality,
} from '../lib/qualityBands'
import {
  buildDefaultSlotQualities,
  formatSlotQualitySummary,
  isUniformSlotQuality,
  mergeSlotQualities,
} from '../lib/blueprintQuality'
import {
  blueprintHasQualityModifiers,
  buildBlueprintLineSnapshot,
  computeBlueprintEffectiveModifiers,
  type BlueprintForEffectiveStats,
} from '../lib/blueprintEffectiveStats'
import BlueprintEffectiveStatsSummary from './BlueprintEffectiveStatsSummary'
import CartBlueprintLineEditor from './CartBlueprintLineEditor'
import { REPUTATION_STAR_OPTIONS } from '../config/reputation'
import { getResourceLabel, type BlueprintWithSlots } from '../lib/blueprintResources'
import {
  formatDfpAuec,
  formatDfpLabel,
  formatResourceOrderQualityLabel,
  isAmmoBlueprint,
} from '../lib/dfp'
import { canAddBlueprintToOrder } from '../lib/blueprintOrderable'
import {
  buildOrderFulfillmentItems,
  createCartPricingFields,
  pricingForBlueprintLine,
  pricingForResourceLine,
  resolveOrderBlueprintLines,
  resolveOrderResourceLines,
  type OrderBlueprintLine,
  type OrderResourceLine,
} from '../lib/orderPricing'
import {
  appendToMyListing,
  updateCustomOrderRequester,
  type BlueprintResourceRow,
  type CustomOrder,
} from '../lib/operations'
import ResourceQuantityInput from './ResourceQuantityInput'
import ResourceTypeahead from './ResourceTypeahead'
import { resourceChipClassName } from '../config/resourceTypes'
import {
  formatQuantityForResource,
  parseQuantityForResource,
} from '../lib/resourceQuantity'

interface CartPricingFields {
  baseUnitDfpAuec: number
  baseLineDfpAuec: number
}

interface CartBlueprintLine extends OrderBlueprintLine, CartPricingFields {
  cartKey: string
  slotQualities?: Record<number, number>
}

interface CartResourceLine extends OrderResourceLine, CartPricingFields {
  cartKey: string
}

/** Draft lines from the blueprint page may not carry base pricing yet. */
type DraftBlueprintLine = OrderBlueprintLine &
  Partial<CartPricingFields> & {
    cartKey: string
    slotQualities?: Record<number, number>
  }

/** Draft resource lines (e.g. Wikelo reward items sent from the Wikelo page). */
interface DraftResourceLine {
  cartKey: string
  resourceKey: string
  resourceLabel: string
  quantity: number
}

interface ResourceBuyOrderPanelProps {
  userId: string
  blueprints: BlueprintWithSlots[]
  catalog: BlueprintResourceRow[]
  labelMap: Record<string, string>
  orderOverridesMap?: Record<string, boolean>
  editOrder?: CustomOrder | null
  canCreateSellOrder?: boolean
  initialBlueprintLines?: DraftBlueprintLine[]
  initialResourceLines?: DraftResourceLine[]
  blueprintOwnerCounts?: Record<string, number>
  onCancelEdit?: () => void
  onSubmitted?: () => void
  onError?: (message: string) => void
  onDraftCleared?: () => void
}

function nextCartKey() {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatSlotQualityLabel(line: CartBlueprintLine): string {
  if (!line.slotQualities || isUniformSlotQuality(line.slotQualities)) {
    return `Q${line.minQuality}`
  }
  return formatSlotQualitySummary(line.slotQualities)
}

function CartBlueprintLineStats({
  line,
  blueprintById,
}: {
  line: CartBlueprintLine
  blueprintById: Map<string, BlueprintWithSlots>
}) {
  const modifiers = useMemo(() => {
    const bp = blueprintById.get(line.blueprintId) as BlueprintForEffectiveStats | undefined
    if (!bp || !blueprintHasQualityModifiers(bp)) return []
    return computeBlueprintEffectiveModifiers(bp, line.slotQualities, line.minQuality)
  }, [blueprintById, line.blueprintId, line.slotQualities, line.minQuality])

  if (modifiers.length === 0) return null
  return <BlueprintEffectiveStatsSummary modifiers={modifiers} compact />
}

export default function ResourceBuyOrderPanel({
  userId: _userId,
  blueprints,
  catalog,
  labelMap,
  orderOverridesMap = {},
  editOrder,
  canCreateSellOrder = true,
  initialBlueprintLines,
  initialResourceLines,
  blueprintOwnerCounts = {},
  onCancelEdit,
  onSubmitted,
  onError,
  onDraftCleared,
}: ResourceBuyOrderPanelProps) {
  const { dfpDisplayEnabled } = useAuth()
  const isEditing = Boolean(editOrder?.id)
  const [mode, setMode] = useState<'blueprint' | 'resource'>('blueprint')
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('')
  const [bpSlotQualities, setBpSlotQualities] = useState<Record<number, number>>({})
  const [bpQty, setBpQty] = useState('1')
  const [resourceKey, setResourceKey] = useState('')
  const [resQuality, setResQuality] = useState(String(DEFAULT_STOCK_QUALITY))
  const [resQty, setResQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [minFulfillerRep, setMinFulfillerRep] = useState('')
  const [bpCart, setBpCart] = useState<CartBlueprintLine[]>([])
  const [resCart, setResCart] = useState<CartResourceLine[]>([])
  const [showNoOwnerWarning, setShowNoOwnerWarning] = useState(false)
  const [noOwnerBlueprints, setNoOwnerBlueprints] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [pendingListingType, setPendingListingType] = useState<'wtb' | 'wts'>('wtb')
  const [expandedCartKey, setExpandedCartKey] = useState<string | null>(null)

  const blueprintById = useMemo(() => {
    const map = new Map<string, BlueprintWithSlots>()
    blueprints.forEach((bp) => {
      if (bp.internalName) map.set(bp.internalName, bp)
    })
    return map
  }, [blueprints])

  useEffect(() => {
    if (!editOrder) return

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

  // Hydrate the edit cart at current DFP (Bazaar listings are pure DFP).
  useEffect(() => {
    if (!editOrder) return

    setBpCart(
      resolveOrderBlueprintLines(editOrder).map((line) => {
        const blueprint = blueprintById.get(line.blueprintId)
        const pricing = blueprint
          ? pricingForBlueprintLine(blueprint, line.slotQualities ?? {}, line.quantity)
          : {
              unitDfpAuec: line.unitDfpAuec,
              lineDfpAuec: line.lineDfpAuec,
              orderMinQuality: line.minQuality,
            }
        return {
          ...line,
          slotQualities: line.slotQualities ?? undefined,
          cartKey: nextCartKey(),
          ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
        }
      })
    )
    setResCart(
      resolveOrderResourceLines(editOrder).map((line) => {
        const pricing = pricingForResourceLine(
          line.resourceKey,
          line.resourceLabel,
          line.minQuality,
          line.quantityScu
        )
        return {
          ...line,
          cartKey: nextCartKey(),
          ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
        }
      })
    )
  }, [editOrder, blueprintById])

  // Initialize cart from draft items (consume session draft once loaded into cart)
  const draftConsumedRef = useRef(false)
  useEffect(() => {
    const hasBpDraft = (initialBlueprintLines?.length ?? 0) > 0
    const hasResDraft = (initialResourceLines?.length ?? 0) > 0
    if (editOrder || (!hasBpDraft && !hasResDraft)) {
      draftConsumedRef.current = false
      return
    }
    if (draftConsumedRef.current) return

    draftConsumedRef.current = true
    if (hasBpDraft) {
      setBpCart(
        initialBlueprintLines!.map((line) => ({
          ...line,
          baseUnitDfpAuec: line.baseUnitDfpAuec ?? line.unitDfpAuec,
          baseLineDfpAuec: line.baseLineDfpAuec ?? line.lineDfpAuec,
        }))
      )
    }
    if (hasResDraft) {
      setResCart(
        initialResourceLines!.map((line) => {
          const pricing = pricingForResourceLine(
            line.resourceKey,
            line.resourceLabel,
            SALVAGE_ORDER_MIN_QUALITY,
            line.quantity
          )
          return {
            cartKey: line.cartKey,
            resourceKey: line.resourceKey,
            resourceLabel: line.resourceLabel,
            minQuality: pricing.orderMinQuality,
            quantityScu: line.quantity,
            ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
          }
        })
      )
    }
    setMode(hasBpDraft ? 'blueprint' : 'resource')
    setExpandedCartKey(initialBlueprintLines?.[0]?.cartKey ?? null)
    onDraftCleared?.()
  }, [editOrder, initialBlueprintLines, initialResourceLines, onDraftCleared])

  const activeCatalog = useMemo(
    () => [...catalog].sort((a, b) => a.label.localeCompare(b.label)),
    [catalog]
  )

  const selectedBlueprint = blueprintById.get(selectedBlueprintId) ?? null
  const selectedIsAmmo = selectedBlueprint ? isAmmoBlueprint(selectedBlueprint) : false
  const selectedCanOrder = selectedBlueprint
    ? canAddBlueprintToOrder(selectedBlueprint, orderOverridesMap)
    : false

  useEffect(() => {
    if (selectedBlueprint) {
      setBpSlotQualities(buildDefaultSlotQualities(selectedBlueprint))
    } else {
      setBpSlotQualities({})
    }
  }, [selectedBlueprintId, selectedBlueprint])

  const effectiveBpSlotQualities = useMemo(() => {
    if (!selectedBlueprint) return {}
    return mergeSlotQualities(selectedBlueprint, bpSlotQualities)
  }, [selectedBlueprint, bpSlotQualities])

  const selectedBlueprintPricing = useMemo(() => {
    if (!selectedBlueprint || selectedIsAmmo) return null
    const qty = Math.max(1, Number(bpQty) || 1)
    return pricingForBlueprintLine(selectedBlueprint, effectiveBpSlotQualities, qty)
  }, [selectedBlueprint, selectedIsAmmo, effectiveBpSlotQualities, bpQty])

  const selectedBlueprintEffectiveModifiers = useMemo(() => {
    if (!selectedBlueprint || selectedIsAmmo) return []
    const bp = selectedBlueprint as BlueprintForEffectiveStats
    if (!blueprintHasQualityModifiers(bp)) return []
    return computeBlueprintEffectiveModifiers(bp, effectiveBpSlotQualities)
  }, [selectedBlueprint, selectedIsAmmo, effectiveBpSlotQualities])
  const selectedResource = activeCatalog.find((r) => r.resource_key === resourceKey)
  const selectedResourceLabel = selectedResource?.label ?? ''
  const selectedResIsSalvage = selectedResource
    ? isSalvageResource(selectedResource.resource_key)
    : false
  const selectedResIsHarvest = selectedResource
    ? isHarvestResource(selectedResource.resource_key)
    : false
  const selectedResQtyUnit = selectedResource
    ? resourceQuantityUnitLabel(selectedResource.resource_key)
    : 'SCU'
  const selectedResNoQuality = selectedResource
    ? isNoQualityResource(selectedResource.resource_key)
    : false
  const resourceBands = useMemo(
    () => (resourceKey && !selectedResNoQuality ? getResourceBands(selectedResourceLabel) : undefined),
    [resourceKey, selectedResourceLabel, selectedResNoQuality]
  )

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
    if (selectedResNoQuality) {
      setResQuality(String(SALVAGE_ORDER_MIN_QUALITY))
    } else if (resourceBands && resourceBands.length > 0) {
      setResQuality(String(getDefaultBandQuality(selectedResourceLabel)))
    } else {
      setResQuality(String(DEFAULT_STOCK_QUALITY))
    }
  }, [resourceKey, selectedResNoQuality, resourceBands, selectedResourceLabel])

  const showPurchasedQuality = selectedResource
    ? supportsPurchasedQuality(selectedResource.resource_key, selectedResourceLabel)
    : false
  const resUsesFlatBandPrice = useMemo(() => {
    if (!resourceBands || selectedResNoQuality) return false
    const q = Number(resQuality)
    if (q === PURCHASED_STOCK_QUALITY) return true
    return q === resourceBands[0]
  }, [resourceBands, resQuality, selectedResNoQuality])

  const addBlueprint = () => {
    if (!selectedBlueprint?.internalName) return
    if (!canAddBlueprintToOrder(selectedBlueprint, orderOverridesMap)) {
      onError?.('This blueprint is not available for orders')
      return
    }
    const qty = Math.max(1, Number(bpQty) || 1)
    const pricing = selectedIsAmmo
      ? pricingForBlueprintLine(selectedBlueprint, {}, qty)
      : pricingForBlueprintLine(selectedBlueprint, effectiveBpSlotQualities, qty)
    const cartKey = nextCartKey()
    setBpCart((prev) => [
      ...prev,
      {
        cartKey,
        blueprintId: selectedBlueprint.internalName,
        blueprintTitle: selectedBlueprint.blueprintName || selectedBlueprint.internalName,
        minQuality: pricing.orderMinQuality,
        slotQualities: selectedIsAmmo ? undefined : effectiveBpSlotQualities,
        quantity: qty,
        ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
      },
    ])
    setExpandedCartKey(cartKey)
    setBpQty('1')
  }

  const updateBlueprintCartLine = (
    cartKey: string,
    updates: Partial<CartBlueprintLine>
  ) => {
    setBpCart((prev) =>
      prev.map((line) => (line.cartKey === cartKey ? { ...line, ...updates } : line))
    )
  }

  const removeBlueprintCartLine = (cartKey: string) => {
    setBpCart((prev) => prev.filter((l) => l.cartKey !== cartKey))
    if (expandedCartKey === cartKey) setExpandedCartKey(null)
  }

  const blueprintPayloadFromCart = (line: CartBlueprintLine) => {
    const bp = blueprintById.get(line.blueprintId) as BlueprintForEffectiveStats | undefined
    const lineSnapshot =
      bp && !isAmmoBlueprint(bp)
        ? buildBlueprintLineSnapshot(bp, line.slotQualities, line.minQuality)
        : null
    return {
      blueprintId: line.blueprintId,
      blueprintTitle: line.blueprintTitle,
      minQuality: line.minQuality,
      slotQualities: line.slotQualities,
      quantity: line.quantity,
      unitDfpAuec: line.baseUnitDfpAuec,
      lineDfpAuec: line.baseLineDfpAuec,
      baseUnitDfpAuec: line.baseUnitDfpAuec,
      lineSnapshot,
    }
  }

  const addResource = () => {
    if (!selectedResource) return
    const qty = parseQuantityForResource(selectedResource.resource_key, resQty)
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
        ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
      },
    ])
    setResQty('1')
  }

  const submitOrder = async (listingType: 'wtb' | 'wts') => {
    if (bpCart.length === 0 && resCart.length === 0) return

    setSubmitting(true)
    onError?.('')

    const blueprintPayloads = bpCart.map(blueprintPayloadFromCart)
    const resourcePayloads = resCart.map((line) => ({
      resourceKey: line.resourceKey,
      resourceLabel: line.resourceLabel,
      minQuality: line.minQuality,
      quantityScu: line.quantityScu,
      unitDfpAuec: line.baseUnitDfpAuec,
      lineDfpAuec: line.baseLineDfpAuec,
      baseUnitDfpAuec: line.baseUnitDfpAuec,
    }))
    const itemPayloads = fulfillmentPreview.map((item) => ({
      resourceKey: item.resourceKey,
      quantity: item.quantity,
    }))

    const result = isEditing
      ? await updateCustomOrderRequester({
          orderId: editOrder!.id,
          title: editOrder!.title,
          notes,
          totalDfpAuec: cartTotalDfp,
          minFulfillerReputation: minFulfillerRep ? Number(minFulfillerRep) : null,
          blueprints: blueprintPayloads,
          resources: resourcePayloads,
          items: itemPayloads,
          orderOverridesMap,
          listingType: editOrder!.listing_type === 'wts' ? 'wts' : 'wtb',
          sellEntireListing: false,
        })
      : await appendToMyListing({
          listingType,
          blueprints: blueprintPayloads,
          resources: resourcePayloads,
          items: itemPayloads,
          notes,
          minFulfillerReputation: minFulfillerRep ? Number(minFulfillerRep) : null,
          orderOverridesMap,
        })

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
      onDraftCleared?.()
    }
    onSubmitted?.()
  }

  const initiateSubmit = (listingType: 'wtb' | 'wts') => {
    if (bpCart.length === 0 && resCart.length === 0) return

    const bpsWithNoOwners = bpCart
      .filter((line) => blueprintOwnerCounts[line.blueprintId] === 0)
      .map((line) => line.blueprintTitle)

    if (bpsWithNoOwners.length > 0 && !showNoOwnerWarning) {
      setPendingListingType(listingType)
      setNoOwnerBlueprints(bpsWithNoOwners)
      setShowNoOwnerWarning(true)
      return
    }

    void submitOrder(listingType)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  const handleConfirmNoOwnerWarning = () => {
    setShowNoOwnerWarning(false)
    void submitOrder(pendingListingType)
  }

  const cartEmpty = bpCart.length === 0 && resCart.length === 0
  const buyDisabled = submitting || cartEmpty
  const sellDisabled = submitting || cartEmpty || !canCreateSellOrder
  const dfpSuffix =
    dfpDisplayEnabled && cartTotalDfp > 0 ? ` · ${formatDfpAuec(cartTotalDfp)}` : ''

  return (
    <>
      <p className="text-slate-400 text-sm mb-4">
        Add <strong className="text-slate-300">crafted blueprints</strong>{' '}
        (full{' '}
        <a
          href="/archive#dfp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400/70 hover:text-orange-300 underline"
        >
          DFP
        </a>
        ) and/or <strong className="text-slate-300">refined materials</strong>{' '}
        (material-only DFP at your quality tier) to your buy (WTB) or sell (WTS) listing.
        You have one listing of each type — new items are added to it, and everything is
        priced at exact DFP.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2 p-1 site-surface w-fit">
          <button
            type="button"
            onClick={() => setMode('blueprint')}
            className={`px-3 py-1.5 text-sm rounded-lg site-btn-shimmer ${
              mode === 'blueprint' ? 'site-filter-selected-red' : 'site-filter-idle'
            }`}
          >
            Add Item
          </button>
          <button
            type="button"
            onClick={() => setMode('resource')}
            className={`px-3 py-1.5 text-sm rounded-lg site-btn-shimmer ${
              mode === 'resource' ? 'site-filter-selected-amber' : 'site-filter-idle'
            }`}
          >
            Add Commodity
          </button>
        </div>

        {mode === 'blueprint' ? (
          <div className="site-surface p-4 space-y-3">
            <BlueprintTypeahead
              blueprints={blueprints}
              selectedBlueprint={selectedBlueprint}
              onSelect={(bp) => setSelectedBlueprintId(bp.internalName ?? '')}
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
                {!selectedIsAmmo && selectedBlueprint.slots && selectedBlueprint.slots.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs">Set quality per craft slot (Band 2 default).</p>
                    {selectedBlueprint.slots.map((slot, idx) => (
                      <BlueprintSlotQualityCard
                        key={idx}
                        slot={slot}
                        slotIndex={idx}
                        quality={effectiveBpSlotQualities[idx]}
                        onQualityChange={(slotIndex, quality) =>
                          setBpSlotQualities((prev) => ({ ...prev, [slotIndex]: quality }))
                        }
                        compact
                      />
                    ))}
                    {selectedBlueprintEffectiveModifiers.length > 0 && (
                      <BlueprintEffectiveStatsSummary
                        modifiers={selectedBlueprintEffectiveModifiers}
                      />
                    )}
                  </div>
                )}
                <div className={`grid gap-2 ${selectedIsAmmo ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                  <input
                    type="number"
                    min={1}
                    value={bpQty}
                    onChange={(e) => setBpQty(e.target.value)}
                    placeholder="Qty"
                    className="px-3 py-2 site-input text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={addBlueprint}
                    disabled={!selectedCanOrder}
                    className="site-btn-secondary py-2 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                {dfpDisplayEnabled && selectedBlueprintPricing && (
                  <p className="text-amber-200/90 text-xs">
                    Craft DFP: {formatDfpLabel(selectedBlueprintPricing.lineDfpAuec)} (
                    {formatSlotQualitySummary(effectiveBpSlotQualities)})
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="site-surface p-4 space-y-3">
            <ResourceTypeahead
              resources={activeCatalog}
              selectedResource={selectedResource ?? null}
              onSelect={(r) => setResourceKey(r.resource_key)}
            />
            {selectedResource && (
              <>
                {selectedResIsSalvage && (
                  <p className="text-slate-400 text-xs">
                    Salvage — always Q0. No quality tier on RMC or construction material.
                  </p>
                )}
                {selectedResIsHarvest && (
                  <p className="text-slate-400 text-xs">
                    Harvest item — whole units only. Priced by farm effort, not quality tier.
                  </p>
                )}
                <div className={`grid gap-2 ${selectedResNoQuality ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {!selectedResNoQuality && (
                resourceBands ? (
                  <select
                    value={resQuality}
                    onChange={(e) => setResQuality(e.target.value)}
                    className="px-3 py-2 site-input text-white text-sm"
                    aria-label="Quality band"
                  >
                    {showPurchasedQuality && (
                      <option value={PURCHASED_STOCK_QUALITY}>Purchased (Q0)</option>
                    )}
                    {resourceBands.map((bandValue, idx) => {
                      const tier = getQualityTier(bandValue)
                      return (
                        <option key={idx} value={bandValue} className={getQualityTierColor(tier)}>
                          Band {idx + 1}: Q{bandValue}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="range"
                      min={1}
                      max={1000}
                      step={1}
                      value={resQuality}
                      onChange={(e) => setResQuality(e.target.value)}
                      className="site-range flex-1 min-w-0"
                      aria-label="Quality slider"
                    />
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={resQuality}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        if (!isNaN(val) && val >= 1 && val <= 1000) {
                          setResQuality(String(val))
                        }
                      }}
                      className="site-input w-16 px-2 py-1.5 text-sm text-orange-400 font-mono text-center shrink-0"
                      aria-label="Quality value"
                    />
                  </div>
                )
              )}
              <ResourceQuantityInput
                resourceKey={selectedResource?.resource_key}
                value={resQty}
                onValueChange={setResQty}
                placeholder={selectedResQtyUnit}
                className="px-3 py-2 site-input text-white text-sm tabular-nums"
              />
              <button
                type="button"
                onClick={addResource}
                disabled={!selectedResource}
                className="site-btn-secondary py-2"
              >
                Add
              </button>
                </div>
                {dfpDisplayEnabled &&
                  parseQuantityForResource(selectedResource.resource_key, resQty) != null && (
                  <p className="text-amber-200/90 text-xs">
                    Material DFP:{' '}
                    {formatDfpLabel(
                      pricingForResourceLine(
                        selectedResource.resource_key,
                        selectedResource.label,
                        Number(resQuality) || DEFAULT_STOCK_QUALITY,
                        parseQuantityForResource(selectedResource.resource_key, resQty)!
                      ).lineDfpAuec
                    )}
                    {selectedResNoQuality && (
                      <span className="text-slate-400"> · Base price only (Q0)</span>
                    )}
                    {resUsesFlatBandPrice && (
                      <span className="text-slate-400"> · Purchased Q0 (Q500) or Band 1 below store</span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {(bpCart.length > 0 || resCart.length > 0) && (
          <div className="site-surface overflow-hidden">
            <div className="site-section-header px-3 py-2">
              <p className="text-amber-100/80 text-xs font-medium uppercase tracking-wide">
                {isEditing ? 'Order lines' : 'Items to add'} ({bpCart.length + resCart.length})
              </p>
            </div>
            <ul className="divide-y divide-orange-500/10 p-2 space-y-2">
              {bpCart.map((line) => {
                const blueprint = blueprintById.get(line.blueprintId)
                const isExpanded = expandedCartKey === line.cartKey
                const isMixed = line.slotQualities && !isUniformSlotQuality(line.slotQualities)

                if (isExpanded && blueprint) {
                  return (
                    <li key={line.cartKey}>
                      <CartBlueprintLineEditor
                        line={line}
                        blueprint={blueprint}
                        showDfp={dfpDisplayEnabled}
                        onUpdate={updateBlueprintCartLine}
                        onRemove={removeBlueprintCartLine}
                        onCollapse={() => setExpandedCartKey(null)}
                      />
                    </li>
                  )
                }

                return (
                  <li
                    key={line.cartKey}
                    className="px-3 py-2 text-sm site-card space-y-2"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-white block">
                          {line.blueprintTitle} × {line.quantity}
                        </span>
                        <span className={`text-xs ${isMixed ? 'text-orange-300' : 'text-slate-400'}`}>
                          {formatSlotQualityLabel(line)}
                        </span>
                        <CartBlueprintLineStats line={line} blueprintById={blueprintById} />
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 self-start">
                        {dfpDisplayEnabled && (
                          <span className="text-amber-300 text-xs">
                            {formatDfpAuec(line.lineDfpAuec)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedCartKey(line.cartKey)}
                          className="text-orange-400 hover:text-orange-300 text-xs underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBlueprintCartLine(line.cartKey)}
                          className="text-red-400 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
              {resCart.map((line) => (
                <li
                  key={line.cartKey}
                  className="px-3 py-2 text-sm site-card space-y-2"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-white">
                      <span className={resourceLabelClassName(line.resourceKey)}>
                        {line.resourceLabel}
                      </span>{' '}
                      · {formatQuantityForResource(line.resourceKey, line.quantityScu)}{' '}
                      {resourceQuantityUnitLabel(line.resourceKey)} ·{' '}
                      {formatResourceOrderQualityLabel(
                        line.resourceKey,
                        line.resourceLabel,
                        line.minQuality
                      )}
                    </span>
                    <div className="flex items-start gap-2 shrink-0">
                      {dfpDisplayEnabled && (
                        <span className="text-amber-300">{formatDfpAuec(line.lineDfpAuec)}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setResCart((p) => p.filter((l) => l.cartKey !== line.cartKey))}
                        className="text-red-400 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {dfpDisplayEnabled && (
              <div className="px-3 py-3 bg-amber-950/30 border-t border-amber-500/20 flex justify-between">
                <span className="text-amber-200 text-sm font-medium">Total (DFP)</span>
                <span className="text-amber-100 font-bold">
                  {formatDfpAuec(cartTotalDfp)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="site-surface p-4 space-y-2">
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
            className="w-full sm:w-48 px-3 py-2 site-input text-white text-sm"
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
          className="w-full px-3 py-2 site-input text-white text-sm"
        />

        {fulfillmentPreview.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fulfillmentPreview.map((item) => (
              <span
                key={item.resourceKey}
                className={`px-2 py-1 text-xs rounded border ${resourceChipClassName(item.resourceKey)}`}
              >
                {getResourceLabel(item.resourceKey, labelMap)} ×{' '}
                {formatQuantityForResource(item.resourceKey, item.quantity)}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={() => initiateSubmit(editOrder?.listing_type === 'wts' ? 'wts' : 'wtb')}
              disabled={buyDisabled}
              className="px-4 py-2 site-btn-danger text-sm font-medium"
            >
              {submitting
                ? 'Saving...'
                : dfpDisplayEnabled
                  ? `Save changes${dfpSuffix}`
                  : 'Save changes'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => initiateSubmit('wtb')}
                disabled={buyDisabled}
                className="px-4 py-2 site-btn-danger text-sm font-medium"
              >
                {submitting ? 'Submitting...' : `Add to my WTB listing${dfpSuffix}`}
              </button>
              <button
                type="button"
                onClick={() => initiateSubmit('wts')}
                disabled={sellDisabled}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {submitting ? 'Submitting...' : `Add to my WTS listing${dfpSuffix}`}
              </button>
            </>
          )}
          {isEditing && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="site-btn-secondary"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {showNoOwnerWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="site-menu-panel border-amber-500/40 p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <span>⚠️</span> No Owners Found
            </h3>
            <p className="text-slate-300 mb-3">
              The following blueprint{noOwnerBlueprints.length > 1 ? 's have' : ' has'} not been acquired by any members yet:
            </p>
            <ul className="mb-4 space-y-1">
              {noOwnerBlueprints.map((title, i) => (
                <li key={i} className="text-amber-300 text-sm pl-4">• {title}</li>
              ))}
            </ul>
            <p className="text-slate-400 text-sm mb-4">
              This order may take longer to fulfill since no one currently owns {noOwnerBlueprints.length > 1 ? 'these blueprints' : 'this blueprint'}.
              Consider starting with easier items.
            </p>
            <a
              href="/archive#ordering-tips"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 text-sm underline mb-6 inline-block"
            >
              View ordering best practices
            </a>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNoOwnerWarning(false)}
                className="site-btn-secondary flex-1"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmNoOwnerWarning}
                className="flex-1 site-btn-primary site-btn-shimmer"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
