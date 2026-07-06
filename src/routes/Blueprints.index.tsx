import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { blueprintDataVersion, useBlueprintData } from './blueprints'
import BlueprintCard from '../components/BlueprintCard'
import BlueprintDetailsModal from '../components/BlueprintDetailsModal'
import BlueprintRewardMissionsModal from '../components/BlueprintRewardMissionsModal'
import BlueprintVariantGroupCard from '../components/BlueprintVariantGroupCard'
import VirtualizedBlueprintGrid from '../components/VirtualizedBlueprintGrid'
import BlueprintMaterialFilter from '../components/BlueprintMaterialFilter'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import BpDumperCallout from '../components/bpDumper/BpDumperCallout'
import { useAuth } from '../contexts/AuthContext'
import { useBpDumperModal } from '../contexts/BpDumperModalContext'
import { useBlueprintOrderOverrides } from '../hooks/useBlueprintOrderOverrides'
import { useTargetList } from '../hooks/useTargetList'
import { useAsyncEffect } from '../hooks/useAsyncEffect'
import { fetchBlueprintOwnerCounts } from '../lib/operations'
import {
  canAddBlueprintToOrder,
  canAddBlueprintToTargetList,
  resolveIsOrderable,
} from '../lib/blueprintOrderable'
import { getRewardMissionsForBlueprint } from '../lib/blueprintMissionRewards'
import {
  getBlueprintsUiScope,
  readBlueprintsUiState,
  writeBlueprintsUiState,
} from '../lib/blueprintsUiState'
import { stashBrowseMissionFromReward } from '../lib/missionTrackerUiState'
import {
  formatSubtypeLabel,
  getArmorSlot as getArmorSlotFromPath,
  getArmorWeight as getArmorWeightFromTaxonomy,
  getBlueprintSubType,
} from '../lib/blueprintTaxonomy'
import { preloadOrgLogoCandidates } from '../lib/orgLogo'
import {
  blueprintUsesMaterial,
  extractBlueprintResources,
} from '../lib/blueprintResources'
import { buildBlueprintGridItems, type BlueprintGridItem } from '../lib/blueprintVariantGroups'
import {
  DEFAULT_BLUEPRINTS_CATEGORY,
  isBlueprintListable,
  isDefaultBlueprint,
  isDefaultBlueprintsCategory,
} from '../lib/defaultBlueprints'

const FPS_WEAPON_TYPE_OPTIONS = ['crossbow', 'lmg', 'pistol', 'rifle', 'shotgun', 'smg', 'sniper']

const getSubType = (bp) => getBlueprintSubType(bp)

const getArmorWeight = (bp) => getArmorWeightFromTaxonomy(bp)

const getArmorSlot = (bp) => getArmorSlotFromPath(bp)

const MAIN_CATEGORY_GROUPS = {
  [DEFAULT_BLUEPRINTS_CATEGORY]: [],
  'FPS Weapons': ['FPSWeapons'],
  'FPS Armour': ['FPSArmours'],
  'Ammo': ['Ammo'],
  'Vehicle Components': ['Veh. Comp. S0', 'Veh. Comp. S1', 'Veh. Comp. S2', 'Veh. Comp. S3', 'Veh. Comp. S4'],
  'Vehicle Weapons': ['Veh. Weapons S1', 'Veh. Weapons S2', 'Veh. Weapons S3', 'Veh. Weapons S4', 'Veh. Weapons S5', 'Veh. Weapons S6'],
  'Mission Items': ['MissionItem'],
}

const ARMOR_WEIGHT_OPTIONS = ['flight', 'light', 'medium', 'heavy', 'superheavy']
const ARMOR_SLOT_OPTIONS = ['helmet', 'arms', 'core', 'legs', 'backpack', 'flight', 'suit']

