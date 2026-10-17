/**
 * Extra stats for ship components, ship weapons, and missiles.
 * Keys are internal. Screens use getPropertyLabel, never the raw key.
 */

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  const values = Array.isArray(node) ? node : Object.values(node)
  for (const value of values) walk(value, visit)
}

function firstOfType(root, type) {
  let found = null
  walk(root, (node) => {
    if (!found && node._Type_ === type) found = node
  })
  return found
}

function setStat(stats, key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return
  stats[key] = value
}

function firstNumber(root, key) {
  let found = 0
  walk(root, (node) => {
    if (!found && typeof node?.[key] === 'number' && node[key] > 0) found = node[key]
  })
  return found
}

function ammoNumber(ammoJson, key) {
  let found = 0
  walk(ammoJson, (node) => {
    if (typeof node?.[key] === 'number') found = Math.max(found, node[key])
  })
  return found
}

function ammoJsonSpeed(ammoJson) {
  return ammoNumber(ammoJson, 'speed')
}

function ammoJsonLifetime(ammoJson) {
  return ammoNumber(ammoJson, 'lifetime')
}

function ammoDamage(ammoJson) {
  let found = null
  walk(ammoJson, (node) => {
    if (found) return
    const physical = node.DamagePhysical || 0
    const energy = node.DamageEnergy || 0
    const distortion = node.DamageDistortion || 0
    if (physical > 0 || energy > 0 || distortion > 0) {
      found = { physical, energy, distortion }
    }
  })
  return found || { physical: 0, energy: 0, distortion: 0 }
}

/**
 * @param {object} json entity record
 * @param {{ readRef?: (ref: string) => object | null }} [options]
 */
