import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import BlueprintCard from '../BlueprintCard'
import BlueprintDetailsModal from '../BlueprintDetailsModal'
import BlueprintMaterialFilter from '../BlueprintMaterialFilter'
import BlueprintRewardMissionsModal from '../BlueprintRewardMissionsModal'
import BlueprintVariantGroupCard from '../BlueprintVariantGroupCard'
import VirtualizedBlueprintGrid from '../VirtualizedBlueprintGrid'
import { useAuth } from '../../contexts/AuthContext'
import { useBlueprintOrderOverrides } from '../../hooks/useBlueprintOrderOverrides'
import { useBlueprintCraftTracker } from '../../hooks/useBlueprintCraftTracker'
import { useTargetList } from '../../hooks/useTargetList'
import { useAsyncEffect } from '../../hooks/useAsyncEffect'
import { matchesCanCraftTabBlueprint, canCraftBlueprint, isNearlyCraftableBlueprint } from '../../lib/canCraft'
import {
  buildOwnedStockIndex,
  type CraftPlanReduction,
  type CraftStockCardLite,
} from '../../lib/craftFromStock'
import {
  getResourceTrackerUiScope,
  readResourceTrackerUiState,
  writeResourceTrackerUiState,
} from '../../lib/resourceTrackerUiState'
import {
  canAddBlueprintToOrder,
  canAddBlueprintToTargetList,
  resolveIsOrderable,
} from '../../lib/blueprintOrderable'
import { getRewardMissionsForBlueprint } from '../../lib/blueprintMissionRewards'
import { stashBrowseMissionFromReward } from '../../lib/missionTrackerUiState'
import {
  FPS_WEAPON_TYPE_OPTIONS,
  formatSubtypeLabel,
  getArmorSlot as getArmorSlotFromPath,
  getArmorWeight as getArmorWeightFromTaxonomy,
  getBlueprintSubType,
} from '../../lib/blueprintTaxonomy'
import { blueprintUsesMaterial, extractBlueprintResources } from '../../lib/blueprintResources'
import { buildBlueprintGridItems, type BlueprintGridItem } from '../../lib/blueprintVariantGroups'
import {
  DEFAULT_BLUEPRINTS_CATEGORY,
  isBlueprintListable,
  isDefaultBlueprint,
  isDefaultBlueprintsCategory,
} from '../../lib/defaultBlueprints'
import { fetchBlueprintOwnerCounts } from '../../lib/operations'
import { useBlueprintData } from '../../routes/blueprints'

const getSubType = (bp: { categoryName?: string; subCategoryName?: string }) =>
  getBlueprintSubType(bp)

const getArmorWeight = (bp: { categoryName?: string; file?: string }) =>
  getArmorWeightFromTaxonomy(bp)

const getArmorSlot = (bp: { categoryName?: string; file?: string }) =>
  getArmorSlotFromPath(bp)

const MAIN_CATEGORY_GROUPS: Record<string, string[]> = {
  [DEFAULT_BLUEPRINTS_CATEGORY]: [],
  'FPS Weapons': ['FPSWeapons'],
  'FPS Armour': ['FPSArmours'],
  Ammo: ['Ammo'],
  'Vehicle Components': ['Veh. Comp. S0', 'Veh. Comp. S1', 'Veh. Comp. S2', 'Veh. Comp. S3', 'Veh. Comp. S4'],
  'Vehicle Weapons': [
    'Veh. Weapons S1',
    'Veh. Weapons S2',
    'Veh. Weapons S3',
    'Veh. Weapons S4',
    'Veh. Weapons S5',
    'Veh. Weapons S6',
  ],
  'Mission Items': ['MissionItem'],
}

const ARMOR_WEIGHT_OPTIONS = ['flight', 'light', 'medium', 'heavy', 'superheavy']
const ARMOR_SLOT_OPTIONS = ['helmet', 'arms', 'core', 'legs', 'backpack', 'flight', 'suit']

const ARMOR_SLOT_LABELS: Record<string, string> = {
  flight: 'Flight',
  suit: 'Suits',
}

const VEHICLE_SIZE_OPTIONS: Record<string, string[]> = {
  'Vehicle Components': ['S0', 'S1', 'S2', 'S3', 'S4'],
  'Vehicle Weapons': ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
}

