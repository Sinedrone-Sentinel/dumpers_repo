import React from 'react'
import { useBlueprintData } from './blueprints'
import BlueprintCard from '../components/BlueprintCard'
import { useAuth } from '../contexts/AuthContext'

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
      let sub = parts[i + 1]?.replace('$', '')
      // If in templates folder, extract type from filename
      if (sub === 'templates') {
        if (filename.includes('crossbow')) return 'crossbow'
        if (filename.includes('lmg')) return 'lmg'
        if (filename.includes('pistol')) return 'pistol'
        if (filename.includes('rifle')) return 'rifle'
        if (filename.includes('shotgun')) return 'shotgun'
        if (filename.includes('smg')) return 'smg'
        if (filename.includes('sniper')) return 'sniper'
        return 'other'
      }
      return sub
    }
    
    // FPS ammo
    if (parts[i] === 'ammo' && parts[i - 1] === 'fpsgear') {
      const ammoType = parts[i + 1]?.replace('$', '')
      if (['plasma', 'laser', 'electron'].includes(ammoType)) return 'energy'
      return ammoType
    }
    
    // FPS armour: fpsgear\armour\[type] or fpsgear\armour\combat\[weight] or fpsgear\armour\$templates\[type]
    // Combat armor gets "standard" as type, template armor gets its specific type
    if (parts[i] === 'armour' && parts[i - 1] === 'fpsgear') {
      let sub = parts[i + 1]?.replace('$', '')
      if (sub === 'templates' && parts[i + 2]) sub = parts[i + 2]
      // For combat armor, return 'standard' as the type - weight is a separate filter
      if (sub === 'combat') return 'standard'
      return sub
    }
    
    // Vehicle components: vehiclegear\[type]
    if (parts[i] === 'vehiclegear' && parts[i + 1] !== 'weapons') {
      return parts[i + 1]?.replace('$', '')
    }
  }
  return null
}

const getArmorWeight = (bp) => {
  const parts = bp.file.split('\\')
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'armour' && parts[i - 1] === 'fpsgear') {
      const sub = parts[i + 1]?.replace('$', '')
      if (sub === 'combat' && parts[i + 2]) {
        const weight = parts[i + 2].toLowerCase()
        if (['light', 'medium', 'heavy', 'superheavy'].includes(weight)) {
          return weight
        }
      }
    }
  }
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

const formatSubType = (sub) => {
  if (!sub) return sub
  return sub.charAt(0).toUpperCase() + sub.slice(1).replace(/([A-Z])/g, ' $1')
}