export function extractShipItemStats(json, options = {}) {
  const stats = {}
  const root = json?._RecordValue_ ?? json
  if (!root) return stats

  const shield = firstOfType(root, 'SCItemShieldGeneratorParams')
  if (shield) {
    setStat(stats, 'Shield_Maxhealth', shield.MaxShieldHealth)
    setStat(stats, 'Shield_Regen', shield.MaxShieldRegen)
    setStat(stats, 'Shield_DamagedRegenDelay', shield.DamagedRegenDelay)
    setStat(stats, 'Shield_DownedRegenDelay', shield.DownedRegenDelay)
  }

  const distortion = firstOfType(root, 'SDistortionParams')
  if (shield && distortion) setStat(stats, 'Shield_DistortionHealth', distortion.Maximum)

  const signatureParams = firstOfType(root, 'SSCSignatureSystemBaseSignatureParams')
  const signatureValues = signatureParams?.signatures
  if (Array.isArray(signatureValues)) {
    const signatureKeys = ['Signature_CrossSection', 'Signature_Infrared', 'Signature_Electromagnetic']
    signatureKeys.forEach((key, index) => setStat(stats, key, signatureValues[index]))
  }

  const powerRange = firstOfType(root, 'PowerRangeParams')
  if (powerRange?.high?.registerRange) setStat(stats, 'Component_PowerSegments', powerRange.high.start)
  for (const [band, prefix] of [['low', 'Low'], ['medium', 'Med'], ['high', 'High']]) {
    const row = powerRange?.[band]
    if (!row?.registerRange || typeof row.start !== 'number' || typeof row.modifier !== 'number') continue
    stats[`Power_${prefix}Start`] = row.start
    stats[`Power_${prefix}Mod`] = row.modifier
  }

  const quantum = firstOfType(root, 'SCItemQuantumDriveParams')
  if (quantum) {
    setStat(stats, 'Quantum_Speed', quantum.params?.driveSpeed)
    setStat(stats, 'Quantum_Fuelrequirement', quantum.quantumFuelRequirement)
  }

  const radar = firstOfType(root, 'SCItemRadarComponentParams')
  const aim = radar?.aimAssist
  if (aim) {
    setStat(stats, 'Radar_DistanceMin', aim.distanceMinAssignment)
    setStat(stats, 'Radar_DistanceMax', aim.distanceMaxAssignment)
  }

  const regen = firstOfType(root, 'SWeaponRegenConsumerParams')
  if (regen) {
    setStat(stats, 'Weapon_CapacitorShots', regen.maxAmmoLoad)
    setStat(stats, 'Weapon_RegenPerSec', regen.maxRegenPerSec)
  }

  let fireRate = 0
  let pellets = 1
  let heat = 0
  let spread = 0
  let chargeTime = 0
  let cooldownTime = 0
  let sequenceDelay = 0
  walk(root, (node) => {
    const type = String(node._Type_ || '')
    if (type === 'SWeaponActionFireChargedParams') {
      if (typeof node.chargeTime === 'number' && node.chargeTime > chargeTime) chargeTime = node.chargeTime
      if (typeof node.cooldownTime === 'number' && node.cooldownTime > cooldownTime) cooldownTime = node.cooldownTime
    }
    if (type === 'SWeaponSequenceEntryParams' && node.unit === 'Seconds' && typeof node.delay === 'number' && node.delay > sequenceDelay) {
      sequenceDelay = node.delay
    }
    if (!type.startsWith('SWeaponActionFire')) return
    if (typeof node.fireRate === 'number' && node.fireRate > fireRate) {
      fireRate = node.fireRate
      heat = typeof node.heatPerShot === 'number' ? node.heatPerShot : heat
      const pelletCount = node.launchParams?.pelletCount
      if (typeof pelletCount === 'number' && pelletCount > 0) pellets = pelletCount
      const spreadMin = node.launchParams?.spreadParams?.min
      if (typeof spreadMin === 'number') spread = spreadMin
    }
  })
  setStat(stats, 'Weapon_Firerate', fireRate)
  setStat(stats, 'Weapon_HeatPerShot', heat)
  setStat(stats, 'Weapon_Spread', spread)
  setStat(stats, 'Weapon_ChargeTime', chargeTime)
  setStat(stats, 'Weapon_CooldownTime', cooldownTime)
  setStat(stats, 'Weapon_SequenceDelay', sequenceDelay)
  if (pellets > 1) setStat(stats, 'Weapon_Pellets', pellets)

  const heatParams = firstOfType(root, 'SWeaponSimplifiedHeatParams')
  if (heatParams) {
    setStat(stats, 'Weapon_Overheat', heatParams.overheatTemperature)
    setStat(stats, 'Weapon_Cooling', heatParams.coolingPerSecond)
    setStat(stats, 'Weapon_OverheatFix', heatParams.overheatFixTime)
  }

  const ammo = firstOfType(root, 'SAmmoContainerComponentParams')
  if (ammo) {
    setStat(stats, 'Weapon_Ammo', ammo.maxAmmoCount)
    if (ammo.ammoParamsRecord && options.readRef) {
      const ammoJson = options.readRef(ammo.ammoParamsRecord)
      const damage = ammoDamage(ammoJson)
      setStat(stats, 'Weapon_Damage_Physical', damage.physical)
      setStat(stats, 'Weapon_Damage_Energy', damage.energy)
      setStat(stats, 'Weapon_Damage_Distortion', damage.distortion)
      const total = damage.physical + damage.energy + damage.distortion
      setStat(stats, 'Weapon_Damage', total)
      const ammoRoot = ammoJson?._RecordValue_
      const speed = ammoRoot?.speed || ammoJsonSpeed(ammoJson)
      const lifetime = ammoRoot?.lifetime || ammoJsonLifetime(ammoJson)
      if (speed) setStat(stats, 'Weapon_Speed', speed)
      if (speed && lifetime) setStat(stats, 'Weapon_Range', Math.round(speed * lifetime))
      const penetration = firstNumber(ammoJson, 'basePenetrationDistance')
      if (penetration) setStat(stats, 'Weapon_Penetration', penetration)
    }
  }

  if (!stats.Weapon_Damage) {
    const direct = ammoDamage(root)
    setStat(stats, 'Weapon_Damage_Physical', direct.physical)
    setStat(stats, 'Weapon_Damage_Energy', direct.energy)
    setStat(stats, 'Weapon_Damage_Distortion', direct.distortion)
    setStat(stats, 'Weapon_Damage', direct.physical + direct.energy + direct.distortion)
  }

  const health = firstOfType(root, 'SHealthComponentParams')
  if (health && health.Health > 1) setStat(stats, 'Health_Maxhealth', health.Health)

  const armor = firstOfType(root, 'SCItemVehicleArmorParams')
  if (armor && health?.Health > 1) setStat(stats, 'Armor_Health', health.Health)
  if (armor?.damageMultiplier) {
    const physical = armor.damageMultiplier.DamagePhysical
    const energy = armor.damageMultiplier.DamageEnergy
    if (typeof physical === 'number') stats.Armor_PhysicalReduction = (1 - physical) * 100
    if (typeof energy === 'number') stats.Armor_EnergyReduction = (1 - energy) * 100
  }
  if (armor) {
    const signalPercent = (multiplier) => (
      typeof multiplier === 'number' ? Math.round((multiplier - 1) * 1000) / 10 : null
    )
    const infrared = signalPercent(armor.signalInfrared)
    const electromagnetic = signalPercent(armor.signalElectromagnetic)
    const crossSection = signalPercent(armor.signalCrossSection)
    if (infrared != null) stats.Armor_SignalIr = infrared
    if (electromagnetic != null) stats.Armor_SignalEm = electromagnetic
    if (crossSection != null) stats.Armor_SignalCs = crossSection
    const deflection = armor.armorDeflection?.deflectionValue
    if (typeof deflection?.DamagePhysical === 'number') stats.Armor_DeflectionPhysical = deflection.DamagePhysical
    if (typeof deflection?.DamageEnergy === 'number') stats.Armor_DeflectionEnergy = deflection.DamageEnergy
  }

  const shieldResistance = firstOfType(root, 'SCItemShieldGeneratorParams')?.ShieldResistance
  if (Array.isArray(shieldResistance)) {
    const physical = shieldResistance[0]?.Max
    const energy = shieldResistance[1]?.Max
    if (typeof physical === 'number') stats.Shield_PhysicalReduction = physical * 100
    if (typeof energy === 'number') stats.Shield_EnergyReduction = energy * 100
  }

  let powerSegments = 0
  walk(root, (node) => {
    const drawsPower = node._Type_ === 'ItemResourceDeltaConsumption' || node._Type_ === 'ItemResourceDeltaConversion'
    if (drawsPower && node.consumption?.resource === 'Power') {
      const amount = node.consumption.resourceAmountPerSecond
      if (amount?._Type_ === 'SStandardResourceUnit') setStat(stats, 'Weapon_Power', amount.standardResourceUnits)
      if (amount?._Type_ === 'SPowerSegmentResourceUnit' && amount.units > powerSegments) {
        powerSegments = amount.units
      }
    }
    if (node._Type_ === 'ItemResourceSignatureParams') {
      setStat(stats, 'Weapon_Em', node.EMSignature?.nominalSignature)
      setStat(stats, 'Signature_Em', node.EMSignature?.nominalSignature)
      setStat(stats, 'Signature_Ir', node.IRSignature?.nominalSignature)
    }
    if (node._Type_ === 'ItemResourceDeltaConsumption' || node._Type_ === 'ItemResourceDeltaConversion') {
      const units = node.consumption?.resource === 'Power' && node.consumption.resourceAmountPerSecond?._Type_ === 'SPowerSegmentResourceUnit'
        ? node.consumption.resourceAmountPerSecond.units
        : 0
      const fraction = node.minimumConsumptionFraction
      if (units > 0 && typeof fraction === 'number' && fraction > 0) {
        const minimum = Math.max(1, Math.round(units * fraction))
        if (!stats.Power_Min || minimum < stats.Power_Min) stats.Power_Min = minimum
      }
    }
    if (node._Type_ !== 'ItemResourceDeltaGeneration' && node._Type_ !== 'ItemResourceDeltaConversion') return
    const gen = node.generation
    const amount = gen?.resourceAmountPerSecond
    if (gen?.resource === 'Power' && amount?._Type_ === 'SPowerSegmentResourceUnit') {
      setStat(stats, 'Itemresource_Powergeneration', amount.units)
    }
    if (gen?.resource === 'Coolant' && amount?._Type_ === 'SStandardResourceUnit') {
      setStat(stats, 'Itemresource_Coolantgeneration', amount.standardResourceUnits)
    }
  })
  if (powerSegments > 0) stats.Power_Segments = powerSegments

  walk(root, (node) => {
    if (node._Type_ === 'EntityTemperature') {
      const signature = node.signatureParams
      if (!signature?.enable) return
      stats.Temp_Enabled = 1
      setStat(stats, 'Temp_IrPerDegree', signature.temperatureToIR)
      setStat(stats, 'Temp_IrMinimum', signature.minimumTemperatureForIR)
      const thermal = node.itemResourceParams
      setStat(stats, 'Temp_MinCooling', thermal?.minCoolingTemperature)
      setStat(stats, 'Temp_Overheat', thermal?.overheatTemperature)
      const heats = Array.isArray(thermal?.stateHeatGenerationValues) ? thermal.stateHeatGenerationValues : []
      const hottest = heats.reduce((max, row) => Math.max(max, row?.baselineTemperatureChange || 0), 0)
      setStat(stats, 'Temp_Heat', hottest)
    }
    if (node._Type_ !== 'ItemResourceState' || !Array.isArray(node.deltas)) return
    const dynamic = node.deltas.some((delta) => delta?.dynamicAmountOverride?._Type_ === 'ItemResourceDynamicAmountCoolant')
    if (!dynamic) return
    stats.Coolant_Dynamic = 1
    let draw = 0
    for (const delta of node.deltas) {
      const amount = delta?.consumption?.resource === 'Power'
        ? delta.consumption.resourceAmountPerSecond
        : delta?.generation?.resource === 'Power'
          ? delta.generation.resourceAmountPerSecond
          : null
      const units = amount?.units || amount?.standardResourceUnits || 0
      if (units > draw) draw = units
    }
    if (draw > (stats.Coolant_PowerDraw || 0)) stats.Coolant_PowerDraw = draw
  })

  return stats
}

/** Burst damage per second. A charge or a seconds-long delay replaces the fire rate when it is the slower wait. */
export function weaponBurstDps(stats) {
  if (!stats) return 0
  const damage = stats.Weapon_Damage || 0
  const rate = stats.Weapon_Firerate || 0
  const pellets = stats.Weapon_Pellets || 1
  if (damage <= 0) return 0
  const rpmInterval = rate > 0 ? 60 / rate : 0
  const charge = (stats.Weapon_ChargeTime || 0) + (stats.Weapon_CooldownTime || 0) + (stats.Weapon_SequenceDelay || 0)
  if (charge <= 0) {
    if (rate <= 0) return 0
    return (damage * pellets * rate) / 60
  }
  const interval = Math.max(rpmInterval, charge)
  if (interval <= 0) return 0
  return (damage * pellets) / interval
}