const STATIC_SUBTYPE_OPTIONS: Record<string, string[]> = {
  'FPS Weapons': FPS_WEAPON_TYPE_OPTIONS,
  Ammo: FPS_WEAPON_TYPE_OPTIONS,
  'FPS Armour': [
    'standard',
    'flightsuit',
    'undersuit',
    'explorer',
    'salvager',
    'stealth',
    'shirt',
    'jacket',
    'pants',
    'shoes',
    'gloves',
  ],
}

const formatSubType = formatSubtypeLabel

type CanCraftTabProps = {
  quantityByKey: Record<string, number>
  hasTrackedStock: boolean
  /** Per-(resource, quality, note) stock lines used to power the CRAFT button. */
  stockCardsForCraft: CraftStockCardLite[]
  onCraft: (reductions: CraftPlanReduction[]) => Promise<{ error?: string }>
}

export default function CanCraftTab({
  quantityByKey,
  hasTrackedStock,
  stockCardsForCraft,
  onCraft,
}: CanCraftTabProps) {
  const navigate = useNavigate()
  const {
    acquiredBlueprints: myAcquiredBlueprints,
    toggleAcquired,
    canModifyBlueprints,
    isPending,
    user,
    isApproved,
    isSuperAdmin,
    isGuestPreview,
    groupBlueprintVariants,
    dfpDisplayEnabled,
  } = useAuth()
  const isGuest = !user && isGuestPreview
  const uiScope = getResourceTrackerUiScope(user?.id, isGuestPreview)

  const { overridesMap, setOrderable } = useBlueprintOrderOverrides()
  const { isOnTargetList, toggleTarget } = useTargetList(overridesMap)
  const {
    addMaterialsFromBlueprint,
    isPendingForBlueprint,
    hasRsTrackableMaterials,
    lastMessage: craftTrackerMessage,
    clearLastMessage: clearCraftTrackerMessage,
  } = useBlueprintCraftTracker()

  const [closeNoCigar, setCloseNoCigar] = React.useState(
    () => readResourceTrackerUiState(uiScope).closeNoCigar
  )
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedMaterial, setSelectedMaterial] = React.useState<string | null>(null)
  const [selectedMainCategory, setSelectedMainCategory] = React.useState<string | null>(null)
  const [selectedSubCategory, setSelectedSubCategory] = React.useState<string | null>(null)
  const [selectedSize, setSelectedSize] = React.useState<string | null>(null)
  const [selectedArmorWeight, setSelectedArmorWeight] = React.useState<string | null>(null)
  const [selectedArmorSlot, setSelectedArmorSlot] = React.useState<string | null>(null)
  const [selectedBlueprint, setSelectedBlueprint] = React.useState<any>(null)
  const [modalOriginRect, setModalOriginRect] = React.useState<DOMRect | null>(null)
  const [blueprintOwnerCounts, setBlueprintOwnerCounts] = React.useState<Record<string, number>>({})
  const [expandedGroupKey, setExpandedGroupKey] = React.useState<string | null>(null)
  const [rewardMissionsModal, setRewardMissionsModal] = React.useState<{
    id: string
    name: string
  } | null>(null)

  const { data: blueprints, isLoading } = useBlueprintData()
  const displayAcquiredBlueprints = myAcquiredBlueprints

  const ownedStockIndex = React.useMemo(
    () => buildOwnedStockIndex(stockCardsForCraft),
    [stockCardsForCraft]
  )

  React.useEffect(() => {
    if (!uiScope) return
    setCloseNoCigar(readResourceTrackerUiState(uiScope).closeNoCigar)
  }, [uiScope])

  const handleCloseNoCigarChange = React.useCallback(
    (checked: boolean) => {
      setCloseNoCigar(checked)
      writeResourceTrackerUiState(uiScope, { closeNoCigar: checked })
    },
    [uiScope]
  )

  const allBlueprintMaterials = React.useMemo(
    () => extractBlueprintResources(blueprints ?? []),
    [blueprints]
  )

  useAsyncEffect(async ({ cancelled }) => {
    if (!blueprints || blueprints.length === 0 || isGuest) {
      setBlueprintOwnerCounts({})
      return
    }

    const blueprintIds = blueprints.map((bp) => bp.internalName).filter(Boolean)
    const { data, error } = await fetchBlueprintOwnerCounts(blueprintIds)
    if (error) {
      console.error('Failed to fetch blueprint owner counts:', error)
    }
    if (!cancelled) {
      setBlueprintOwnerCounts(data)
    }
  }, [blueprints, isGuest])

  const craftableBlueprints = React.useMemo(() => {
    if (!blueprints) return []

    return blueprints.filter((bp) => {
      if (!bp.blueprintName || !bp.internalName) return false
      if (!isBlueprintListable(bp)) return false

      const acquired =
        !!displayAcquiredBlueprints[bp.internalName] || isDefaultBlueprint(bp.internalName)
      if (!acquired) return false

      return matchesCanCraftTabBlueprint(bp, quantityByKey, closeNoCigar, 1)
    })
  }, [blueprints, displayAcquiredBlueprints, quantityByKey, closeNoCigar])

  const readyToCraftCount = React.useMemo(() => {
    if (!blueprints) return 0
    return blueprints.filter((bp) => {
      if (!bp.blueprintName || !bp.internalName) return false
      if (!isBlueprintListable(bp)) return false
      const acquired =
        !!displayAcquiredBlueprints[bp.internalName] || isDefaultBlueprint(bp.internalName)
      if (!acquired) return false
      return canCraftBlueprint(bp, quantityByKey, 1)
    }).length
  }, [blueprints, displayAcquiredBlueprints, quantityByKey])

  const closeNoCigarCount = React.useMemo(() => {
    if (!blueprints || !closeNoCigar) return 0
    return blueprints.filter((bp) => {
      if (!bp.blueprintName || !bp.internalName) return false
      if (!isBlueprintListable(bp)) return false
      const acquired =
        !!displayAcquiredBlueprints[bp.internalName] || isDefaultBlueprint(bp.internalName)
      if (!acquired) return false
      return isNearlyCraftableBlueprint(bp, quantityByKey, 1)
    }).length
  }, [blueprints, displayAcquiredBlueprints, quantityByKey, closeNoCigar])

  const baseFilteredBlueprints = React.useMemo(() => {
    return craftableBlueprints.filter((bp) => {
      const matchesSearch =
        searchTerm === '' ||
        bp.blueprintName.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesSearch
    })
  }, [craftableBlueprints, searchTerm])

  const materialFilteredBlueprints = React.useMemo(() => {
    if (!selectedMaterial) return baseFilteredBlueprints
    return baseFilteredBlueprints.filter((bp) => blueprintUsesMaterial(bp, selectedMaterial))
  }, [baseFilteredBlueprints, selectedMaterial])

  const categoryData = React.useMemo(() => {
    if (!materialFilteredBlueprints.length) {
      return { subTypes: {}, sizes: {}, armorWeights: {}, armorSlots: {}, mainCounts: {} }
    }

    const subTypes: Record<string, Record<string, number>> = {}
    const sizes: Record<string, Record<string, number>> = {}
    const armorWeights: Record<string, number> = {}
    const armorSlots: Record<string, number> = {}
    const mainCounts: Record<string, number> = {}

    materialFilteredBlueprints.forEach((bp) => {
      if (isDefaultBlueprint(bp.internalName)) {
        mainCounts[DEFAULT_BLUEPRINTS_CATEGORY] =
          (mainCounts[DEFAULT_BLUEPRINTS_CATEGORY] || 0) + 1
      }

      if (!bp.categoryName) return

      const mainCat = Object.keys(MAIN_CATEGORY_GROUPS).find(
        (key) =>
          !isDefaultBlueprintsCategory(key) &&
          MAIN_CATEGORY_GROUPS[key].includes(bp.categoryName)
      )
      if (!mainCat) return

      mainCounts[mainCat] = (mainCounts[mainCat] || 0) + 1

      if (!subTypes[mainCat]) subTypes[mainCat] = {}
      const sub = getSubType(bp)
      if (sub) {
        subTypes[mainCat][sub] = (subTypes[mainCat][sub] || 0) + 1
      }

      if (mainCat === 'Vehicle Components' || mainCat === 'Vehicle Weapons') {
        if (!sizes[mainCat]) sizes[mainCat] = {}
        const sizeMatch = bp.categoryName.match(/S(\d)/)
        if (sizeMatch) {
          const size = `S${sizeMatch[1]}`
          sizes[mainCat][size] = (sizes[mainCat][size] || 0) + 1
        }
      }

      if (mainCat === 'FPS Armour') {
        const weight = getArmorWeight(bp)
        if (weight) {
          armorWeights[weight] = (armorWeights[weight] || 0) + 1
        }
        const slot = getArmorSlot(bp)
        if (slot) {
          armorSlots[slot] = (armorSlots[slot] || 0) + 1
        }
      }
    })

    return { subTypes, sizes, armorWeights, armorSlots, mainCounts }
  }, [materialFilteredBlueprints])

  const filteredArmorCounts = React.useMemo(() => {
    if (selectedMainCategory !== 'FPS Armour') return { weights: {}, slots: {}, types: {} }

    const weights: Record<string, number> = {}
    const slots: Record<string, number> = {}
    const types: Record<string, number> = {}

    materialFilteredBlueprints.forEach((bp) => {
      if (!bp.categoryName) return

      const validCategories = MAIN_CATEGORY_GROUPS['FPS Armour'] || []
      if (!validCategories.includes(bp.categoryName)) return

      const weight = getArmorWeight(bp)
      const slot = getArmorSlot(bp)
      const type = getSubType(bp)

      const matchesSlotForWeight = !selectedArmorSlot || slot === selectedArmorSlot
      const matchesTypeForWeight = !selectedSubCategory || type === selectedSubCategory
      if (matchesSlotForWeight && matchesTypeForWeight && weight) {
        weights[weight] = (weights[weight] || 0) + 1
      }

      const matchesWeightForSlot = !selectedArmorWeight || weight === selectedArmorWeight
      const matchesTypeForSlot = !selectedSubCategory || type === selectedSubCategory
      if (matchesWeightForSlot && matchesTypeForSlot && slot) {
        slots[slot] = (slots[slot] || 0) + 1
      }

      const matchesWeightForType = !selectedArmorWeight || weight === selectedArmorWeight
      const matchesSlotForType = !selectedArmorSlot || slot === selectedArmorSlot
      if (matchesWeightForType && matchesSlotForType && type) {
        types[type] = (types[type] || 0) + 1
      }
    })

    return { weights, slots, types }
  }, [
    materialFilteredBlueprints,
    selectedMainCategory,
    selectedArmorWeight,
    selectedArmorSlot,
    selectedSubCategory,
  ])

  const filteredSubTypeCounts = React.useMemo(() => {
    if (!selectedMainCategory) return {}

    if (selectedMainCategory === 'FPS Armour') {
      return filteredArmorCounts.types
    }

    const counts: Record<string, number> = {}
    materialFilteredBlueprints.forEach((bp) => {
      if (!bp.categoryName) return

      const validCategories = MAIN_CATEGORY_GROUPS[selectedMainCategory] || []
      if (!validCategories.includes(bp.categoryName)) return

      if (selectedSize && !bp.categoryName.includes(selectedSize)) return

      const sub = getSubType(bp)
      if (sub) {
        counts[sub] = (counts[sub] || 0) + 1
      }
    })

    return counts
  }, [materialFilteredBlueprints, selectedMainCategory, selectedSize, filteredArmorCounts])

  const filteredBlueprints = React.useMemo(() => {
    let results = materialFilteredBlueprints

    if (selectedMainCategory) {
      results = results.filter((bp) => {
        if (isDefaultBlueprintsCategory(selectedMainCategory)) {
          return isDefaultBlueprint(bp.internalName)
        }

        const validCategories = MAIN_CATEGORY_GROUPS[selectedMainCategory] || []
        if (!validCategories.includes(bp.categoryName)) return false

        if (selectedSize && !bp.categoryName.includes(selectedSize)) return false

        if (selectedArmorWeight && selectedMainCategory === 'FPS Armour') {
          const weight = getArmorWeight(bp)
          if (weight !== selectedArmorWeight) return false
        }

        if (selectedArmorSlot && selectedMainCategory === 'FPS Armour') {
          const slot = getArmorSlot(bp)
          if (slot !== selectedArmorSlot) return false
        }

        if (selectedSubCategory) {
          const bpSubType = getSubType(bp)
          if (bpSubType !== selectedSubCategory) return false
        }

        return true
      })
    }

    return results.sort((a, b) => (a.blueprintName || '').localeCompare(b.blueprintName || ''))
  }, [
    materialFilteredBlueprints,
    selectedMainCategory,
    selectedSubCategory,
    selectedSize,
    selectedArmorWeight,
    selectedArmorSlot,
  ])

  const blueprintGridItems = React.useMemo(
    () => buildBlueprintGridItems(filteredBlueprints, groupBlueprintVariants),
    [filteredBlueprints, groupBlueprintVariants]
  )

  const gridFilterSignature = React.useMemo(
    () =>
      [
        searchTerm,
        selectedMaterial,
        selectedMainCategory,
        selectedSubCategory,
        selectedSize,
        selectedArmorWeight,
        selectedArmorSlot,
        groupBlueprintVariants,
      ].join('\0'),
    [
      searchTerm,
      selectedMaterial,
      selectedMainCategory,
      selectedSubCategory,
      selectedSize,
      selectedArmorWeight,
      selectedArmorSlot,
      groupBlueprintVariants,
    ]
  )

  React.useEffect(() => {
    setExpandedGroupKey(null)
  }, [gridFilterSignature])

  const rewardMissionsModalList = React.useMemo(() => {
    if (!rewardMissionsModal) return []
    return getRewardMissionsForBlueprint(rewardMissionsModal.id)
  }, [rewardMissionsModal])

  const handleSelectRewardMission = React.useCallback(
    (reward: Parameters<typeof stashBrowseMissionFromReward>[0]) => {
      if (!stashBrowseMissionFromReward(reward)) return
      setRewardMissionsModal(null)
      setSelectedBlueprint(null)
      setModalOriginRect(null)
      void navigate({ to: '/targets' })
    },
    [navigate]
  )

  const renderBlueprintCard = React.useCallback(
    (bp: any) => {
      const effectiveIsOrderable = resolveIsOrderable(bp, overridesMap)
      const catalogReward = bp.isReward === true
      const isStarter = isDefaultBlueprint(bp.internalName)
      const canTarget =
        !isStarter &&
        (isApproved || isGuest) &&
        !displayAcquiredBlueprints[bp.internalName] &&
        canAddBlueprintToTargetList(bp, overridesMap)
      const canShowMissions =
        (isApproved || isGuest) &&
        getRewardMissionsForBlueprint(bp.internalName).length > 0

      return (
        <BlueprintCard
          blueprint={bp}
          onClick={(_clickedBp, e) => {
            setModalOriginRect(e.currentTarget.getBoundingClientRect())
            setSelectedBlueprint(bp)
          }}
          isAcquired={!!displayAcquiredBlueprints[bp.internalName] || isStarter}
          onToggleAcquired={() => toggleAcquired(bp.internalName)}
          canModify={canModifyBlueprints}
          isPending={isPending}
          showTargetControl={canTarget}
          showMissionsControl={canShowMissions}
          isOnTargetList={isOnTargetList(bp.internalName)}
          onToggleTarget={() => toggleTarget(bp.internalName)}
          onOpenMissions={() =>
            setRewardMissionsModal({
              id: bp.internalName,
              name: bp.blueprintName ?? bp.internalName,
            })
          }
          effectiveIsOrderable={effectiveIsOrderable}
          catalogIsReward={catalogReward}
          isSuperAdmin={isSuperAdmin}
          onToggleOrderable={(next) => void setOrderable(bp.internalName, next, catalogReward)}
          ownerCount={blueprintOwnerCounts[bp.internalName]}
          dfpDisplayEnabled={dfpDisplayEnabled}
          showCraftTrackerControl={hasRsTrackableMaterials(bp)}
          onAddToCraftTracker={() => void addMaterialsFromBlueprint(bp)}
          craftTrackerPending={isPendingForBlueprint(bp.internalName)}
        />
      )
    },
    [
      overridesMap,
      isApproved,
      isGuest,
      displayAcquiredBlueprints,
      toggleAcquired,
      canModifyBlueprints,
      isPending,
      isOnTargetList,
      toggleTarget,
      isSuperAdmin,
      setOrderable,
      blueprintOwnerCounts,
      dfpDisplayEnabled,
      addMaterialsFromBlueprint,
      isPendingForBlueprint,
      hasRsTrackableMaterials,
    ]
  )

  const renderGridItem = React.useCallback(
    (item: BlueprintGridItem) => {
      if (item.kind === 'single') {
        return renderBlueprintCard(item.blueprint)
      }

      const acquiredCount = item.members.filter(
        (bp) => displayAcquiredBlueprints[bp.internalName]
      ).length

      return (
        <BlueprintVariantGroupCard
          familyLabel={item.familyLabel}
          categoryName={item.categoryName}
          members={item.members}
          expanded={expandedGroupKey === item.familyKey}
          onToggle={() =>
            setExpandedGroupKey((current) =>
              current === item.familyKey ? null : item.familyKey
            )
          }
          acquiredCount={acquiredCount}
          renderBlueprintCard={renderBlueprintCard}
        />
      )
    },
    [renderBlueprintCard, displayAcquiredBlueprints, expandedGroupKey]
  )

  const handleMainCategoryClick = (cat: string) => {
    if (selectedMainCategory === cat) {
      setSelectedMainCategory(null)
      setSelectedSubCategory(null)
      setSelectedSize(null)
      setSelectedArmorWeight(null)
      setSelectedArmorSlot(null)
    } else {
      setSelectedMainCategory(cat)
      setSelectedSubCategory(null)
      setSelectedSize(null)
      setSelectedArmorWeight(null)
      setSelectedArmorSlot(null)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 mt-4">Loading craftable blueprints...</p>
      </div>
    )
  }

  if (!blueprints) {
    return (
      <div className="text-center py-16 text-red-400">
        Failed to load blueprint data.
      </div>
    )
  }

  if (!hasTrackedStock) {
    return (
      <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
        <p className="text-slate-400">
          No tracked materials yet. Add stock under{' '}
          <span className="text-slate-200 font-medium">My Resources</span>, then come back here
          to see what you can craft.
        </p>
      </div>
    )
  }

  const sizeOptions = selectedMainCategory ? VEHICLE_SIZE_OPTIONS[selectedMainCategory] || [] : []
  const currentSizes = sizeOptions.reduce<Record<string, number>>((acc, size) => {
    acc[size] = categoryData.sizes[selectedMainCategory!]?.[size] ?? 0
    return acc
  }, {})
  const currentArmorWeights = ARMOR_WEIGHT_OPTIONS.reduce<Record<string, number>>((acc, weight) => {
    acc[weight] = filteredArmorCounts.weights[weight] || 0
    return acc
  }, {})
  const currentArmorSlots = ARMOR_SLOT_OPTIONS.reduce<Record<string, number>>((acc, slot) => {
    acc[slot] = filteredArmorCounts.slots[slot] || 0
    return acc
  }, {})
  const discoveredSubTypes = selectedMainCategory
    ? categoryData.subTypes[selectedMainCategory] || {}
    : {}
  const staticSubTypes = selectedMainCategory ? STATIC_SUBTYPE_OPTIONS[selectedMainCategory] || [] : []
  const subTypeOptions = selectedMainCategory
    ? [...new Set([...staticSubTypes, ...Object.keys(discoveredSubTypes)])].sort((a, b) => {
        const ia = staticSubTypes.indexOf(a)
        const ib = staticSubTypes.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
      })
    : []
  const currentSubTypes = subTypeOptions.reduce<Record<string, number>>((acc, key) => {
    acc[key] = filteredSubTypeCounts[key] || 0
    return acc
  }, {})
  const showVehicleSizes = sizeOptions.length > 0
  const showArmorWeights = selectedMainCategory === 'FPS Armour'
  const showArmorSlots = selectedMainCategory === 'FPS Armour'
  const showSubTypes = subTypeOptions.length > 0
  const hasSubFilters = showVehicleSizes || showArmorWeights || showArmorSlots || showSubTypes

  return (
    <>
      <p className="mb-4 text-sm text-slate-400 leading-relaxed">
        Acquired blueprints you can craft right now from your tracked{' '}
        <span className="text-slate-300">My Resources</span> stock (any quality tier counts
        toward the total).
      </p>

      <label className="mb-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-slate-700/80 bg-slate-900/50 text-sm text-slate-300 cursor-pointer w-fit max-w-full">
        <input
          type="checkbox"
          checked={closeNoCigar}
          onChange={(e) => handleCloseNoCigarChange(e.target.checked)}
          className="mt-0.5 rounded border-slate-500"
        />
        <span>
          <span className="font-medium text-slate-200">Close, no Cigar</span>
          <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">
            Also show acquired blueprints where every required material is at least 70% on hand in
            your My Resources. For recipes with two or more materials, also include those where
            every material is fully stocked except one (that one may be missing entirely).
          </span>
        </span>
      </label>

      {craftTrackerMessage && (
        <div className="mb-4 p-3 rounded-lg bg-purple-900/25 border border-purple-500/35 text-purple-100 text-sm flex items-start justify-between gap-3">
          <span>{craftTrackerMessage}</span>
          <button
            type="button"
            onClick={clearCraftTrackerMessage}
            className="text-purple-300/80 hover:text-purple-100 text-xs shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-3 mb-6 w-full min-w-0">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <input
            type="text"
            placeholder="Search craftable blueprints..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input flex-1 min-w-0 basis-full sm:basis-0 sm:min-w-[8rem] px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 lg:gap-2 items-center">
          <BlueprintMaterialFilter
            materials={allBlueprintMaterials}
            selectedMaterial={selectedMaterial}
            onSelect={setSelectedMaterial}
            onClear={() => setSelectedMaterial(null)}
          />
          {Object.keys(MAIN_CATEGORY_GROUPS).map((cat) => {
            const count = categoryData.mainCounts[cat] || 0
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleMainCategoryClick(cat)}
                disabled={count === 0}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all site-btn-shimmer ${
                  selectedMainCategory === cat
                    ? 'site-btn-accent shadow-lg'
                    : count === 0
                      ? 'bg-slate-800/50 text-slate-600 border border-slate-700 cursor-not-allowed'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                <span className="hidden md:inline">{cat}</span>
                <span className="md:hidden">
                  {cat
                    .replace('Vehicle ', 'V.')
                    .replace('Components', 'Comp')
                    .replace('Weapons', 'Wpn')
                    .replace('Mission Items', 'Mission')
                    .replace('FPS ', '')}
                </span>
                <span className="text-[10px] lg:text-xs ml-1 opacity-70">({count})</span>
              </button>
            )
          })}
        </div>

        {hasSubFilters && (
          <div className="flex flex-wrap gap-1.5 lg:gap-2 pt-2 border-t border-slate-700/50">
            {showVehicleSizes &&
              sizeOptions.map((size) => {
                const count = currentSizes[size] || 0
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(selectedSize === size ? null : size)}
                    disabled={count === 0}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                      selectedSize === size
                        ? 'site-filter-selected-blue'
                        : count === 0
                          ? 'bg-blue-950/30 text-blue-800 border border-blue-900/50 cursor-not-allowed'
                          : 'bg-blue-950/50 text-blue-400 hover:bg-blue-900/50 border border-blue-800/50'
                    }`}
                  >
                    {size}
                    <span className="opacity-70 ml-0.5">({count})</span>
                  </button>
                )
              })}

            {showArmorWeights &&
              ARMOR_WEIGHT_OPTIONS.map((weight) => {
                const count = currentArmorWeights[weight] || 0
                return (
                  <button
                    key={weight}
                    type="button"
                    onClick={() => {
                      setSelectedArmorWeight(selectedArmorWeight === weight ? null : weight)
                      setSelectedSubCategory(null)
                    }}
                    disabled={count === 0}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                      selectedArmorWeight === weight
                        ? 'site-filter-selected-purple'
                        : count === 0
                          ? 'bg-purple-950/30 text-purple-800 border border-purple-900/50 cursor-not-allowed'
                          : 'bg-purple-950/50 text-purple-400 hover:bg-purple-900/50 border border-purple-800/50'
                    }`}
                  >
                    {weight.charAt(0).toUpperCase() + weight.slice(1)}
                    <span className="opacity-70 ml-0.5">({count})</span>
                  </button>
                )
              })}

            {showArmorSlots &&
              ARMOR_SLOT_OPTIONS.map((slot) => {
                const count = currentArmorSlots[slot] || 0
                const displayName =
                  ARMOR_SLOT_LABELS[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1)
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setSelectedArmorSlot(selectedArmorSlot === slot ? null : slot)
                      setSelectedSubCategory(null)
                    }}
                    disabled={count === 0}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                      selectedArmorSlot === slot
                        ? 'site-filter-selected-green'
                        : count === 0
                          ? 'bg-green-950/30 text-green-800 border border-green-900/50 cursor-not-allowed'
                          : 'bg-green-950/50 text-green-400 hover:bg-green-900/50 border border-green-800/50'
                    }`}
                  >
                    {displayName}
                    <span className="opacity-70 ml-0.5">({count})</span>
                  </button>
                )
              })}

            {showSubTypes &&
              subTypeOptions.map((sub) => {
                const count = currentSubTypes[sub] || 0
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() =>
                      setSelectedSubCategory(selectedSubCategory === sub ? null : sub)
                    }
                    disabled={count === 0}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                      selectedSubCategory === sub
                        ? 'site-filter-selected-orange'
                        : count === 0
                          ? 'bg-orange-950/30 text-orange-800 border border-orange-900/50 cursor-not-allowed'
                          : 'bg-orange-950/50 text-orange-400 hover:bg-orange-900/50 border border-orange-800/50'
                    }`}
                  >
                    {formatSubType(sub)}
                    <span className="opacity-70 ml-0.5">({count})</span>
                  </button>
                )
              })}
          </div>
        )}

        <div className="text-slate-500 text-sm">
          Showing {filteredBlueprints.length} blueprint
          {filteredBlueprints.length !== 1 ? 's' : ''}
          {closeNoCigar ? (
            <span>
              {' '}
              ({readyToCraftCount} ready
              {closeNoCigarCount > 0 ? ` · ${closeNoCigarCount} close, no cigar` : ''})
            </span>
          ) : (
            readyToCraftCount !== filteredBlueprints.length && (
              <span> (of {readyToCraftCount} ready to craft)</span>
            )
          )}
        </div>
      </div>

      <section className="w-full min-w-0">
        {filteredBlueprints.length === 0 ? (
          <div className="text-center py-24 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-700">
            <p className="text-slate-400 text-xl font-medium mb-2">Nothing craftable yet</p>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              {craftableBlueprints.length === 0
                ? closeNoCigar
                  ? 'Mark blueprints as acquired and stock materials in My Resources — or enable Close, no Cigar to widen the net.'
                  : 'Mark blueprints as acquired and stock enough materials in My Resources.'
                : 'No matches for the current filters.'}
            </p>
            {(selectedMaterial ||
              selectedMainCategory ||
              selectedSubCategory ||
              selectedSize ||
              selectedArmorWeight ||
              selectedArmorSlot ||
              searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMaterial(null)
                  setSelectedMainCategory(null)
                  setSelectedSubCategory(null)
                  setSelectedSize(null)
                  setSelectedArmorWeight(null)
                  setSelectedArmorSlot(null)
                  setSearchTerm('')
                }}
                className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-500/25"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <VirtualizedBlueprintGrid
            items={blueprintGridItems}
            expandedGroupKey={expandedGroupKey}
            renderGridItem={renderGridItem}
          />
        )}
      </section>

      {selectedBlueprint && (
        <BlueprintDetailsModal
          blueprint={selectedBlueprint}
          originRect={modalOriginRect}
          onClose={() => {
            setSelectedBlueprint(null)
            setModalOriginRect(null)
          }}
          isApproved={isApproved}
          isGuest={isGuest}
          isAcquired={
            !!displayAcquiredBlueprints[selectedBlueprint.internalName] ||
            isDefaultBlueprint(selectedBlueprint.internalName)
          }
          isOnTarget={isOnTargetList(selectedBlueprint.internalName)}
          effectiveIsOrderable={resolveIsOrderable(selectedBlueprint, overridesMap)}
          canAddToTargetList={canAddBlueprintToTargetList(selectedBlueprint, overridesMap)}
          onToggleTarget={() => toggleTarget(selectedBlueprint.internalName)}
          ownerCount={blueprintOwnerCounts[selectedBlueprint.internalName]}
          onAddToCraftTracker={() => void addMaterialsFromBlueprint(selectedBlueprint)}
          craftTrackerPending={isPendingForBlueprint(selectedBlueprint.internalName)}
          showCraftTrackerControl={hasRsTrackableMaterials(selectedBlueprint)}
          craftContext={{
            owned: ownedStockIndex,
            ready: canCraftBlueprint(selectedBlueprint, quantityByKey, 1),
            onCraft,
          }}
        />
      )}

      {rewardMissionsModal && (
        <BlueprintRewardMissionsModal
          blueprintName={rewardMissionsModal.name}
          missions={rewardMissionsModalList}
          onClose={() => setRewardMissionsModal(null)}
          onSelectMission={handleSelectRewardMission}
        />
      )}
    </>
  )
}
