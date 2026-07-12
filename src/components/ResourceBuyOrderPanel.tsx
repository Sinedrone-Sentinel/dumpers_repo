import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import BlueprintTypeahead from './BlueprintTypeahead'
import BlueprintSlotQualityCard from './BlueprintSlotQualityCard'
import AuecTransferLimitModal from './AuecTransferLimitModal'
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
import WtsListPriceSlider from './WtsListPriceSlider'
import { REPUTATION_STAR_OPTIONS } from '../config/reputation'
import { exceedsSingleTransferLimit } from '../lib/auecTransferLimits'
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
import { resourceChipClassName } from '../config/resourceTypes'
import {
  formatQuantityForResource,
  parseQuantityForResource,
} from '../lib/resourceQuantity'
import {
  applyPartialLineAdjustment,
  clampAdjustmentPct,
  computeCartListTotalDfp,
  createCartPricingFields,
  deriveAdjustmentPct,
  deriveOrderAdjustmentPct,
  buildWtsListedTotals,
  WTS_FULL_MAX_ADJUST_PCT,
  WTS_PARTIAL_MAX_ADJUST_PCT,
} from '../lib/wtsListPricing'

interface WtsCartFields {
  baseUnitDfpAuec: number
  baseLineDfpAuec: number
  priceAdjustmentPct: number
}

interface CartBlueprintLine extends OrderBlueprintLine, WtsCartFields {
  cartKey: string
  slotQualities?: Record<number, number>
}

interface CartResourceLine extends OrderResourceLine, WtsCartFields {
  cartKey: string
}

interface ResourceBuyOrderPanelProps {
  userId: string
  blueprints: BlueprintWithSlots[]
  catalog: BlueprintResourceRow[]
  labelMap: Record<string, string>
  orderOverridesMap?: Record<string, boolean>
  editOrder?: CustomOrder | null
  hasPendingBuyerRep?: boolean
  minOrderValue?: number
  canCreateSellOrder?: boolean
  initialBlueprintLines?: CartBlueprintLine[]
  blueprintOwnerCounts?: Record<string, number>
  onCancelEdit?: () => void
  onSubmitted?: () => void
  onError?: (message: string) => void
  onForceEditOrder?: (orderId: string) => void
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
  userId,
  blueprints,
  catalog,
  labelMap,
  orderOverridesMap = {},
  editOrder,
  hasPendingBuyerRep = false,
  minOrderValue = 10000,
  canCreateSellOrder = true,
  initialBlueprintLines,
  blueprintOwnerCounts = {},
  onCancelEdit,
  onSubmitted,
  onError,
  onForceEditOrder,
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
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [duplicatePendingModal, setDuplicatePendingModal] = useState<{
    show: boolean
    existingOrderId: string
  }>({ show: false, existingOrderId: '' })
  const [duplicateActiveModal, setDuplicateActiveModal] = useState<{
    show: boolean
    message: string
  }>({ show: false, message: '' })
  const [pendingListingType, setPendingListingType] = useState<'wtb' | 'wts'>('wtb')
  const [expandedCartKey, setExpandedCartKey] = useState<string | null>(null)
  const [sellEntireListing, setSellEntireListing] = useState(false)
  const [orderPriceAdjustmentPct, setOrderPriceAdjustmentPct] = useState(0)

