import React from 'react'
import { blueprintDataVersion, useBlueprintData } from './blueprints'
import BlueprintCard from '../components/BlueprintCard'
import BlueprintDetailsModal from '../components/BlueprintDetailsModal'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import RsiVerifiedBadge from '../components/RsiVerifiedBadge'
import { useAuth } from '../contexts/AuthContext'
import { useBlueprintOrderOverrides } from '../hooks/useBlueprintOrderOverrides'
import { useTargetList } from '../hooks/useTargetList'
import { useAsyncEffect } from '../hooks/useAsyncEffect'
import {
  canAddBlueprintToTargetList,
  resolveIsOrderable,
} from '../lib/blueprintOrderable'
const FPS_WEAPON_TYPE_OPTIONS = ['crossbow', 'lmg', 'pistol', 'rifle', 'shotgun', 'smg', 'sniper']

const getFpsWeaponTypeFromFilename = (filename) => {
  const fn = (filename || '').toLowerCase()
  for (const type of FPS_WEAPON_TYPE_OPTIONS) {
    if (fn.includes(`_${type}_`) || fn.includes(`_${type}.`)) return type
  }
  return null
}

const getSubType = (bp) => {
  const parts = bp.file.split('\\')
  const filename = parts[parts.length - 1] || ''
  
  for (let i = 0; i < parts.length - 1; i++) {
    // Vehicle weapons: vehiclegear\weapons\[type] or vehiclegear\weapons\$templates\[type]
    if (parts[i] === 'vehiclegear' && parts[i + 1] === 'weapons') {
      let next = parts[i + 2]?.replace('$', '')
      if (next === 'templates' && parts[i + 3]) next = parts[i + 3]
      return next || null
    }
    
    // FPS weapons: fpsgear\weapons\[type] or fpsgear\weapons\$templates\...
    if (parts[i] === 'weapons' && parts[i - 1] === 'fpsgear') {
      const sub = parts[i + 1]?.replace('$', '')
      // If in templates folder, extract type from filename
      if (sub === 'templates') {
        return getFpsWeaponTypeFromFilename(filename) || 'other'
      }
      return sub
    }
    
    // FPS ammo: categorize by weapon type (pistol, rifle, etc.) like FPS weapons
    if (parts[i] === 'ammo' && parts[i - 1] === 'fpsgear') {
      const fromFilename = getFpsWeaponTypeFromFilename(filename)
      if (fromFilename) return fromFilename
      const folderType = parts[i + 1]?.replace('$', '')
      if (FPS_WEAPON_TYPE_OPTIONS.includes(folderType)) return folderType
      return null
    }
    
    // FPS armour: fpsgear\armour\[type] or fpsgear\armour\combat\[weight] or fpsgear\armour\$templates\[type]
    // Combat armor gets "standard" as type, template armor gets its specific type
    if (parts[i] === 'armour' && parts[i - 1] === 'fpsgear') {
      const rawSub = parts[i + 1]?.replace('$', '')
      const sub = rawSub === 'templates' && parts[i + 2] ? parts[i + 2] : rawSub
      // For combat armor, return 'standard' as the type - weight is a separate filter
      if (sub === 'combat') return 'standard'
      // For flightsuit: helmets are "standard" type, bodies are "flightsuit" type
      if (sub === 'flightsuit') {
        if (filename.includes('_helmet')) return 'standard'
        return 'flightsuit'
      }
      return sub
    }
    
    // Vehicle components: vehiclegear\[type]
    if (parts[i] === 'vehiclegear' && parts[i + 1] !== 'weapons') {
      return parts[i + 1]?.replace('$', '')
    }
  }
  return null
}

const getArmorWeightFromPath = (parts) => {
  const armourIdx = parts.indexOf('armour')
  if (armourIdx < 0) return null
  for (let i = armourIdx + 1; i < parts.length - 1; i++) {
    const segment = parts[i]?.toLowerCase()
    if (['superheavy', 'heavy', 'medium', 'light'].includes(segment)) return segment
  }
  return null
}