export default function BlueprintsRoute() {
  const { 
    acquiredBlueprints: myAcquiredBlueprints, 
    toggleAcquired, 
    canModifyBlueprints,
    fetchUsersWithBlueprints,
    fetchUserBlueprints,
    user
  } = useAuth()
  
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedMainCategory, setSelectedMainCategory] = React.useState(null)
  const [selectedSubCategory, setSelectedSubCategory] = React.useState(null)
  const [selectedSize, setSelectedSize] = React.useState(null)
  const [selectedArmorWeight, setSelectedArmorWeight] = React.useState(null)
  const [showOnlyRewards, setShowOnlyRewards] = React.useState(true)
  const [selectedBlueprint, setSelectedBlueprint] = React.useState(null)
  
  const [usersWithBlueprints, setUsersWithBlueprints] = React.useState([])
  const [selectedUserId, setSelectedUserId] = React.useState('all')
  const [viewedUserBlueprints, setViewedUserBlueprints] = React.useState({})
  const [loadingUserBlueprints, setLoadingUserBlueprints] = React.useState(false)

  const { data: blueprints, isLoading } = useBlueprintData()

  const refreshUsersList = React.useCallback(() => {
    fetchUsersWithBlueprints().then(setUsersWithBlueprints)
  }, [fetchUsersWithBlueprints])

  React.useEffect(() => {
    refreshUsersList()
  }, [refreshUsersList, myAcquiredBlueprints])

  React.useEffect(() => {
    if (selectedUserId === 'all' || selectedUserId === user?.id) {
      setViewedUserBlueprints({})
    } else {
      setLoadingUserBlueprints(true)
      fetchUserBlueprints(selectedUserId).then(blueprints => {
        setViewedUserBlueprints(blueprints)
        setLoadingUserBlueprints(false)
      })
    }
  }, [selectedUserId, user?.id])

  const isViewingOther = selectedUserId !== 'all' && selectedUserId !== user?.id
  const acquiredBlueprints = isViewingOther ? viewedUserBlueprints : myAcquiredBlueprints

  // Base filtered blueprints (applies global filters: search, rewards, and user filter)
  const baseFilteredBlueprints = React.useMemo(() => {
    if (!blueprints) return []
    
    return blueprints.filter(bp => {
      if (!bp.blueprintName || !bp.file) return false
      
      const matchesSearch = searchTerm === '' || bp.blueprintName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesReward = !showOnlyRewards || bp.isReward === true
      
      // When viewing a specific user (not "all"), only show their acquired blueprints
      const matchesUserFilter = selectedUserId === 'all' || acquiredBlueprints[bp.file]
      
      return matchesSearch && matchesReward && matchesUserFilter
    })
  }, [blueprints, searchTerm, showOnlyRewards, selectedUserId, acquiredBlueprints])

  // Category data with counts based on current global filters
  const categoryData = React.useMemo(() => {
    if (!baseFilteredBlueprints.length) return { subTypes: {}, sizes: {}, armorWeights: {}, mainCounts: {} }
    
    const subTypes = {}
    const sizes = {}
    const armorWeights = {}
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
      }
    })
    
    return { subTypes, sizes, armorWeights, mainCounts }
  }, [baseFilteredBlueprints])

  // Subcategory counts filtered by selected size (for Vehicle categories) or armor weight (for FPS Armour)
  const filteredSubTypeCounts = React.useMemo(() => {
    // If no size or armor weight selected, return unfiltered counts
    if (!selectedMainCategory) return {}
    if (!selectedSize && !selectedArmorWeight) return categoryData.subTypes[selectedMainCategory] || {}
    
    const counts = {}
    baseFilteredBlueprints.forEach(bp => {
      if (!bp.categoryName) return
      
      const validCategories = MAIN_CATEGORY_GROUPS[selectedMainCategory] || []
      if (!validCategories.includes(bp.categoryName)) return
      
      // Filter by vehicle size if selected
      if (selectedSize && !bp.categoryName.includes(selectedSize)) return
      
      // Filter by armor weight if selected
      if (selectedArmorWeight && selectedMainCategory === 'FPS Armour') {
        const weight = getArmorWeight(bp)
        if (weight !== selectedArmorWeight) return
      }
      
      const sub = getSubType(bp)
      if (sub) {
        counts[sub] = (counts[sub] || 0) + 1
      }
    })
    
    return counts
  }, [baseFilteredBlueprints, selectedMainCategory, selectedSize, selectedArmorWeight, categoryData.subTypes])

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
  }, [baseFilteredBlueprints, selectedMainCategory, selectedSubCategory, selectedSize, selectedArmorWeight])

  const handleMainCategoryClick = (cat) => {
    if (selectedMainCategory === cat) {
      setSelectedMainCategory(null)
      setSelectedSubCategory(null)
      setSelectedSize(null)
      setSelectedArmorWeight(null)
    } else {
      setSelectedMainCategory(cat)
      setSelectedSubCategory(null)
      setSelectedSize(null)
      setSelectedArmorWeight(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 text-lg font-medium">Loading blueprints...</p>
        </div>
      </div>
    )
  }

  if (!blueprints) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-red-400 text-xl font-medium">Failed to load blueprints</p>
      </div>
    )
  }

  const currentSizes = selectedMainCategory ? categoryData.sizes[selectedMainCategory] || {} : {}
  const currentArmorWeights = selectedMainCategory === 'FPS Armour' ? categoryData.armorWeights || {} : {}
  // Get all subtypes for the category, but use filtered counts when a size/weight filter is active
  const allSubTypes = selectedMainCategory ? categoryData.subTypes[selectedMainCategory] || {} : {}
  const currentSubTypeCounts = (selectedSize || selectedArmorWeight) ? filteredSubTypeCounts : allSubTypes
  // Merge all subtypes with filtered counts (show all subtypes, some may have 0 count)
  const currentSubTypes = Object.keys(allSubTypes).reduce((acc, key) => {
    acc[key] = currentSubTypeCounts[key] || 0
    return acc
  }, {})
  const hasSubFilters = Object.keys(allSubTypes).length > 0 || Object.keys(currentSizes).length > 0 || Object.keys(currentArmorWeights).length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-2 sm:p-4 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700 shadow-lg mb-6">
        <div className="max-w-screen-xl mx-auto px-4 py-4 space-y-3">
          <div className="text-center space-y-1">
            <h1 
              className="text-3xl md:text-4xl lg:text-5xl font-black tracking-wider uppercase"
              style={{ 
                fontFamily: "'Orbitron', sans-serif",
                background: 'linear-gradient(135deg, #ef4444 0%, #f97316 25%, #eab308 50%, #f97316 75%, #ef4444 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 0 40px rgba(239, 68, 68, 0.5), 0 0 80px rgba(249, 115, 22, 0.3)',
                filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5))'
              }}
            >
              Dumper's Repo
            </h1>
            <p className="text-slate-500 text-sm hidden sm:block">
              Comprehensive Crafting Database & Mission Rewards Tracker
              <span className="mx-2">•</span>
              <span className="text-green-400">{Object.keys(acquiredBlueprints).length} acquired</span>
            </p>
          </div>

          {/* Search Bar, Rewards Toggle, and User Dropdown */}
          <div className="flex gap-1.5 sm:gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-slate-900/70 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all"
            />
            <button
              onClick={() => setShowOnlyRewards(!showOnlyRewards)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                showOnlyRewards
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
              }`}
            >
              ★ Rewards
            </button>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-2 py-1.5 text-sm bg-slate-900/70 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all min-w-[100px] sm:min-w-[140px]"
            >
              <option value="all">All</option>
              {usersWithBlueprints.map(u => (
                <option key={u.id} value={u.id}>
                  {u.rsi_handle || u.display_name || 'Unknown'} ({u.blueprint_count})
                </option>
              ))}
            </select>
          </div>
          
          {isViewingOther && (
            <div className="text-center text-xs text-amber-400 bg-amber-900/20 border border-amber-500/30 rounded py-1 px-2">
              Viewing {usersWithBlueprints.find(u => u.id === selectedUserId)?.rsi_handle || 
                       usersWithBlueprints.find(u => u.id === selectedUserId)?.display_name || 'user'}'s collection
              {loadingUserBlueprints && ' (loading...)'}
            </div>
          )}

          {/* Main Category Tags */}
          <div className="flex flex-wrap gap-1.5 lg:gap-2 justify-center">
            {Object.keys(MAIN_CATEGORY_GROUPS).map(cat => {
              const count = categoryData.mainCounts[cat] || 0
              return (
                <button
                  key={cat}
                  onClick={() => handleMainCategoryClick(cat)}
                  disabled={count === 0}
                  className={`px-2.5 py-1 lg:px-3 lg:py-1.5 xl:px-4 xl:py-2 rounded-md text-xs lg:text-sm xl:text-base font-medium transition-all ${
                    selectedMainCategory === cat
                      ? 'bg-red-600 text-white shadow-lg shadow-red-500/30'
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
            <div className="flex flex-wrap gap-1.5 lg:gap-2 justify-center pt-2 border-t border-slate-700/50">
              {/* Size filters for Vehicle categories */}
              {Object.keys(currentSizes).length > 0 && (
                <>
                  {Object.keys(currentSizes).sort().map(size => {
                    const count = currentSizes[size] || 0
                    return (
                      <button
                        key={size}
                        onClick={() => {
                          setSelectedSize(selectedSize === size ? null : size)
                          setSelectedSubCategory(null)
                        }}
                        disabled={count === 0}
                        className={`px-2 py-0.5 lg:px-2.5 lg:py-1 xl:px-3 rounded text-[11px] lg:text-xs xl:text-sm font-medium transition-all ${
                          selectedSize === size
                            ? 'bg-blue-600 text-white'
                            : count === 0
                              ? 'bg-slate-800/30 text-slate-600 border border-slate-700 cursor-not-allowed'
                              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
                        }`}
                      >
                        {size}<span className="opacity-70 ml-0.5">({count})</span>
                      </button>
                    )
                  })}
                  <span className="text-slate-600 self-center text-xs hidden lg:inline">|</span>
                </>
              )}
              
              {/* Weight filters for FPS Armour */}
              {Object.keys(currentArmorWeights).length > 0 && (
                <>
                  {['light', 'medium', 'heavy', 'superheavy'].filter(w => currentArmorWeights[w]).map(weight => {
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
                        className={`px-2 py-0.5 lg:px-2.5 lg:py-1 xl:px-3 rounded text-[11px] lg:text-xs xl:text-sm font-medium transition-all ${
                          selectedArmorWeight === weight
                            ? 'bg-blue-600 text-white'
                            : count === 0
                              ? 'bg-slate-800/30 text-slate-600 border border-slate-700 cursor-not-allowed'
                              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
                        }`}
                      >
                        {displayName}<span className="opacity-70 ml-0.5">({count})</span>
                      </button>
                    )
                  })}
                  <span className="text-slate-600 self-center text-xs hidden lg:inline">|</span>
                </>
              )}
              
              {/* Type filters */}
              {Object.keys(currentSubTypes).sort().map(sub => {
                const count = currentSubTypes[sub] || 0
                return (
                  <button
                    key={sub}
                    onClick={() => setSelectedSubCategory(selectedSubCategory === sub ? null : sub)}
                    disabled={count === 0}
                    className={`px-2 py-0.5 lg:px-2.5 lg:py-1 xl:px-3 rounded text-[11px] lg:text-xs xl:text-sm font-medium transition-all ${
                      selectedSubCategory === sub
                        ? 'bg-orange-600 text-white'
                        : count === 0
                          ? 'bg-slate-800/30 text-slate-600 border border-slate-700 cursor-not-allowed'
                          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
                    }`}
                  >
                    {formatSubType(sub)}<span className="opacity-70 ml-0.5">({count})</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Results count */}
          <div className="text-center text-slate-500 text-sm">
            Showing {filteredBlueprints.length} blueprints
            {(selectedMainCategory || selectedSubCategory || selectedSize) && (
              <span> (filtered from {baseFilteredBlueprints.length})</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-screen-xl mx-auto">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredBlueprints.map(bp => (
              <BlueprintCard 
                key={bp.file} 
                blueprint={bp} 
                onClick={() => setSelectedBlueprint(bp)}
                isAcquired={!!acquiredBlueprints[bp.file]}
                onToggleAcquired={() => toggleAcquired(bp.file)}
                canModify={canModifyBlueprints && !isViewingOther}
              />
            ))}
          </div>
        )}
      </main>

      {/* Blueprint Details Modal */}
      {selectedBlueprint && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedBlueprint(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-white">{selectedBlueprint.blueprintName}</h2>
                <button 
                  onClick={() => setSelectedBlueprint(null)}
                  className="text-slate-400 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="px-3 py-1 bg-slate-800 rounded-lg text-slate-300">
                    {selectedBlueprint.categoryName || 'Unknown'}
                  </span>
                  {getSubType(selectedBlueprint) && (
                    <span className="px-3 py-1 bg-slate-800 rounded-lg text-slate-300">
                      {formatSubType(getSubType(selectedBlueprint))}
                    </span>
                  )}
                  {selectedBlueprint.isReward === true && (
                    <span className="px-3 py-1 bg-amber-900/50 text-amber-400 rounded-lg">★ Reward</span>
                  )}
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4">
                  <h3 className="text-slate-400 text-sm mb-2">Craft Time</h3>
                  <p className="text-white text-lg font-mono">
                    {selectedBlueprint.craftTime?.hours || 0}h {selectedBlueprint.craftTime?.minutes || 0}m {selectedBlueprint.craftTime?.seconds || 0}s
                  </p>
                </div>

                {selectedBlueprint.slots && selectedBlueprint.slots.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-slate-400 text-sm mb-3">Required Resources</h3>
                    <div className="space-y-3">
                      {selectedBlueprint.slots.map((slot, idx) => (
                        <div key={idx} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-white font-medium">{slot.slotDisplayName}</span>
                            <span className="text-slate-400 text-sm">×{slot.requiredCount || 1}</span>
                          </div>
                          {slot.options && slot.options.length > 0 && (
                            <div className="space-y-1">
                              {slot.options.map((opt, optIdx) => (
                                <div key={optIdx} className="flex justify-between text-sm">
                                  <span className={opt.type === 'item' ? 'text-purple-400' : 'text-red-400'}>
                                    {opt.resourceName || opt.entityName || 'Unknown'}
                                  </span>
                                  {opt.standardCargoUnits > 0 ? (
                                    <span className="text-slate-500">{opt.standardCargoUnits} SCU</span>
                                  ) : opt.quantity > 0 ? (
                                    <span className="text-slate-500">×{opt.quantity}</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedBlueprint.rewardMissions && selectedBlueprint.rewardMissions.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-slate-400 text-sm mb-3">Reward Missions ({selectedBlueprint.rewardMissions.length})</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedBlueprint.rewardMissions.slice(0, 10).map((m, idx) => (
                        <div key={idx} className="text-sm text-slate-300 bg-slate-900/50 rounded p-2">
                          {m.mission}
                          {m.locations && m.locations.length > 0 && (
                            <span className="text-slate-500 ml-2">({m.locations.join(', ')})</span>
                          )}
                        </div>
                      ))}
                      {selectedBlueprint.rewardMissions.length > 10 && (
                        <p className="text-slate-500 text-sm">...and {selectedBlueprint.rewardMissions.length - 10} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
