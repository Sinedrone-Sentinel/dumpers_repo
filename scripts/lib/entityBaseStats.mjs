/**
 * Extract crafted-item base stats from entity SCItem JSON for blueprint modifier simulation.
 * Maps entity component fields → gameplay property keys used in crafting modifiers.
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, basename, dirname, normalize, sep } from 'path'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function walkJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(p, acc)
    else if (entry.name.endsWith('.json')) acc.push(p)
  }
  return acc
}

/**
 * entityClass basename (lowercase) → absolute file path.
 *
 * Indexes the full entities/ tree (not just entities/scitem/) so records stored
 * directly under entities/ — e.g. craftable fuel nozzles at
 * entities/fuel_nozzle_misc_nozzlestandard.json — are resolvable for name/base-stat
 * lookups. scitem/ records win on basename collisions (authoritative SCItem defs).
 */
export function buildEntityClassPathIndex(extractedDataRoot) {
  const entitiesDir = join(extractedDataRoot, 'libs/foundry/records/entities')
  const scitemDir = join(entitiesDir, 'scitem')
  const index = new Map()
  // Non-scitem entity records first, then overlay scitem so scitem takes priority.
  for (const file of walkJsonFiles(entitiesDir)) {
    if (file.toLowerCase().includes(`${sep}scitem${sep}`)) continue
    index.set(basename(file, '.json').toLowerCase(), file)
  }
  for (const file of walkJsonFiles(scitemDir)) {
    index.set(basename(file, '.json').toLowerCase(), file)
  }
  return index
}

/** All record JSON basenames under libs/foundry/records (for ammo params resolution). */
export function buildRecordBasenameIndex(extractedDataRoot) {
  const recordsDir = join(extractedDataRoot, 'libs/foundry/records')
  const index = new Map()
  for (const file of walkJsonFiles(recordsDir)) {
    index.set(basename(file, '.json').toLowerCase(), file)
  }
  return index
}

function resolveRecordRef(ref, fromFile, recordIndex, extractedDataRoot) {
  if (!ref || typeof ref !== 'string') return null

  if (ref.startsWith('file://')) {
    const rel = ref
      .replace(/^file:\/\/\.?\/?/i, '')
      .split(/[/\\]/)
      .filter(Boolean)

    while (rel[0] === '..') rel.shift()

    let candidate = normalize(join(dirname(fromFile), ...rel))
    if (existsSync(candidate)) return candidate

    const libsIdx = ref.toLowerCase().indexOf('libs/foundry/records/')
    if (libsIdx >= 0) {
      const tail = ref.slice(libsIdx).replace(/^file:\/\/\.?\/?/i, '')
      candidate = normalize(join(extractedDataRoot, tail))
      if (existsSync(candidate)) return candidate
    }
  }

  const key = basename(ref, '.json').toLowerCase()
  return recordIndex.get(key) || null
}

function walkObjectTree(root, visit) {
  const stack = [root]
  const seen = new Set()
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (seen.has(node)) continue
    seen.add(node)
    visit(node)
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) {
        for (const item of val) stack.push(item)
      } else if (val && typeof val === 'object') {
        stack.push(val)
      }
    }
  }
}

function firstDamageFromAmmo(ammoJson) {
  const damage = ammoJson?._RecordValue_?.projectileParams?.damage
  if (!damage) return null
  if (damage.DamageEnergy > 0) return damage.DamageEnergy
  if (damage.DamagePhysical > 0) return damage.DamagePhysical
  if (damage.DamageDistortion > 0) return damage.DamageDistortion
  return null
}

function resolveAmmoParamsRef(entityJson, entityFile, recordIndex, extractedDataRoot) {
  let ammoParamsRef = null
  let magRef = null

  walkObjectTree(entityJson?._RecordValue_, (node) => {
    if (node._Type_ === 'SCItemWeaponComponentParams' && node.ammoContainerRecord) {
      magRef = node.ammoContainerRecord
    }
    if (node.ammoParamsRecord) {
      ammoParamsRef = node.ammoParamsRecord
    }
  })

  if (magRef) {
    const magPath = resolveRecordRef(magRef, entityFile, recordIndex, extractedDataRoot)
    if (magPath) {
      const magJson = readJson(magPath)
      walkObjectTree(magJson?._RecordValue_, (node) => {
        if (node.ammoParamsRecord) {
          ammoParamsRef = node.ammoParamsRecord
        }
      })
    }
  }

  return ammoParamsRef
}

