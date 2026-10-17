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

  const quantum = firstOfType(root, 'SCItemQuantumDriveParams')
  if (quantum) {
    setStat(stats, 'Quantum_Speed', quantum.params?.driveSpeed)
    setStat(stats, 'Quantum_Fuelrequirement', quantum.quantumFuelRequirement)
  }

  let fireRate = 0
  let pellets = 1
  let heat = 0
  let spread = 0
  walk(root, (node) => {
    const type = String(node._Type_ || '')
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

  const shieldResistance = firstOfType(root, 'SCItemShieldGeneratorParams')?.ShieldResistance
  if (Array.isArray(shieldResistance)) {
    const physical = shieldResistance[0]?.Max
    const energy = shieldResistance[1]?.Max
    if (typeof physical === 'number') stats.Shield_PhysicalReduction = physical * 100
    if (typeof energy === 'number') stats.Shield_EnergyReduction = energy * 100
  }

  walk(root, (node) => {
    if (node._Type_ === 'ItemResourceDeltaConsumption' && node.consumption?.resource === 'Power') {
      const amount = node.consumption.resourceAmountPerSecond
      if (amount?._Type_ === 'SStandardResourceUnit') setStat(stats, 'Weapon_Power', amount.standardResourceUnits)
    }
    if (node._Type_ === 'ItemResourceSignatureParams') {
      setStat(stats, 'Weapon_Em', node.EMSignature?.nominalSignature)
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

  return stats
}

/** Burst damage per second from one weapon's extracted stats. */
export function weaponBurstDps(stats) {
  if (!stats) return 0
  const damage = stats.Weapon_Damage || 0
  const rate = stats.Weapon_Firerate || 0
  const pellets = stats.Weapon_Pellets || 1
  if (damage <= 0 || rate <= 0) return 0
  return (damage * pellets * rate) / 60
}