const isFlightArmor = (parts, filename, blueprintName = '') => {
  if (parts.some(p => p.toLowerCase() === 'flightsuit')) return true
  if (parts.some(p => p.toLowerCase() === 'racer')) return true
  if (filename.includes('flightsuit')) return true
  const name = (blueprintName || '').toLowerCase()
  if (name.includes('flight') || name.includes('racing')) return true
  return false
}

const getArmorWeight = (bp) => {
  const parts = bp.file.split('\\')
  const filename = parts[parts.length - 1]?.toLowerCase() || ''
  
  // Check if this is FPS armor
  const isArmor = parts.some((p, i) => p === 'armour' && parts[i - 1] === 'fpsgear')
  if (!isArmor) return null
  
  // Flight suits, racing gear, and flight/racing helmets
  if (isFlightArmor(parts, filename, bp.blueprintName)) return 'flight'
  
  // Extract weight from filename (works for both combat and template armor)
  // Patterns: armor_heavy_arms, utility_light_backpack, combat_medium_core, etc.
  if (filename.includes('_superheavy_') || filename.includes('_superheavy.')) return 'superheavy'
  if (filename.includes('_heavy_') || filename.includes('_heavy.')) return 'heavy'
  if (filename.includes('_medium_') || filename.includes('_medium.')) return 'medium'
  if (filename.includes('_light_') || filename.includes('_light.')) return 'light'
  
  // Fallback: weight from folder path (e.g. combat\light\bp_craft_gys_jacket_01_01_01.json)
  const fromPath = getArmorWeightFromPath(parts)
  if (fromPath) return fromPath

  // Undersuits are the lightest base layer
  if (parts.some(p => p.toLowerCase() === 'undersuit')) return 'light'
  
  return null
}

const getArmorSlot = (bp) => {
  const parts = bp.file.split('\\')
  const filename = parts[parts.length - 1]?.toLowerCase() || ''
  
  // Check if this is FPS armor
  const isArmor = parts.some((p, i) => p === 'armour' && parts[i - 1] === 'fpsgear')
  if (!isArmor) return null
  
  // Extract slot from filename
  // Patterns: armor_heavy_helmet, armor_heavy_arms, armor_heavy_core, armor_heavy_legs, combat_heavy_backpack
  if (filename.includes('_helmet')) return 'helmet'
  if (filename.includes('_arms')) return 'arms'
  if (filename.includes('_core') || filename.includes('_jacket')) return 'core'
  if (filename.includes('_legs') || filename.includes('_pants')) return 'legs'
  if (filename.includes('_backpack') || filename.includes('backpack_')) return 'backpack'
  
  return null
}

const MAIN_CATEGORY_GROUPS = {
  'FPS Weapons': ['FPSWeapons'],
  'FPS Armour': ['FPSArmours'],
  'Ammo': ['Ammo'],
  'Vehicle Components': ['Veh. Comp. S0', 'Veh. Comp. S1', 'Veh. Comp. S2', 'Veh. Comp. S3', 'Veh. Comp. S4'],
  'Vehicle Weapons': ['Veh. Weapons S1', 'Veh. Weapons S2', 'Veh. Weapons S3', 'Veh. Weapons S4', 'Veh. Weapons S5', 'Veh. Weapons S6'],
  'Mission Items': ['MissionItem'],
}

const ARMOR_WEIGHT_OPTIONS = ['flight', 'light', 'medium', 'heavy', 'superheavy']
const ARMOR_SLOT_OPTIONS = ['helmet', 'arms', 'core', 'legs', 'backpack']
const VEHICLE_SIZE_OPTIONS = {
  'Vehicle Components': ['S0', 'S1', 'S2', 'S3', 'S4'],
  'Vehicle Weapons': ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
}
const STATIC_SUBTYPE_OPTIONS = {
  'FPS Weapons': FPS_WEAPON_TYPE_OPTIONS,
  'Ammo': FPS_WEAPON_TYPE_OPTIONS,
  'FPS Armour': ['standard', 'flightsuit', 'undersuit', 'explorer', 'salvager', 'stealth'],
}