function extractWeaponDamage(entityJson, entityFile, recordIndex, extractedDataRoot) {
  let damage = null

  walkObjectTree(entityJson?._RecordValue_, (node) => {
    if (damage != null) return
    if (node._Type_ === 'DamageInfo') {
      if (node.DamageEnergy > 0) damage = node.DamageEnergy
      else if (node.DamagePhysical > 0) damage = node.DamagePhysical
      else if (node.DamageDistortion > 0) damage = node.DamageDistortion
    }
  })

  if (damage != null) return damage

  const ammoParamsRef = resolveAmmoParamsRef(entityJson, entityFile, recordIndex, extractedDataRoot)
  if (!ammoParamsRef) return null

  const ammoPath = resolveRecordRef(ammoParamsRef, entityFile, recordIndex, extractedDataRoot)
  if (!ammoPath) return null

  return firstDamageFromAmmo(readJson(ammoPath))
}

function maxNumericField(recordValue, fieldName) {
  let max = null
  walkObjectTree(recordValue, (node) => {
    const val = node[fieldName]
    if (typeof val === 'number' && val > 0) {
      max = max == null ? val : Math.max(max, val)
    }
  })
  return max
}

function extractFpsWeaponStats(recordValue, entityJson, entityFile, recordIndex, extractedDataRoot) {
  const stats = {}
  const baseDamage = extractWeaponDamage(entityJson, entityFile, recordIndex, extractedDataRoot)
  const damageMultiplier = maxNumericField(recordValue, 'damageMultiplier') ?? 1

  if (baseDamage != null) {
    stats.Weapon_Damage = Math.round(baseDamage * damageMultiplier * 100) / 100
  }

  const fireRate = maxNumericField(recordValue, 'fireRate')
  if (fireRate != null) {
    stats.Weapon_Firerate = fireRate
  }

  let recoilConfigRef = null
  walkObjectTree(recordValue, (node) => {
    if (node._Type_ === 'SCItemWeaponComponentParams' && node.actorProceduralRecoilConfig) {
      recoilConfigRef = node.actorProceduralRecoilConfig
    }
  })

  if (recoilConfigRef) {
    const configPath = resolveRecordRef(recoilConfigRef, entityFile, recordIndex, extractedDataRoot)
    const configJson = configPath ? readJson(configPath) : null
    const setups = configJson?._RecordValue_?.actorProceduralRecoilSetup
    const modifiersRef =
      Array.isArray(setups) && setups.length > 0
        ? setups[0].actorProceduralRecoilModifiers
        : null

    if (modifiersRef) {
      const modPath = resolveRecordRef(modifiersRef, configPath, recordIndex, extractedDataRoot)
      const modVal = modPath ? readJson(modPath)?._RecordValue_ : null
      const hands = modVal?.actorProceduralHandsRecoilModifiers
      const aim = modVal?.actorProceduralAimRecoilModifiers

      if (aim?.curveRecoil?.recoilSmoothTimeModifier != null) {
        stats.Weapon_Recoil_Smoothness = aim.curveRecoil.recoilSmoothTimeModifier
      } else if (aim?.recoil_time != null) {
        stats.Weapon_Recoil_Smoothness = aim.recoil_time
      }

      if (aim?.decay != null) {
        stats.Weapon_Recoil_Handling = aim.decay
      }

      if (hands?.fireRecoilStrengthFirst != null) {
        stats.Weapon_Recoil_Kick = hands.fireRecoilStrengthFirst
      } else if (hands?.fireRecoilStrength != null) {
        stats.Weapon_Recoil_Kick = hands.fireRecoilStrength
      }
    }
  }

  return stats
}

function extractArmorStats(recordValue, entityFile, recordIndex, extractedDataRoot) {
  const stats = {}
  let clothingParams = null
  let suitArmorParams = null

  walkObjectTree(recordValue, (node) => {
    if (node._Type_ === 'SCItemClothingParams') clothingParams = node
    if (node._Type_ === 'SCItemSuitArmorParams') suitArmorParams = node
  })

  const temperature = clothingParams?.TemperatureResistance
  if (temperature) {
    if (temperature.MinResistance != null) {
      stats.Armor_Temperaturemin = temperature.MinResistance
    }
    if (temperature.MaxResistance != null) {
      stats.Armor_Temperaturemax = temperature.MaxResistance
    }
  }

  const radiation = clothingParams?.RadiationResistance
  if (radiation) {
    if (radiation.RadiationDissipationRate != null) {
      stats.Armor_Radiationdissipation = radiation.RadiationDissipationRate
    }
    if (radiation.MaximumRadiationCapacity != null) {
      stats.Armor_Radiationcapacity = radiation.MaximumRadiationCapacity
    }
  }

  if (suitArmorParams?.damageResistance) {
    const drPath = resolveRecordRef(
      suitArmorParams.damageResistance,
      entityFile,
      recordIndex,
      extractedDataRoot
    )
    const physical =
      drPath != null
        ? readJson(drPath)?._RecordValue_?.damageResistance?.PhysicalResistance?.Multiplier
        : null
    if (physical != null) {
      stats.Armor_Damagemitigation = physical
    }
  }

  return stats
}