const ARMOR_SLOT_LABELS: Record<string, string> = {
  flight: 'Flight',
  suit: 'Suits',
}
const VEHICLE_SIZE_OPTIONS = {
  'Vehicle Components': ['S0', 'S1', 'S2', 'S3', 'S4'],
  'Vehicle Weapons': ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
}
const STATIC_SUBTYPE_OPTIONS = {
  'FPS Weapons': FPS_WEAPON_TYPE_OPTIONS,
  'Ammo': FPS_WEAPON_TYPE_OPTIONS,
  'FPS Armour': ['standard', 'flightsuit', 'undersuit', 'explorer', 'salvager', 'stealth'],
}

const formatSubType = formatSubtypeLabel

export default function BlueprintsRoute() {
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
    orgLogoUpdatedAt,
    groupBlueprintVariants,
    dfpDisplayEnabled,
  } = useAuth()
  const { openBpDumperModal } = useBpDumperModal()
  const isGuest = !user && isGuestPreview
  const uiScope = getBlueprintsUiScope(user?.id, isGuestPreview)
  const hydratedUiScopeRef = React.useRef<string | null | undefined>(undefined)
  const skipPersistRef = React.useRef(true)

  const { overridesMap, setOrderable } = useBlueprintOrderOverrides()
  const { isOnTargetList, toggleTarget } = useTargetList(overridesMap)

  const [searchTerm, setSearchTerm] = React.useState(
    () => readBlueprintsUiState(uiScope).searchTerm
  )
  const [selectedMaterial, setSelectedMaterial] = React.useState<string | null>(
    () => readBlueprintsUiState(uiScope).selectedMaterial
  )
  const [selectedMainCategory, setSelectedMainCategory] = React.useState(
    () => readBlueprintsUiState(uiScope).selectedMainCategory
  )
  const [selectedSubCategory, setSelectedSubCategory] = React.useState(
    () => readBlueprintsUiState(uiScope).selectedSubCategory
  )
  const [selectedSize, setSelectedSize] = React.useState(
    () => readBlueprintsUiState(uiScope).selectedSize
  )
  const [selectedArmorWeight, setSelectedArmorWeight] = React.useState(
    () => readBlueprintsUiState(uiScope).selectedArmorWeight
  )
  const [selectedArmorSlot, setSelectedArmorSlot] = React.useState(
    () => readBlueprintsUiState(uiScope).selectedArmorSlot
  )
  const [showOnlyRewards, setShowOnlyRewards] = React.useState(
    () => readBlueprintsUiState(uiScope).showOnlyRewards
  )
  const [acquisitionFilter, setAcquisitionFilter] = React.useState<
    'all' | 'acquired' | 'not_acquired'
  >(() => readBlueprintsUiState(uiScope).acquisitionFilter)
  const [selectedBlueprint, setSelectedBlueprint] = React.useState(null)
  const [modalOriginRect, setModalOriginRect] = React.useState(null)

  React.useEffect(() => {
    preloadOrgLogoCandidates(orgLogoUpdatedAt)
  }, [orgLogoUpdatedAt])

  React.useEffect(() => {
    if (hydratedUiScopeRef.current === uiScope) return
    hydratedUiScopeRef.current = uiScope
    skipPersistRef.current = true
    if (!uiScope) return

    const saved = readBlueprintsUiState(uiScope)
    setSearchTerm(saved.searchTerm)
    setSelectedMaterial(saved.selectedMaterial)
    setSelectedMainCategory(saved.selectedMainCategory)
    setSelectedSubCategory(saved.selectedSubCategory)
    setSelectedSize(saved.selectedSize)
    setSelectedArmorWeight(saved.selectedArmorWeight)
    setSelectedArmorSlot(saved.selectedArmorSlot)
    setShowOnlyRewards(saved.showOnlyRewards)
    setAcquisitionFilter(saved.acquisitionFilter)
  }, [uiScope])

  React.useEffect(() => {
    if (!uiScope) return
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }

    writeBlueprintsUiState(uiScope, {
      searchTerm,
      selectedMaterial,
      selectedMainCategory,
      selectedSubCategory,
      selectedSize,
      selectedArmorWeight,
      selectedArmorSlot,
      showOnlyRewards,
      acquisitionFilter,
    })
  }, [
    uiScope,
    searchTerm,
    selectedMaterial,
    selectedMainCategory,
    selectedSubCategory,
    selectedSize,
    selectedArmorWeight,
    selectedArmorSlot,
    showOnlyRewards,
    acquisitionFilter,
  ])

  const [blueprintOwnerCounts, setBlueprintOwnerCounts] = React.useState<Record<string, number>>({})
  const [expandedGroupKey, setExpandedGroupKey] = React.useState<string | null>(null)
  const [rewardMissionsModal, setRewardMissionsModal] = React.useState<{
    id: string
    name: string
  } | null>(null)

  const { data: blueprints, isLoading } = useBlueprintData()

  const allBlueprintMaterials = React.useMemo(
    () => extractBlueprintResources(blueprints ?? []),
    [blueprints]
  )

  // Fetch blueprint owner counts when blueprints load (only for logged-in users)
  useAsyncEffect(async ({ cancelled }) => {
    if (!blueprints || blueprints.length === 0 || isGuest) {
      setBlueprintOwnerCounts({})
      return
    }

    const blueprintIds = blueprints.map(bp => bp.internalName).filter(Boolean)
    const { data, error } = await fetchBlueprintOwnerCounts(blueprintIds)
    if (error) {
      console.error('Failed to fetch blueprint owner counts:', error)
    }
    if (!cancelled) {
      setBlueprintOwnerCounts(data)
    }
  }, [blueprints, isGuest])

  const displayAcquiredBlueprints = myAcquiredBlueprints

  // Base filtered blueprints (applies global filters: search, rewards, and acquisition filter)
  const baseFilteredBlueprints = React.useMemo(() => {
    if (!blueprints) return []
    
    return blueprints.filter(bp => {
      if (!bp.blueprintName || !bp.internalName) return false
      if (!isBlueprintListable(bp)) return false

      const isDefault = isDefaultBlueprint(bp.internalName)

      const matchesSearch = searchTerm === '' || bp.blueprintName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesReward =
        isDefault || !showOnlyRewards || resolveIsOrderable(bp, overridesMap)

      const isAcquiredInActiveSet = !!myAcquiredBlueprints[bp.internalName]
      
      let matchesAcquisition = true
      if (acquisitionFilter === 'acquired') {
        matchesAcquisition = isAcquiredInActiveSet
      } else if (acquisitionFilter === 'not_acquired') {
        matchesAcquisition = !isAcquiredInActiveSet
      }
      
      return matchesSearch && matchesReward && matchesAcquisition
    })
  }, [blueprints, searchTerm, showOnlyRewards, myAcquiredBlueprints, overridesMap, acquisitionFilter])

  const materialFilteredBlueprints = React.useMemo(() => {
    if (!selectedMaterial) return baseFilteredBlueprints
    return baseFilteredBlueprints.filter((bp) => blueprintUsesMaterial(bp, selectedMaterial))
  }, [baseFilteredBlueprints, selectedMaterial])

  // Category data with counts based on material filter (then category/sub-filters)
  const categoryData = React.useMemo(() => {
    if (!materialFilteredBlueprints.length) return { subTypes: {}, sizes: {}, armorWeights: {}, armorSlots: {}, mainCounts: {} }
    
    const subTypes = {}
    const sizes = {}
    const armorWeights = {}
    const armorSlots = {}
    const mainCounts = {}
    
    materialFilteredBlueprints.forEach(bp => {
      if (isDefaultBlueprint(bp.internalName)) {
        mainCounts[DEFAULT_BLUEPRINTS_CATEGORY] =
          (mainCounts[DEFAULT_BLUEPRINTS_CATEGORY] || 0) + 1
      }

      if (!bp.categoryName) return
      
      const mainCat = Object.keys(MAIN_CATEGORY_GROUPS).find(key => 
        !isDefaultBlueprintsCategory(key) &&
        MAIN_CATEGORY_GROUPS[key].includes(bp.categoryName)
      )
      if (!mainCat) return
      
      // Count for main category
      mainCounts[mainCat] = (mainCounts[mainCat] || 0) + 1
      
      // Count for subtypes
      if (!subTypes[mainCat]) subTypes[mainCat] = {}
      const sub = getSubType(bp)
      if (sub) {
        subTypes[mainCat][sub] = (subTypes[mainCat][sub] || 0) + 1
      }
      
      // Count for sizes (Vehicle categories)
      if (mainCat === 'Vehicle Components' || mainCat === 'Vehicle Weapons') {
        if (!sizes[mainCat]) sizes[mainCat] = {}
        const sizeMatch = bp.categoryName.match(/S(\d)/)
        if (sizeMatch) {
          const size = `S${sizeMatch[1]}`
          sizes[mainCat][size] = (sizes[mainCat][size] || 0) + 1
        }
      }
      
      // Count for armor weights (FPS Armour)
      if (mainCat === 'FPS Armour') {
        const weight = getArmorWeight(bp)
        if (weight) {
          armorWeights[weight] = (armorWeights[weight] || 0) + 1
        }
        // Count for armor slots
        const slot = getArmorSlot(bp)
        if (slot) {
          armorSlots[slot] = (armorSlots[slot] || 0) + 1
        }
      }
    })
    
    return { subTypes, sizes, armorWeights, armorSlots, mainCounts }
  }, [materialFilteredBlueprints])

  // Filtered counts for armor that respect current selections
  const filteredArmorCounts = React.useMemo(() => {
    if (selectedMainCategory !== 'FPS Armour') return { weights: {}, slots: {}, types: {} }
    
    const weights = {}
    const slots = {}
    const types = {}
    
    materialFilteredBlueprints.forEach(bp => {
      if (!bp.categoryName) return

      const validCategories = MAIN_CATEGORY_GROUPS['FPS Armour'] || []
      if (!validCategories.includes(bp.categoryName)) return
      
      const weight = getArmorWeight(bp)
      const slot = getArmorSlot(bp)
      const type = getSubType(bp)
      
      // For weight counts: filter by selected slot and type
      const matchesSlotForWeight = !selectedArmorSlot || slot === selectedArmorSlot
      const matchesTypeForWeight = !selectedSubCategory || type === selectedSubCategory
      if (matchesSlotForWeight && matchesTypeForWeight && weight) {
        weights[weight] = (weights[weight] || 0) + 1
      }
      
      // For slot counts: filter by selected weight and type
      const matchesWeightForSlot = !selectedArmorWeight || weight === selectedArmorWeight
      const matchesTypeForSlot = !selectedSubCategory || type === selectedSubCategory
      if (matchesWeightForSlot && matchesTypeForSlot && slot) {
        slots[slot] = (slots[slot] || 0) + 1
      }
      
      // For type counts: filter by selected weight and slot
      const matchesWeightForType = !selectedArmorWeight || weight === selectedArmorWeight
      const matchesSlotForType = !selectedArmorSlot || slot === selectedArmorSlot
      if (matchesWeightForType && matchesSlotForType && type) {
        types[type] = (types[type] || 0) + 1
      }
    })
    
    return { weights, slots, types }
  }, [materialFilteredBlueprints, selectedMainCategory, selectedArmorWeight, selectedArmorSlot, selectedSubCategory])

  // Subcategory counts filtered by selected size (for Vehicle categories) or armor weight/slot (for FPS Armour)
  const filteredSubTypeCounts = React.useMemo(() => {
    if (!selectedMainCategory) return {}
    
    // For FPS Armour, use the pre-calculated filtered type counts
    if (selectedMainCategory === 'FPS Armour') {
      return filteredArmorCounts.types
    }
    
    const counts = {}
    materialFilteredBlueprints.forEach(bp => {
      if (!bp.categoryName) return

      const validCategories = MAIN_CATEGORY_GROUPS[selectedMainCategory] || []
      if (!validCategories.includes(bp.categoryName)) return
      
      // Filter by vehicle size if selected
      if (selectedSize && !bp.categoryName.includes(selectedSize)) return
      
      const sub = getSubType(bp)
      if (sub) {
        counts[sub] = (counts[sub] || 0) + 1
      }
    })
    
    return counts
  }, [materialFilteredBlueprints, selectedMainCategory, selectedSize, filteredArmorCounts])

  // Final filtered blueprints (applies category filters on top of material filter, sorted A-Z)
  const filteredBlueprints = React.useMemo(() => {
    let results = materialFilteredBlueprints

    if (selectedMainCategory) {
      results = results.filter(bp => {
        if (isDefaultBlueprintsCategory(selectedMainCategory)) {
          return isDefaultBlueprint(bp.internalName)
        }

        const validCategories = MAIN_CATEGORY_GROUPS[selectedMainCategory] || []
        if (!validCategories.includes(bp.categoryName)) return false
        
        if (selectedSize && !bp.categoryName.includes(selectedSize)) return false
        
        // Filter by armor weight for FPS Armour
        if (selectedArmorWeight && selectedMainCategory === 'FPS Armour') {
          const weight = getArmorWeight(bp)
          if (weight !== selectedArmorWeight) return false
        }
        
        // Filter by armor slot for FPS Armour
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

    return results.sort((a, b) => 
      (a.blueprintName || '').localeCompare(b.blueprintName || '')
    )
  }, [materialFilteredBlueprints, selectedMainCategory, selectedSubCategory, selectedSize, selectedArmorWeight, selectedArmorSlot])

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
        showOnlyRewards,
        acquisitionFilter,
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
      showOnlyRewards,
      acquisitionFilter,
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
    (bp) => {
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
          onToggleOrderable={(next) =>
            void setOrderable(bp.internalName, next, catalogReward)
          }
          ownerCount={blueprintOwnerCounts[bp.internalName]}
          dfpDisplayEnabled={dfpDisplayEnabled}
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

  const handleMainCategoryClick = (cat) => {
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
      <div className="site-shell py-24 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-t-2 border-b-2 border-orange-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-lg font-medium">Loading blueprints...</p>
        </div>
      </div>
    )
  }

  if (!blueprints) {
    return (
      <div className="site-shell py-24 flex items-center justify-center">
        <p className="text-red-400 text-xl font-medium">Failed to load blueprints</p>
      </div>
    )
  }

  const sizeOptions = selectedMainCategory ? VEHICLE_SIZE_OPTIONS[selectedMainCategory] || [] : []
  const currentSizes = sizeOptions.reduce((acc, size) => {
    acc[size] = (categoryData.sizes[selectedMainCategory]?.[size] ?? 0)
    return acc
  }, {})
  const currentArmorWeights = ARMOR_WEIGHT_OPTIONS.reduce((acc, weight) => {
    acc[weight] = filteredArmorCounts.weights[weight] || 0
    return acc
  }, {})
  const currentArmorSlots = ARMOR_SLOT_OPTIONS.reduce((acc, slot) => {
    acc[slot] = filteredArmorCounts.slots[slot] || 0
    return acc
  }, {})
  const discoveredSubTypes = selectedMainCategory ? categoryData.subTypes[selectedMainCategory] || {} : {}
  const staticSubTypes = STATIC_SUBTYPE_OPTIONS[selectedMainCategory] || []
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
  const currentSubTypes = subTypeOptions.reduce((acc, key) => {
    acc[key] = filteredSubTypeCounts[key] || 0
    return acc
  }, {})
  const showVehicleSizes = sizeOptions.length > 0
  const showArmorWeights = selectedMainCategory === 'FPS Armour'
  const showArmorSlots = selectedMainCategory === 'FPS Armour'
  const showSubTypes = subTypeOptions.length > 0
  const hasSubFilters = showVehicleSizes || showArmorWeights || showArmorSlots || showSubTypes

  return (
    <FeaturePageLayout
      title="Blueprints"
      subtitle="Comprehensive Crafting Database & Mission Rewards Tracker"
      actions={
        !isGuestPreview ? (
          <button
            type="button"
            onClick={openBpDumperModal}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 rounded-lg transition-colors"
          >
            BP Dumper
          </button>
        ) : null
      }
      meta={
        <>
          <span>LIVE {blueprintDataVersion}</span>
          <span className="mx-2">•</span>
          <span className="text-green-400">
            {`${Object.keys(displayAcquiredBlueprints).length} acquired`}
          </span>
        </>
      }
    >
      {isGuest && (
        <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-200 text-sm">
          <strong className="text-amber-100">Offline Mode</strong> — Your "Acquired" marks are saved locally in this browser.
          Sign in to sync them to your account.
        </div>
      )}

      {!isGuestPreview && (
        <BpDumperCallout onOpenModal={openBpDumperModal} />
      )}

      <div className="space-y-3 mb-6 w-full min-w-0">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input flex-1 min-w-0 basis-full sm:basis-0 sm:min-w-[8rem] px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => setShowOnlyRewards(!showOnlyRewards)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 site-btn-shimmer ${
              showOnlyRewards
                ? 'site-filter-selected-amber'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
            }`}
          >
            ★ Rewards
          </button>
          {/* Acquisition Filter */}
          <select
            value={acquisitionFilter}
            onChange={(e) => setAcquisitionFilter(e.target.value as 'all' | 'acquired' | 'not_acquired')}
            className="site-input px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="acquired">✓ Acquired</option>
            <option value="not_acquired">✗ Not Acquired</option>
          </select>
        </div>

        {/* Main Category Tags */}
        <div className="flex flex-wrap gap-1.5 lg:gap-2 items-center">
            <BlueprintMaterialFilter
              materials={allBlueprintMaterials}
              selectedMaterial={selectedMaterial}
              onSelect={setSelectedMaterial}
              onClear={() => setSelectedMaterial(null)}
            />
            {Object.keys(MAIN_CATEGORY_GROUPS).map(cat => {
              const count = categoryData.mainCounts[cat] || 0
              return (
                <button
                  key={cat}
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
                  <span className="md:hidden">{cat.replace('Vehicle ', 'V.').replace('Components', 'Comp').replace('Weapons', 'Wpn').replace('Mission Items', 'Mission').replace('FPS ', '')}</span>
                  <span className="text-[10px] lg:text-xs ml-1 opacity-70">({count})</span>
                </button>
              )
            })}
          </div>

          {/* Sub-Category Tags (shown when main category selected) */}
          {hasSubFilters && (
            <div className="flex flex-wrap gap-1.5 lg:gap-2 pt-2 border-t border-slate-700/50">
              {/* Size filters for Vehicle categories */}
              {showVehicleSizes && (
                <>
                  {sizeOptions.map(size => {
                    const count = currentSizes[size] || 0
                    return (
                      <button
                        key={size}
                        onClick={() => {
                          setSelectedSize(selectedSize === size ? null : size)
                          setSelectedSubCategory(null)
                        }}
                        disabled={count === 0}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                          selectedSize === size
                            ? 'site-filter-selected-blue'
                            : count === 0
                              ? 'bg-blue-950/30 text-blue-800 border border-blue-900/50 cursor-not-allowed'
                              : 'bg-blue-950/50 text-blue-400 hover:bg-blue-900/50 border border-blue-800/50'
                        }`}
                      >
                        {size}<span className="opacity-70 ml-0.5">({count})</span>
                      </button>
                    )
                  })}
                  <span className="text-slate-500 self-center text-sm hidden lg:inline">+</span>
                </>
              )}
              
              {/* Weight filters for FPS Armour */}
              {showArmorWeights && (
                <>
                  {ARMOR_WEIGHT_OPTIONS.map(weight => {
                    const count = currentArmorWeights[weight] || 0
                    const displayName = weight === 'superheavy' ? 'Super Heavy' : weight.charAt(0).toUpperCase() + weight.slice(1)
                    return (
                      <button
                        key={weight}
                        onClick={() => {
                          setSelectedArmorWeight(selectedArmorWeight === weight ? null : weight)
                          setSelectedSubCategory(null)
                        }}
                        disabled={count === 0}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                          selectedArmorWeight === weight
                            ? 'site-filter-selected-blue'
                            : count === 0
                              ? 'bg-blue-950/30 text-blue-800 border border-blue-900/50 cursor-not-allowed'
                              : 'bg-blue-950/50 text-blue-400 hover:bg-blue-900/50 border border-blue-800/50'
                        }`}
                      >
                        {displayName}<span className="opacity-70 ml-0.5">({count})</span>
                      </button>
                    )
                  })}
                  <span className="text-slate-500 self-center text-sm hidden lg:inline">+</span>
                </>
              )}
              
              {/* Slot filters for FPS Armour */}
              {showArmorSlots && (
                <>
                  {ARMOR_SLOT_OPTIONS.map(slot => {
                    const count = currentArmorSlots[slot] || 0
                    const displayName =
                      ARMOR_SLOT_LABELS[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1)
                    return (
                      <button
                        key={slot}
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
                        {displayName}<span className="opacity-70 ml-0.5">({count})</span>
                      </button>
                    )
                  })}
                  <span className="text-slate-500 self-center text-sm hidden lg:inline">+</span>
                </>
              )}
              
              {/* Type filters */}
              {showSubTypes && subTypeOptions.map(sub => {
                const count = currentSubTypes[sub] || 0
                return (
                  <button
                    key={sub}
                    onClick={() => setSelectedSubCategory(selectedSubCategory === sub ? null : sub)}
                    disabled={count === 0}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all site-btn-shimmer ${
                      selectedSubCategory === sub
                        ? 'site-filter-selected-orange'
                        : count === 0
                          ? 'bg-orange-950/30 text-orange-800 border border-orange-900/50 cursor-not-allowed'
                          : 'bg-orange-950/50 text-orange-400 hover:bg-orange-900/50 border border-orange-800/50'
                    }`}
                  >
                    {formatSubType(sub)}<span className="opacity-70 ml-0.5">({count})</span>
                  </button>
                )
              })}
            </div>
          )}

        {/* Results count */}
        <div className="text-slate-500 text-sm">
          Showing {filteredBlueprints.length} blueprints
          {(selectedMaterial ||
            selectedMainCategory ||
            selectedSubCategory ||
            selectedSize ||
            selectedArmorWeight ||
            selectedArmorSlot) && (
            <span>
              {' '}
              (filtered from{' '}
              {selectedMainCategory ||
              selectedSubCategory ||
              selectedSize ||
              selectedArmorWeight ||
              selectedArmorSlot
                ? materialFilteredBlueprints.length
                : baseFilteredBlueprints.length}
              )
            </span>
          )}
        </div>
      </div>

      <section className="mt-4 w-full min-w-0">
        {filteredBlueprints.length === 0 ? (
          <div className="text-center py-24 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-700">
            <div className="text-6xl mb-4 animate-bounce">🔍</div>
            <p className="text-slate-400 text-xl font-medium mb-4">No blueprints found</p>
            <button
              onClick={() => {
                setSelectedMaterial(null)
                setSelectedMainCategory(null)
                setSelectedSubCategory(null)
                setSelectedSize(null)
                setSelectedArmorWeight(null)
                setSelectedArmorSlot(null)
                setShowOnlyRewards(false)
                setSearchTerm('')
                setAcquisitionFilter('all')
              }}
              className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-500/25"
            >
              Clear All Filters
            </button>
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
            isDefaultBlueprint(selectedBlueprint.internalName) ||
            !!displayAcquiredBlueprints[selectedBlueprint.internalName]
          }
          isOnTarget={isOnTargetList(selectedBlueprint.internalName)}
          effectiveIsOrderable={resolveIsOrderable(selectedBlueprint, overridesMap)}
          canAddToTargetList={canAddBlueprintToTargetList(selectedBlueprint, overridesMap)}
          onToggleTarget={() => toggleTarget(selectedBlueprint.internalName)}
          canAddToOrder={!isGuest && isApproved && canAddBlueprintToOrder(selectedBlueprint, overridesMap)}
          ownerCount={blueprintOwnerCounts[selectedBlueprint.internalName]}
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
    </FeaturePageLayout>
  )
}