const formatSubType = (sub) => {
  if (!sub) return sub
  return sub.charAt(0).toUpperCase() + sub.slice(1).replace(/([A-Z])/g, ' $1')
}

export default function BlueprintsRoute() {
  const { 
    acquiredBlueprints: myAcquiredBlueprints, 
    toggleAcquired, 
    canModifyBlueprints,
    showMemberCollections,
    isPending,
    fetchUsersWithBlueprints,
    fetchUserBlueprints,
    user,
    isApproved,
    isSuperAdmin,
    isGuestPreview,
  } = useAuth()
  const isGuest = !user && isGuestPreview

  const { overridesMap, setOrderable } = useBlueprintOrderOverrides()
  const { isOnTargetList, toggleTarget } = useTargetList(overridesMap)
  
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedMainCategory, setSelectedMainCategory] = React.useState(null)
  const [selectedSubCategory, setSelectedSubCategory] = React.useState(null)
  const [selectedSize, setSelectedSize] = React.useState(null)
  const [selectedArmorWeight, setSelectedArmorWeight] = React.useState(null)
  const [selectedArmorSlot, setSelectedArmorSlot] = React.useState(null)
  const [showOnlyRewards, setShowOnlyRewards] = React.useState(true)
  const [selectedBlueprint, setSelectedBlueprint] = React.useState(null)

  const [usersWithBlueprints, setUsersWithBlueprints] = React.useState([])
  const [selectedUserId, setSelectedUserId] = React.useState('all')
  const [viewedUserBlueprints, setViewedUserBlueprints] = React.useState({})
  const [loadingUserBlueprints, setLoadingUserBlueprints] = React.useState(false)

  const { data: blueprints, isLoading } = useBlueprintData()

  useAsyncEffect(async ({ cancelled }) => {
    if (!showMemberCollections) {
      setUsersWithBlueprints([])
      setSelectedUserId('all')
      return
    }

    const users = await fetchUsersWithBlueprints()
    if (!cancelled) setUsersWithBlueprints(users)
  }, [showMemberCollections, fetchUsersWithBlueprints])

  React.useEffect(() => {
    if (selectedUserId !== 'all' && !usersWithBlueprints.some((u) => u.id === selectedUserId)) {
      setSelectedUserId('all')
    }
  }, [usersWithBlueprints, selectedUserId])

  useAsyncEffect(async ({ cancelled }) => {
    if (selectedUserId === 'all' || selectedUserId === user?.id) {
      setViewedUserBlueprints({})
      setLoadingUserBlueprints(false)
      return
    }

    setLoadingUserBlueprints(true)
    const blueprints = await fetchUserBlueprints(selectedUserId)
    if (cancelled) return
    setViewedUserBlueprints(blueprints)
    setLoadingUserBlueprints(false)
  }, [selectedUserId, user?.id])

  const isViewingOther = selectedUserId !== 'all' && selectedUserId !== user?.id
  
  // For FILTERING: use viewed user's blueprints when viewing another user
  const filterAcquiredBlueprints = isViewingOther ? viewedUserBlueprints : myAcquiredBlueprints
  // For DISPLAY (checkmarks): always show the viewer's own acquired status
  const displayAcquiredBlueprints = myAcquiredBlueprints

  // Base filtered blueprints (applies global filters: search, rewards, and user filter)
  const baseFilteredBlueprints = React.useMemo(() => {
    if (!blueprints) return []
    
    return blueprints.filter(bp => {
      if (!bp.blueprintName || !bp.file) return false
      
      const matchesSearch = searchTerm === '' || bp.blueprintName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesReward = !showOnlyRewards || resolveIsOrderable(bp, overridesMap)
      
      // When viewing a specific user (not "all"), only show their acquired blueprints
      const matchesUserFilter = selectedUserId === 'all' || filterAcquiredBlueprints[bp.file]
      
      return matchesSearch && matchesReward && matchesUserFilter
    })
  }, [blueprints, searchTerm, showOnlyRewards, selectedUserId, filterAcquiredBlueprints, overridesMap])

  // Category data with counts based on current global filters
  const categoryData = React.useMemo(() => {
    if (!baseFilteredBlueprints.length) return { subTypes: {}, sizes: {}, armorWeights: {}, armorSlots: {}, mainCounts: {} }
    
    const subTypes = {}
    const sizes = {}
    const armorWeights = {}
    const armorSlots = {}
    const mainCounts = {}
    
    baseFilteredBlueprints.forEach(bp => {
      if (!bp.categoryName) return
      
      const mainCat = Object.keys(MAIN_CATEGORY_GROUPS).find(key => 
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
  }, [baseFilteredBlueprints])

  // Filtered counts for armor that respect current selections
  const filteredArmorCounts = React.useMemo(() => {
    if (selectedMainCategory !== 'FPS Armour') return { weights: {}, slots: {}, types: {} }
    
    const weights = {}
    const slots = {}
    const types = {}
    
    baseFilteredBlueprints.forEach(bp => {
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
  }, [baseFilteredBlueprints, selectedMainCategory, selectedArmorWeight, selectedArmorSlot, selectedSubCategory])

  // Subcategory counts filtered by selected size (for Vehicle categories) or armor weight/slot (for FPS Armour)
  const filteredSubTypeCounts = React.useMemo(() => {
    if (!selectedMainCategory) return {}
    
    // For FPS Armour, use the pre-calculated filtered type counts
    if (selectedMainCategory === 'FPS Armour') {
      return filteredArmorCounts.types
    }
    
    const counts = {}
    baseFilteredBlueprints.forEach(bp => {
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
  }, [baseFilteredBlueprints, selectedMainCategory, selectedSize, filteredArmorCounts])

  // Final filtered blueprints (applies category filters on top of base, sorted A-Z)
  const filteredBlueprints = React.useMemo(() => {
    let results = baseFilteredBlueprints

    if (selectedMainCategory) {
      results = results.filter(bp => {
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
  }, [baseFilteredBlueprints, selectedMainCategory, selectedSubCategory, selectedSize, selectedArmorWeight, selectedArmorSlot])

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
      meta={
        <>
          <span>LIVE {blueprintDataVersion}</span>
          <span className="mx-2">•</span>
          <span className="text-green-400">
            {isViewingOther 
              ? `${Object.keys(filterAcquiredBlueprints).length} in collection`
              : `${Object.keys(displayAcquiredBlueprints).length} acquired`
            }
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
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              showOnlyRewards
                ? 'bg-amber-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
            }`}
          >
            ★ Rewards
          </button>
          {showMemberCollections && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="site-input w-full sm:w-auto sm:max-w-[10rem] px-2 py-1.5 text-sm min-w-0"
            >
              <option value="all">Everyone</option>
              {usersWithBlueprints.map(u => (
                <option key={u.id} value={u.id}>
                  {u.rsi_handle_verified ? '✓ ' : ''}{u.rsi_handle || u.display_name || 'Unknown'} ({u.blueprint_count})
                </option>
              ))}
            </select>
          )}
        </div>

        {isViewingOther && (() => {
          const viewedUser = usersWithBlueprints.find(u => u.id === selectedUserId)
          return (
            <div className="text-xs bg-amber-900/20 border border-amber-500/30 rounded py-2 px-3 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400">
                <span>Viewing {viewedUser?.rsi_handle || viewedUser?.display_name || 'user'}&apos;s collection</span>
                {viewedUser?.rsi_handle_verified && <RsiVerifiedBadge size="sm" />}
                {loadingUserBlueprints && <span>(loading...)</span>}
              </div>
              <p className="text-amber-300/70">
                Checkmarks show your own acquired status. Mark blueprints as acquired or add to your Target list without affecting their collection.
              </p>
            </div>
          )
        })()}

        {/* Main Category Tags */}
        <div className="flex flex-wrap gap-1.5 lg:gap-2">
            {Object.keys(MAIN_CATEGORY_GROUPS).map(cat => {
              const count = categoryData.mainCounts[cat] || 0
              return (
                <button
                  key={cat}
                  onClick={() => handleMainCategoryClick(cat)}
                  disabled={count === 0}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
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
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all ${
                          selectedSize === size
                            ? 'bg-blue-600 text-white'
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
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all ${
                          selectedArmorWeight === weight
                            ? 'bg-blue-600 text-white'
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
                    const displayName = slot.charAt(0).toUpperCase() + slot.slice(1)
                    return (
                      <button
                        key={slot}
                        onClick={() => {
                          setSelectedArmorSlot(selectedArmorSlot === slot ? null : slot)
                          setSelectedSubCategory(null)
                        }}
                        disabled={count === 0}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all ${
                          selectedArmorSlot === slot
                            ? 'bg-green-600 text-white'
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
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-all ${
                      selectedSubCategory === sub
                        ? 'bg-orange-600 text-white'
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
          {(selectedMainCategory || selectedSubCategory || selectedSize) && (
            <span> (filtered from {baseFilteredBlueprints.length})</span>
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
                setSelectedMainCategory(null)
                setSelectedSubCategory(null)
                setSelectedSize(null)
                setSelectedArmorWeight(null)
                setSelectedArmorSlot(null)
                setShowOnlyRewards(false)
                setSearchTerm('')
                setSelectedUserId('all')
              }}
              className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-500/25"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 w-full min-w-0">
            {filteredBlueprints.map(bp => {
              const effectiveIsOrderable = resolveIsOrderable(bp, overridesMap)
              const catalogReward = bp.isReward === true
              // Use display (viewer's) acquired status for canTarget check
              const canTarget =
                isApproved &&
                !displayAcquiredBlueprints[bp.file] &&
                canAddBlueprintToTargetList(bp, overridesMap)

              return (
                <BlueprintCard
                  key={bp.file}
                  blueprint={bp}
                  onClick={() => setSelectedBlueprint(bp)}
                  isAcquired={!!displayAcquiredBlueprints[bp.file]}
                  onToggleAcquired={() => toggleAcquired(bp.file)}
                  canModify={canModifyBlueprints}
                  isPending={isPending}
                  showTargetControl={canTarget}
                  isOnTargetList={isOnTargetList(bp.file)}
                  onToggleTarget={() => toggleTarget(bp.file)}
                  effectiveIsOrderable={effectiveIsOrderable}
                  catalogIsReward={catalogReward}
                  isSuperAdmin={isSuperAdmin && !isViewingOther}
                  onToggleOrderable={(next) =>
                    void setOrderable(bp.file, next, catalogReward)
                  }
                />
              )
            })}
          </div>
        )}
      </section>

      {selectedBlueprint && (
        <BlueprintDetailsModal
          blueprint={selectedBlueprint}
          subTypeLabel={formatSubType(getSubType(selectedBlueprint))}
          onClose={() => setSelectedBlueprint(null)}
          isApproved={isApproved}
          isAcquired={!!displayAcquiredBlueprints[selectedBlueprint.file]}
          isOnTarget={isOnTargetList(selectedBlueprint.file)}
          effectiveIsOrderable={resolveIsOrderable(selectedBlueprint, overridesMap)}
          canAddToTargetList={canAddBlueprintToTargetList(selectedBlueprint, overridesMap)}
          onToggleTarget={() => toggleTarget(selectedBlueprint.file)}
        />
      )}
    </FeaturePageLayout>
  )
}