function extractItemResourceStats(components) {
  const stats = {}

  for (const comp of components ?? []) {
    if (comp._Type_ !== 'ItemResourceComponentParams') continue

    for (const state of comp.states ?? []) {
      for (const delta of state.deltas ?? []) {
        if (delta._Type_ === 'ItemResourceDeltaGeneration') {
          const gen = delta.generation
          const amount = gen?.resourceAmountPerSecond
          if (gen?.resource === 'Power' && amount?._Type_ === 'SPowerSegmentResourceUnit') {
            stats.Itemresource_Powergeneration = amount.units
          }
        }

        if (delta._Type_ === 'ItemResourceDeltaConversion') {
          const gen = delta.generation
          const amount = gen?.resourceAmountPerSecond
          if (gen?.resource === 'Coolant' && amount?._Type_ === 'SStandardResourceUnit') {
            stats.Itemresource_Coolantgeneration = amount.standardResourceUnits
          }
        }
      }
    }
  }

  return stats
}

function getAttachType(components) {
  const attach = (components ?? []).find((c) => c?._Type_ === 'SAttachableComponentParams')
  return attach?.AttachDef?.Type || ''
}

function entityLooksLikeArmor(components, attachType) {
  if (/^Char_Armor/i.test(attachType)) return true
  return (components ?? []).some(
    (c) =>
      c?._Type_ === 'SCItemSuitArmorParams' ||
      c?._Type_ === 'SCItemClothingParams'
  )
}

function entityLooksLikeFpsWeapon(components, attachType) {
  if ((components ?? []).some((c) => c?._Type_ === 'SCItemWeaponComponentParams')) {
    return /^WeaponPersonal|^WeaponMounted|^FPS/i.test(attachType) || attachType === 'WeaponPersonal'
  }
  return false
}

function entityLooksLikeWeapon(components, entityClass, entityFile, attachType) {
  if (entityLooksLikeFpsWeapon(components, attachType)) return true
  if ((components ?? []).some((c) => c?._Type_ === 'SCItemWeaponComponentParams')) return true
  if (/weapon|mininglaser|tractorbeam|missile|turret|salvage/i.test(attachType)) return true
  const id = `${entityClass || ''} ${entityFile || ''}`.toLowerCase()
  return /[/\\]weapons[/\\]|mining_laser_|tractorbeam|_mag\.json/.test(id)
}

function entityLooksLikeSalvageModule(components, entityClass, entityFile) {
  const attachType = getAttachType(components)
  if (attachType === 'SalvageModifier') return true
  const id = `${entityClass || ''} ${entityFile || ''}`.toLowerCase()
  return id.includes('salvage_modifier') || id.includes('salvagemodifiers')
}

function entityHasTractorBeamParams(root) {
  let found = false
  walkObjectTree(root, (node) => {
    if (node._Type_ === 'SWeaponActionFireTractorBeamParams') found = true
  })
  return found
}

export function resolveEntityFile(entityClass, entityPathIndex) {
  if (!entityClass || !entityPathIndex) return null
  const key = String(entityClass).toLowerCase()
  if (entityPathIndex.has(key)) return entityPathIndex.get(key)

  const candidates = [
    `${key}_scitem`,
    key.replace(/^fuel_nozzle_/, 'nozzle_fuelgiver_'),
    key.replace(/^nozzle_fuelgiver_/, 'fuel_nozzle_'),
  ]
  for (const candidate of candidates) {
    if (entityPathIndex.has(candidate)) return entityPathIndex.get(candidate)
  }
  return null
}