  const showWtsPricingControls =
    !isEditing || editOrder?.listing_type === 'wts'
  const isEditingWts = isEditing && editOrder?.listing_type === 'wts'

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
    setSellEntireListing(editOrder.sell_entire_listing === true)
    setMode(
      resolveOrderBlueprintLines(editOrder).length > 0 ? 'blueprint' : 'resource'
    )
  }, [editOrder])

  useEffect(() => {
    if (!editOrder) return

    const bpLines = resolveOrderBlueprintLines(editOrder).map((line) => ({
      ...line,
      cartKey: nextCartKey(),
    }))
    const resLines = resolveOrderResourceLines(editOrder).map((line) => ({
      ...line,
      cartKey: nextCartKey(),
    }))

    if (editOrder.listing_type !== 'wts') {
      setOrderPriceAdjustmentPct(0)
      setBpCart(
        bpLines.map((line) => ({
          ...line,
          ...createCartPricingFields(line.unitDfpAuec, line.lineDfpAuec),
        }))
      )
      setResCart(
        resLines.map((line) => ({
          ...line,
          ...createCartPricingFields(line.unitDfpAuec, line.lineDfpAuec),
        }))
      )
      return
    }

    const isFullListing = editOrder.sell_entire_listing === true
    let baseTotal = 0

    const hydratedBp = bpLines.map((line) => {
      const blueprint = blueprintById.get(line.blueprintId)
      const pricing = blueprint
        ? pricingForBlueprintLine(
            blueprint,
            line.slotQualities ?? {},
            line.quantity
          )
        : { unitDfpAuec: line.unitDfpAuec, lineDfpAuec: line.lineDfpAuec, orderMinQuality: line.minQuality }
      baseTotal += pricing.lineDfpAuec

      if (isFullListing) {
        return {
          ...line,
          ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
          unitDfpAuec: line.unitDfpAuec,
          lineDfpAuec: line.lineDfpAuec,
        }
      }

      const pct = clampAdjustmentPct(
        deriveAdjustmentPct(pricing.unitDfpAuec, line.unitDfpAuec),
        WTS_PARTIAL_MAX_ADJUST_PCT
      )
      return applyPartialLineAdjustment(
        {
          ...line,
          ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec, pct),
        },
        pct
      )
    })

    const hydratedRes = resLines.map((line) => {
      const pricing = pricingForResourceLine(
        line.resourceKey,
        line.resourceLabel,
        line.minQuality,
        line.quantityScu
      )
      baseTotal += pricing.lineDfpAuec

      if (isFullListing) {
        return {
          ...line,
          ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec),
          unitDfpAuec: line.unitDfpAuec,
          lineDfpAuec: line.lineDfpAuec,
        }
      }

      const pct = clampAdjustmentPct(
        deriveAdjustmentPct(pricing.unitDfpAuec, line.unitDfpAuec),
        WTS_PARTIAL_MAX_ADJUST_PCT
      )
      return applyPartialLineAdjustment(
        {
          ...line,
          ...createCartPricingFields(pricing.unitDfpAuec, pricing.lineDfpAuec, pct),
        },
        pct
      )
    })

    setBpCart(hydratedBp)
    setResCart(hydratedRes)
    setOrderPriceAdjustmentPct(
      isFullListing
        ? clampAdjustmentPct(
            deriveOrderAdjustmentPct(baseTotal, editOrder.total_dfp_auec),
            WTS_FULL_MAX_ADJUST_PCT
          )
        : 0
    )
  }, [editOrder, blueprintById])

  // Initialize cart from draft items (consume session draft once loaded into cart)
  const draftConsumedRef = useRef(false)
  useEffect(() => {
    if (editOrder || !initialBlueprintLines || initialBlueprintLines.length === 0) {
      draftConsumedRef.current = false
      return
    }
    if (draftConsumedRef.current) return

    draftConsumedRef.current = true
    setBpCart(
      initialBlueprintLines.map((line) => ({
        ...line,
        baseUnitDfpAuec: line.baseUnitDfpAuec ?? line.unitDfpAuec,
        baseLineDfpAuec: line.baseLineDfpAuec ?? line.lineDfpAuec,
        priceAdjustmentPct: line.priceAdjustmentPct ?? 0,
      }))
    )
    setMode('blueprint')
    setExpandedCartKey(initialBlueprintLines[0]?.cartKey ?? null)
    onDraftCleared?.()
  }, [editOrder, initialBlueprintLines, onDraftCleared])

  const activeCatalog = useMemo(
    () => [...catalog].filter((r) => r.is_active).sort((a, b) => a.label.localeCompare(b.label)),
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

  const cartBaseTotalDfp = useMemo(
    () =>
      bpCart.reduce((s, l) => s + l.baseLineDfpAuec, 0) +
      resCart.reduce((s, l) => s + l.baseLineDfpAuec, 0),
    [bpCart, resCart]
  )

  const cartListTotalDfp = useMemo(
    () =>
      computeCartListTotalDfp(bpCart, resCart, sellEntireListing, orderPriceAdjustmentPct),
    [bpCart, resCart, sellEntireListing, orderPriceAdjustmentPct]
  )

  const wtsListedPreview = useMemo(() => {
    if (!showWtsPricingControls || !sellEntireListing) return null
    return buildWtsListedTotals(bpCart, resCart, true, orderPriceAdjustmentPct)
  }, [showWtsPricingControls, sellEntireListing, bpCart, resCart, orderPriceAdjustmentPct])

  const displayCartTotalDfp =
    showWtsPricingControls && (sellEntireListing || cartListTotalDfp !== cartBaseTotalDfp)
      ? cartListTotalDfp
      : cartBaseTotalDfp

  const showPartialLineSliders = showWtsPricingControls && !sellEntireListing
  const showOrderTotalSlider = showWtsPricingControls && sellEntireListing

  const getBlueprintLineDfp = (line: CartBlueprintLine) =>
    wtsListedPreview?.blueprintPrices.get(line.cartKey)?.lineDfpAuec ?? line.lineDfpAuec

  const getResourceLineDfp = (line: CartResourceLine) =>
    wtsListedPreview?.resourcePrices.get(line.cartKey)?.lineDfpAuec ?? line.lineDfpAuec

  const handleBlueprintLinePriceAdjustment = (cartKey: string, pct: number) => {
    setBpCart((prev) =>
      prev.map((line) =>
        line.cartKey === cartKey ? applyPartialLineAdjustment(line, pct) : line
      )
    )
  }

  const handleResourceLinePriceAdjustment = (cartKey: string, pct: number) => {
    setResCart((prev) =>
      prev.map((line) =>
        line.cartKey === cartKey ? applyPartialLineAdjustment(line, pct) : line
      )
    )
  }

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

  const _updateResourceCartLine = (
    cartKey: string,
    updates: Partial<CartResourceLine>
  ) => {
    setResCart((prev) =>
      prev.map((line) => (line.cartKey === cartKey ? { ...line, ...updates } : line))
    )
  }

  const handleSellEntireListingChange = (checked: boolean) => {
    setSellEntireListing(checked)
    if (checked) {
      setBpCart((prev) =>
        prev.map((line) => ({
          ...line,
          priceAdjustmentPct: 0,
          unitDfpAuec: line.baseUnitDfpAuec,
          lineDfpAuec: line.baseLineDfpAuec,
        }))
      )
      setResCart((prev) =>
        prev.map((line) => ({
          ...line,
          priceAdjustmentPct: 0,
          unitDfpAuec: line.baseUnitDfpAuec,
          lineDfpAuec: line.baseLineDfpAuec,
        }))
      )
      setOrderPriceAdjustmentPct(0)
      return
    }
    setOrderPriceAdjustmentPct(0)
  }

  const blueprintPayloadFromCart = (
    line: CartBlueprintLine,
    listed?: { unitDfpAuec: number; lineDfpAuec: number }
  ) => {
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
      unitDfpAuec: listed?.unitDfpAuec ?? line.unitDfpAuec,
      lineDfpAuec: listed?.lineDfpAuec ?? line.lineDfpAuec,
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

    const effectiveListingType =
      isEditing && editOrder?.listing_type === 'wts' ? 'wts' : listingType
    const useWtsPricing = effectiveListingType === 'wts'

    let totalDfpAuec = cartBaseTotalDfp
    let blueprintPayloads = bpCart.map((line) =>
      blueprintPayloadFromCart(line, {
        unitDfpAuec: line.baseUnitDfpAuec,
        lineDfpAuec: line.baseLineDfpAuec,
      })
    )
    let resourcePayloads = resCart.map((line) => ({
      resourceKey: line.resourceKey,
      resourceLabel: line.resourceLabel,
      minQuality: line.minQuality,
      quantityScu: line.quantityScu,
      unitDfpAuec: line.baseUnitDfpAuec,
      lineDfpAuec: line.baseLineDfpAuec,
      baseUnitDfpAuec: line.baseUnitDfpAuec,
    }))

    if (useWtsPricing) {
      const listed = buildWtsListedTotals(
        bpCart,
        resCart,
        sellEntireListing,
        orderPriceAdjustmentPct
      )
      totalDfpAuec = listed.totalDfpAuec
      blueprintPayloads = bpCart.map((line) =>
        blueprintPayloadFromCart(line, listed.blueprintPrices.get(line.cartKey))
      )
      resourcePayloads = resCart.map((line) => {
        const prices = listed.resourcePrices.get(line.cartKey)!
        return {
          resourceKey: line.resourceKey,
          resourceLabel: line.resourceLabel,
          minQuality: line.minQuality,
          quantityScu: line.quantityScu,
          unitDfpAuec: prices.unitDfpAuec,
          lineDfpAuec: prices.lineDfpAuec,
          baseUnitDfpAuec: line.baseUnitDfpAuec,
        }
      })
    }

    const payload = {
      title: buildOrderTitle(
        bpCart.reduce((sum, line) => sum + line.quantity, 0),
        resCart.length
      ),
      notes,
      totalDfpAuec,
      minFulfillerReputation: minFulfillerRep ? Number(minFulfillerRep) : null,
      blueprints: blueprintPayloads,
      resources: resourcePayloads,
      items: fulfillmentPreview.map((item) => ({
        resourceKey: item.resourceKey,
        quantity: item.quantity,
      })),
    }

    const result = isEditing
      ? await updateCustomOrderRequester({
          orderId: editOrder!.id,
          ...payload,
          orderOverridesMap,
          listingType: editOrder!.listing_type === 'wts' ? 'wts' : 'wtb',
          sellEntireListing,
        })
      : await createCustomOrder({
          requesterId: userId,
          listingType,
          ...payload,
          orderOverridesMap,
          sellEntireListing: listingType === 'wts' ? sellEntireListing : true,
        })

    setSubmitting(false)
    setShowTransferModal(false)

    if (result.error) {
      if (result.errorType === 'duplicate_pending' && result.existingOrderId) {
        setDuplicatePendingModal({
          show: true,
          existingOrderId: result.existingOrderId,
        })
        return
      }

      if (result.errorType === 'duplicate_active') {
        setDuplicateActiveModal({
          show: true,
          message: result.error,
        })
        return
      }

      onError?.(result.error)
      return
    }

    if (!isEditing) {
      setBpCart([])
      setResCart([])
      setNotes('')
      setMinFulfillerRep('')
      setOrderPriceAdjustmentPct(0)
      onDraftCleared?.()
    }
    onSubmitted?.()
  }

  const getSubmitTotalForListingType = (listingType: 'wtb' | 'wts') =>
    listingType === 'wts' ? cartListTotalDfp : cartBaseTotalDfp

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

    if (exceedsSingleTransferLimit(getSubmitTotalForListingType(listingType))) {
      setPendingListingType(listingType)
      setShowTransferModal(true)
      return
    }
    void submitOrder(listingType)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  const handleConfirmNoOwnerWarning = () => {
    setShowNoOwnerWarning(false)
    if (exceedsSingleTransferLimit(getSubmitTotalForListingType(pendingListingType))) {
      setShowTransferModal(true)
      return
    }
    void submitOrder(pendingListingType)
  }

  const cartEmpty = bpCart.length === 0 && resCart.length === 0
  const buyDisabled =
    submitting ||
    cartEmpty ||
    (hasPendingBuyerRep && !isEditing && cartBaseTotalDfp < minOrderValue)
  const sellDisabled = submitting || cartEmpty || !canCreateSellOrder
  const buyDfpSuffix =
    dfpDisplayEnabled && cartBaseTotalDfp > 0 ? ` · ${formatDfpAuec(cartBaseTotalDfp)}` : ''
  const sellDfpSuffix =
    dfpDisplayEnabled && cartListTotalDfp > 0 ? ` · ${formatDfpAuec(cartListTotalDfp)}` : ''
  const editDfpSuffix =
    dfpDisplayEnabled && (isEditingWts ? cartListTotalDfp : cartBaseTotalDfp) > 0
      ? ` · ${formatDfpAuec(isEditingWts ? cartListTotalDfp : cartBaseTotalDfp)}`
      : ''

  return (
    <>
      <p className="text-slate-400 text-sm mb-4">
        Build an order from <strong className="text-slate-300">crafted blueprints</strong>{' '}
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
        (material-only DFP at your quality tier). Submit as a buy request (WTB) or a sell listing (WTS).
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
                    className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={addBlueprint}
                    disabled={!selectedCanOrder}
                    className="py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm"
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
                    className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
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
                      className="flex-1 min-w-0 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
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
                      className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-orange-400 font-mono text-center shrink-0"
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
            {dfpDisplayEnabled &&
              selectedResource &&
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
                  <span className="text-slate-400"> · Base price only (Q0 / Band 1)</span>
                )}
              </p>
            )}
          </div>
        )}

        {(bpCart.length > 0 || resCart.length > 0) && (
          <div className="border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                Order lines ({bpCart.length + resCart.length})
              </p>
            </div>
            <ul className="divide-y divide-slate-800 p-2 space-y-2">
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
                        showWtsPriceSlider={showPartialLineSliders}
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
                    className="px-3 py-2 text-sm bg-slate-900/40 rounded-lg space-y-2"
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
                            {formatDfpAuec(getBlueprintLineDfp(line))}
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
                    {showPartialLineSliders && (
                      <WtsListPriceSlider
                        label="Unit list price"
                        value={line.priceAdjustmentPct}
                        maxPct={WTS_PARTIAL_MAX_ADJUST_PCT}
                        baseAuec={line.baseUnitDfpAuec}
                        adjustedAuec={line.unitDfpAuec}
                        onChange={(pct) => handleBlueprintLinePriceAdjustment(line.cartKey, pct)}
                        compact
                      />
                    )}
                  </li>
                )
              })}
              {resCart.map((line) => (
                <li
                  key={line.cartKey}
                  className="px-3 py-2 text-sm bg-slate-900/40 rounded-lg space-y-2"
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
                        <span className="text-amber-300">{formatDfpAuec(getResourceLineDfp(line))}</span>
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
                  {showPartialLineSliders && (
                    <WtsListPriceSlider
                      label="Unit list price"
                      value={line.priceAdjustmentPct}
                      maxPct={WTS_PARTIAL_MAX_ADJUST_PCT}
                      baseAuec={line.baseUnitDfpAuec}
                      adjustedAuec={line.unitDfpAuec}
                      onChange={(pct) => handleResourceLinePriceAdjustment(line.cartKey, pct)}
                      compact
                    />
                  )}
                </li>
              ))}
            </ul>
            {showOrderTotalSlider && (
              <div className="px-3 py-3 border-t border-cyan-800/30 bg-cyan-950/20">
                <WtsListPriceSlider
                  label="Listing total"
                  value={orderPriceAdjustmentPct}
                  maxPct={WTS_FULL_MAX_ADJUST_PCT}
                  baseAuec={cartBaseTotalDfp}
                  adjustedAuec={cartListTotalDfp}
                  onChange={(pct) =>
                    setOrderPriceAdjustmentPct(
                      clampAdjustmentPct(pct, WTS_FULL_MAX_ADJUST_PCT)
                    )
                  }
                />
              </div>
            )}
            {dfpDisplayEnabled && (
              <div className="px-3 py-3 bg-amber-950/30 border-t border-amber-500/20 flex justify-between">
                <span className="text-amber-200 text-sm font-medium">
                  {showWtsPricingControls && displayCartTotalDfp !== cartBaseTotalDfp
                    ? 'List total'
                    : 'Total'}
                </span>
                <span className="text-amber-100 font-bold">
                  {formatDfpAuec(displayCartTotalDfp)}
                </span>
              </div>
            )}
          </div>
        )}

        {dfpDisplayEnabled &&
          (exceedsSingleTransferLimit(cartBaseTotalDfp) ||
            (showWtsPricingControls && exceedsSingleTransferLimit(cartListTotalDfp))) && (
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

        <div className="bg-slate-900/60 border border-cyan-700/30 rounded-xl p-4 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sellEntireListing}
              onChange={(e) => handleSellEntireListingChange(e.target.checked)}
              className="mt-0.5 accent-cyan-500"
            />
            <div>
              <span className="text-slate-300 text-sm font-medium">
                Buyers must purchase the full listing
              </span>
              <p className="text-slate-500 text-xs mt-1">
                Applies to sell (WTS) orders only. Off by default — buyers can pick items and
                quantities on Fulfillment. Check this if the whole listing must sell together.
              </p>
            </div>
          </label>
        </div>

        {showWtsPricingControls && (
          <div className="bg-slate-900/60 border border-cyan-700/30 rounded-xl p-4 space-y-2">
            <p className="text-cyan-300 text-sm font-medium">List price (WTS)</p>
            <p className="text-slate-500 text-xs">
              Adjust sell prices relative to Dumper&apos;s Fair-Value Price (DFP). 0% is the DFP
              base. Partial listings: ±20% per line on unit price. Full listing only: ±10% on the
              order total, distributed across lines.
            </p>
          </div>
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
                className={`px-2 py-1 text-xs rounded border ${resourceChipClassName(item.resourceKey)}`}
              >
                {getResourceLabel(item.resourceKey, labelMap)} ×{' '}
                {formatQuantityForResource(item.resourceKey, item.quantity)}
              </span>
            ))}
          </div>
        )}

        {hasPendingBuyerRep && !isEditing && cartBaseTotalDfp > 0 && cartBaseTotalDfp < minOrderValue && (
          <div className="p-3 bg-yellow-900/30 border border-yellow-600/40 rounded-lg">
            <p className="text-yellow-300 text-sm">
              <strong>Minimum order value:</strong> While building your reputation, orders must be at
              least {formatDfpAuec(minOrderValue)}. Current total: {formatDfpAuec(cartBaseTotalDfp)}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={() => initiateSubmit(editOrder?.listing_type === 'wts' ? 'wts' : 'wtb')}
              disabled={buyDisabled}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {submitting
                ? 'Saving...'
                : dfpDisplayEnabled
                  ? `Save changes${editDfpSuffix}`
                  : 'Save changes'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => initiateSubmit('wtb')}
                disabled={buyDisabled}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {submitting ? 'Submitting...' : `Submit Buy Order${buyDfpSuffix}`}
              </button>
              <button
                type="button"
                onClick={() => initiateSubmit('wts')}
                disabled={sellDisabled}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {submitting ? 'Submitting...' : `Submit Sell Order${sellDfpSuffix}`}
              </button>
            </>
          )}
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
          totalAuec={getSubmitTotalForListingType(pendingListingType)}
          onConfirm={() => void submitOrder(pendingListingType)}
          onCancel={() => setShowTransferModal(false)}
          confirming={submitting}
        />
      )}

      {showNoOwnerWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-6 max-w-md mx-4 shadow-xl">
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
              Consider creating separate orders for easier items.
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
                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmNoOwnerWarning}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicatePendingModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-orange-500/40 rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-orange-400 mb-3">Existing Order Found</h3>
            <p className="text-slate-300 mb-6">
              Pending order found with same Blueprint. Pulling your existing order back for editing.
            </p>
            <button
              onClick={() => {
                setDuplicatePendingModal({ show: false, existingOrderId: '' })
                onForceEditOrder?.(duplicatePendingModal.existingOrderId)
              }}
              className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {duplicateActiveModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-500/40 rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-red-400 mb-3">Order Blocked</h3>
            <p className="text-slate-300 mb-6">{duplicateActiveModal.message}</p>
            <button
              onClick={() => setDuplicateActiveModal({ show: false, message: '' })}
              className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