function extractTractorAndSalvageStats(root, { includeSalvage, includeTractor }) {
  const stats = {}

  walkObjectTree(root, (node) => {
    if (includeTractor && node._Type_ === 'SWeaponActionFireTractorBeamParams') {
      if (node.fullStrengthDistance != null) {
        stats.Weapon_Tractor_Fullstrengthdist = node.fullStrengthDistance
      }
      if (node.maxDistance != null) {
        stats.Weapon_Tractor_Maxdist = node.maxDistance
      }
      if (node.maxForce != null) {
        stats.Weapon_Tractor_Force = node.maxForce
      } else if (node.minForce != null) {
        stats.Weapon_Tractor_Force = node.minForce
      }
      if (node.maxVolume != null) {
        stats.Weapon_Tractor_Maxvolume = node.maxVolume
      }
    }

    if (includeSalvage && node._Type_ === 'SSalvageModifier') {
      if (node.extractionEfficiency != null) {
        stats.Weapon_Hullscraping_Efficiency = node.extractionEfficiency
      }
      if (node.radiusMultiplier != null) {
        stats.Weapon_Hullscraping_Radius = node.radiusMultiplier
      }
      if (node.salvageSpeedMultiplier != null) {
        stats.Weapon_Hullscraping_Speed = node.salvageSpeedMultiplier
      }
    }

    if (node._Type_ === 'SCItemMiningLaserParams' || node._Type_ === 'SCItemWeaponMiningLaserParams') {
      if (node.optimalRange != null) stats.Mining_OptimalRange = node.optimalRange
      if (node.maximumRange != null) stats.Mining_MaxRange = node.maximumRange
      if (node.extractionPower != null) stats.Mining_ExtractionPower = node.extractionPower
      if (node.laserPower != null && stats.Weapon_Damage_Override_Laser == null) {
        stats.Weapon_Damage_Override_Laser = node.laserPower
      }
    }
  })

  return stats
}

/**
 * Map gameplay property keys used by crafting modifiers to entity base values.
 * @returns {Record<string, number> | null}
 */
export function extractEntityBaseStats(
  entityClass,
  entityPathIndex,
  extractedDataRoot,
  recordIndex
) {
  if (!entityClass || !entityPathIndex) return null

  const file = resolveEntityFile(entityClass, entityPathIndex)
  if (!file) return null

  const json = readJson(file)
  const recordValue = json?._RecordValue_
  const components = recordValue?.Components
  if (!Array.isArray(components)) return null

  const attachType = getAttachType(components)
  const isArmor = entityLooksLikeArmor(components, attachType)
  const isFpsWeapon = entityLooksLikeFpsWeapon(components, attachType)
  const isWeapon = entityLooksLikeWeapon(components, entityClass, file, attachType)
  const isSalvageModule = entityLooksLikeSalvageModule(components, entityClass, file)
  const isTractor = entityHasTractorBeamParams(recordValue)

  const stats = {}

  if (isArmor) {
    Object.assign(stats, extractArmorStats(recordValue, file, recordIndex, extractedDataRoot))
  }

  for (const comp of components) {
    if (!comp) continue

    if (comp._Type_ === 'SHealthComponentParams' && comp.Health != null) {
      stats.Health_Maxhealth = comp.Health
    }

    if (comp._Type_ === 'SCItemQuantumDriveParams') {
      if (comp.params?.driveSpeed != null) {
        stats.Quantum_Speed = comp.params.driveSpeed
      }
      if (comp.quantumFuelRequirement != null) {
        stats.Quantum_Fuelrequirement = comp.quantumFuelRequirement
      }
    }

    if (comp._Type_ === 'SCItemShieldGeneratorParams' && comp.MaxShieldHealth != null) {
      stats.Shield_Maxhealth = comp.MaxShieldHealth
    }

    if (comp._Type_ === 'SCItemRadarComponentParams' && comp.aimAssist) {
      if (comp.aimAssist.distanceMinAssignment != null) {
        stats.Radar_Minaimassistdistance = comp.aimAssist.distanceMinAssignment
      }
      if (comp.aimAssist.distanceMaxAssignment != null) {
        stats.Radar_Maxaimassistdistance = comp.aimAssist.distanceMaxAssignment
      }
    }

    if (comp._Type_ === 'WeaponComponentParams') {
      if (comp.damage?.damagePhysical != null && stats.Weapon_Damage == null) {
        stats.Weapon_Damage = comp.damage.damagePhysical
      }
      if (comp.damage?.damageEnergy != null && stats.Weapon_Damage == null) {
        stats.Weapon_Damage = comp.damage.damageEnergy
      }
    }

    if (comp._Type_ === 'SShieldComponentParams' && comp.MaxCapacity != null && stats.Shield_Maxhealth == null) {
      stats.Shield_Maxhealth = comp.MaxCapacity
    }
  }

  Object.assign(stats, extractItemResourceStats(components))
  Object.assign(
    stats,
    extractTractorAndSalvageStats(recordValue, {
      includeSalvage: isSalvageModule,
      includeTractor: isTractor,
    })
  )

  if (isFpsWeapon) {
    Object.assign(
      stats,
      extractFpsWeaponStats(recordValue, json, file, recordIndex, extractedDataRoot)
    )
  } else if (isWeapon) {
    const weaponDamage = extractWeaponDamage(json, file, recordIndex, extractedDataRoot)
    if (weaponDamage != null && stats.Weapon_Damage == null) {
      stats.Weapon_Damage = weaponDamage
    }
  }

  return Object.keys(stats).length > 0 ? stats : null
}
