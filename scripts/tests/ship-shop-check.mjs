import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { weaponBurstDps } from '../lib/shipItemStats.mjs'
import { applyShipPartRules } from '../lib/shipPartRules.mjs'
import { matchShopRow } from '../lib/uexShopJoin.mjs'

const ruled = applyShipPartRules(
  [
    { id: 'aegs_idris_m', manufacturerCode: 'AEGS' },
    { id: 'aegs_gladius', manufacturerCode: 'AEGS' },
    { id: 'rsi_mantis', manufacturerCode: 'RSI' },
  ],
  [
    { entityClass: 'aegs_idris_lower_camera_mount', displayName: 'Aegs Idris Lower Camera Mount', requiredTags: '' },
    { entityClass: 'mount_gimbal_s4', displayName: 'VariPuck S4 Gimbal Mount', requiredTags: '' },
    { entityClass: 'behr_ballisticgatling_hornet_bespoke', displayName: 'TMSB-5 Gatling', requiredTags: 'ANVL_BallisticGatling_Bespoke' },
    { entityClass: 'gats_ballisticgatling_s3', displayName: 'Mantis GT-220 Gatling', tags: 'weaponMountUsable', requiredTags: '' },
  ],
)
assert.equal(ruled[0].exclusiveHull, 'idris')
assert.equal(ruled[1].exclusiveHull, undefined)
assert.equal(ruled[2].exclusiveHull, undefined)
assert.equal(ruled[3].exclusiveHull, undefined)

const ships = JSON.parse(readFileSync('src/data/game-ships.json', 'utf8')).ships
const items = JSON.parse(readFileSync('src/data/game-ship-item-stats.json', 'utf8')).items
const stalker = ships.find((ship) => ship.id === 'aegs_avenger_stalker')
assert.ok(stalker, 'Avenger Stalker is a flyable ship')
assert.equal(stalker.pitch, 53)
assert.equal(stalker.yaw, 48)
assert.equal(stalker.roll, 190)
assert.ok(stalker.hullHp > 1, 'Avenger Stalker hull HP comes from the vehicle structure')

const noseMount = stalker.ports.find((port) => port.id === 'hardpoint_weapon_class2_nose')
assert.equal(noseMount.kind, 'weaponMount')
assert.equal(noseMount.defaultEntityClass, 'mount_gimbal_s4')
const nose = stalker.ports.find((port) => port.id === 'hardpoint_weapon_class2_nose/hardpoint_class_2')
assert.equal(nose.defaultEntityClass, 'apar_ballisticgatling_s4')
assert.equal(nose.size, 4)

const gatling = items.find((item) => item.entityClass === 'apar_ballisticgatling_s4')
assert.equal(gatling.displayName, 'Revenant Gatling')
assert.equal(gatling.burstDps, 1266)
assert.equal(Math.round(weaponBurstDps(gatling.stats)), 1266)
assert.equal(gatling.stats.Weapon_Range, 2799)

const armor = items.find((item) => item.entityClass === 'armr_aegs_avenger_stalker')
assert.equal(armor.stats.Armor_Health, 1232)

const flight = items.find((item) => item.entityClass === 'controller_flight_aegs_avenger_stalker')
assert.equal(flight.stats.Flight_Pitch, 53)
assert.equal(flight.stats.Flight_Yaw, 48)
assert.equal(flight.stats.Flight_Roll, 190)

const arrowStock = items.find((item) => item.entityClass === 'controller_flight_anvl_arrow')
const arrowHandling = items.find((item) => item.entityClass === 'controller_flight_anvl_arrow_flight_blade_hnd')
const arrowSpeed = items.find((item) => item.entityClass === 'controller_flight_anvl_arrow_flight_blade_spd')
assert.equal(arrowStock.stats.Flight_ScmSpeed, 229)
assert.equal(arrowStock.stats.Flight_MaxSpeed, 1215)
assert.equal(arrowStock.stats.Flight_Pitch, 75)
assert.equal(arrowHandling.stats.Flight_ScmSpeed, 221)
assert.equal(arrowHandling.stats.Flight_MaxSpeed, 1190)
assert.equal(arrowHandling.stats.Flight_Pitch, 76)
assert.equal(arrowHandling.stats.Flight_BoostSpeed, 505)
assert.equal(arrowHandling.stats.Flight_BoostBackward, 255)
assert.equal(arrowHandling.stats.Flight_Yaw, 58)
assert.equal(arrowHandling.stats.Flight_Roll, 207)
assert.equal(arrowSpeed.stats.Flight_ScmSpeed, 237)
assert.equal(arrowSpeed.stats.Flight_BoostSpeed, 525)
assert.equal(arrowSpeed.stats.Flight_BoostBackward, 275)
assert.equal(arrowSpeed.stats.Flight_Yaw, 56)
assert.equal(arrowSpeed.stats.Flight_Roll, 203)
assert.equal(arrowSpeed.stats.Flight_MaxSpeed, 1240)
assert.equal(arrowSpeed.stats.Flight_Pitch, 74)
assert.equal(arrowSpeed.stats.Flight_Yaw, 56)

const shimmer = items.find((item) => item.entityClass === 'shld_asas_s01_shimmer_scitem')
assert.equal(shimmer.stats.Shield_Maxhealth, 2244)
assert.equal(shimmer.stats.Shield_Regen, 426)

const cannon = items.find((item) => item.entityClass === 'amrs_lasercannon_s3')
assert.equal(cannon.stats.Weapon_Firerate, 150)
assert.equal(Math.round(weaponBurstDps(cannon.stats)), 547)
assert.equal(items.some((item) => /placeholder/i.test(item.displayName)), false)

const ravenArmor = items.find((item) => item.entityClass === 'armr_aegs_sabreraven_ex')
assert.equal(Math.round(ravenArmor.stats.Armor_PhysicalReduction), 25)
assert.equal(Math.round(ravenArmor.stats.Armor_EnergyReduction), 40)
assert.equal(Math.round(ravenArmor.stats.Armor_SignalEm), -28)

const hornetArmor = items.find((item) => item.entityClass === 'armr_anvl_hornet_f7a')
assert.equal(hornetArmor.stats.Armor_Health, 6600)
assert.equal(Math.round(hornetArmor.stats.Armor_SignalEm), 13)
assert.equal(Math.round(hornetArmor.stats.Armor_SignalIr), 13)
assert.equal(Math.round(hornetArmor.stats.Armor_SignalCs), 13)
assert.equal(hornetArmor.stats.Armor_DeflectionPhysical, 24)
assert.equal(hornetArmor.stats.Armor_DeflectionEnergy, 13)

const allstop = items.find((item) => item.entityClass === 'shld_godi_s01_allstop_scitem')
assert.equal(allstop.stats.Power_Segments, 3)
assert.equal(allstop.stats.Power_LowMod, 0.7)
assert.equal(allstop.stats.Power_MedMod, 0.85)
assert.equal(allstop.stats.Power_HighMod, 1)

const regulus = items.find((item) => item.entityClass === 'powr_aegs_s01_regulus_scitem')
assert.equal(regulus.stats.Itemresource_Powergeneration, 16)

const raven = ships.find((ship) => ship.id === 'aegs_sabre_raven_ex')
assert.equal(raven.hullHp, 13116)
assert.equal(raven.noise, 5)
assert.equal(raven.decoy, 48)
assert.equal(raven.weaponPowerPool, 4)
assert.equal(raven.ports.some((port) => port.id === 'hardpoint_weapon_rack'), false)
assert.equal(ships.some((ship) => ship.ports.some((port) => port.size <= 0 && !port.defaultEntityClass)), false)
assert.equal(raven.ports.some((port) => port.kind === 'armor'), true)
const ravenFlight = items.find((item) => item.entityClass === 'controller_flight_aegs_sabre_raven_ex')
assert.equal(ravenFlight.stats.Power_Segments, 4)
assert.equal(ravenFlight.tags, 'AEGS_Sabre_Raven_Blade')

const dualRack = items.find((item) => item.entityClass === 'mrck_s04_behr_dual_s03')
assert.equal(dualRack.mounts.length, 2)
assert.equal(dualRack.mounts[0].name, 'missile_01_attach')
assert.equal(dualRack.mounts[0].maxSize, 3)

const powerarray = items.find((item) => item.entityClass === 'espr_ballisticcannon_powerarray_s1')
assert.deepEqual(powerarray.stats, {})

const ignite = items.find((item) => item.entityClass === 'misl_s02_ir_fski_ignite')
assert.ok(ignite.stats.Missile_Damage > 0, 'Ignite has missile damage')
assert.equal(ignite.guidance, 'IR')
assert.equal(ignite.ordnance, 'missile')

const slipstream = items.find((item) => item.entityClass === 'powr_tydt_s01_slipstream_scitem')
assert.equal(slipstream.itemClass, 'Stealth')
assert.equal(slipstream.grade, 'A')

const ecouter = items.find((item) => item.entityClass === 'radr_grnp_s01_ecouter')
assert.equal(ecouter.stats.Radar_DistanceMin, 845)
assert.equal(ecouter.stats.Radar_DistanceMax, 1105)

const railen = items.find((item) => item.entityClass === 'mrck_s04_gama_railen_octo_s01')
assert.match(railen.requiredTags || '', /gama_railen/)

const ravenRack = raven.ports.find((port) => port.id === 'hardpoint_weapon_missilerack_left')
assert.equal(ravenRack.minSize, 3)
assert.equal(ravenRack.maxSize, 4)
assert.equal(raven.crossSection, 5528)
const ravenLife = raven.ports.find((port) => port.kind === 'life')
assert.equal(ravenLife.locked, true)
assert.equal(ravenLife.defaultEntityClass, 'lfsp_tydt_s01_comfortair')

const polaris = ships.find((ship) => ship.id === 'rsi_polaris')
const polarisTorpedo = polaris.ports.find((port) => port.kind === 'torpedo')
assert.equal(polarisTorpedo.locked, true)
assert.equal(polarisTorpedo.minSize, 10)
assert.equal(polarisTorpedo.maxSize, 10)
assert.equal(polaris.ports.find((port) => port.id === 'hardpoint_turret_remote_bottom')?.kind, 'turret')
assert.equal(polaris.ports.some((port) => port.kind === 'weapon' && port.id.startsWith('hardpoint_turret_remote_bottom/')), true)
assert.equal(polaris.ports.some((port) => port.kind === 'tractor'), true)

const bracer = items.find((item) => item.entityClass === 'cool_aegs_s01_bracer_scitem')
assert.equal(bracer.stats.Itemresource_Coolantgeneration, 34)
assert.equal(bracer.stats.Temp_Enabled, undefined)
assert.equal(allstop.stats.Coolant_Dynamic, 1)
assert.equal(allstop.stats.Coolant_PowerDraw, 3)
assert.equal(allstop.stats.Temp_Enabled, 1)
const massDriver = items.find((item) => item.entityClass === 'klwe_massdriver_s1')
assert.equal(massDriver.stats.Weapon_ChargeTime, 1)

const ravenQed = raven.ports.find((port) => port.kind === 'qed')
assert.equal(ravenQed.defaultEntityClass, 'qdmp_wetk_s02_raven_x')
assert.equal(items.find((item) => item.entityClass === 'qdmp_wetk_s02_raven_x').stats.Power_Segments, 3)
assert.equal(raven.ports.find((port) => port.id === 'hardpoint_weapon_left_wing')?.locked, true)
assert.notEqual(raven.ports.find((port) => port.id === 'hardpoint_weapon_left_wing/hardpoint_class_2')?.locked, true)
assert.notEqual(raven.ports.find((port) => port.id === 'hardpoint_weapon_left_nose/hardpoint_class_2')?.locked, true)

const andromeda = ships.find((ship) => ship.id === 'rsi_constellation_andromeda')
assert.equal(andromeda.ports.some((port) => port.kind === 'weaponMount'), true)
assert.equal(andromeda.ports.some((port) => port.kind === 'weapon' && port.id.includes('/')), true)

const wildfire = ships.find((ship) => ship.id === 'anvl_hornet_f7c_wildfire')
const wildfireGun = wildfire.ports.find((port) => port.id === 'hardpoint_class_4_center/hardpoint_size_4')
assert.equal(wildfireGun.kind, 'weapon')
assert.equal(wildfireGun.locked, true)
assert.equal(wildfireGun.defaultEntityClass, 'apar_ballisticgatling_s4')
assert.equal(wildfireGun.size, 4)

const ball = items.find((item) => item.entityClass === 'anvl_hornet_f7cm_mk2_ball_turret')
assert.deepEqual(
  ball.mounts.map((mount) => mount.name),
  ['hardpoint_weapon_left', 'hardpoint_weapon_right', 'hardpoint_missile_rack'],
)
assert.equal(ball.mounts[0].maxSize, 3)
assert.equal(ball.mounts[2].kind, 'missile')

const gimbal = items.find((item) => item.entityClass === 'mount_gimbal_s4')
assert.equal(gimbal.mounts.length, 1)
assert.equal(gimbal.mounts[0].maxSize, 4)

const retaliator = ships.find((ship) => ship.id === 'aegs_retaliator')
assert.equal(retaliator.ports.filter((port) => port.kind === 'shield').length, 6)
const caterpillar = ships.find((ship) => ship.id === 'drak_caterpillar')
assert.equal(caterpillar.ports.find((port) => port.id === 'hardpoint_radar_turret_bottom')?.kind, 'radar')
const talon = ships.find((ship) => ship.id === 'espr_talon')
assert.equal(talon.ports.some((port) => port.kind === 'shield'), true)
const cutterScout = ships.find((ship) => ship.id === 'drak_cutter_scout')
assert.equal(cutterScout.ports.some((port) => port.kind === 'shield'), true)
assert.equal(cutterScout.ports.some((port) => port.kind === 'radar'), true)
assert.equal(cutterScout.ports.some((port) => port.kind === 'quantum'), true)
const mpuv = ships.find((ship) => ship.id === 'argo_mpuv')
assert.equal(mpuv.ports.some((port) => port.kind === 'radar'), true)
const glaive = ships.find((ship) => ship.id === 'vncl_glaive')
assert.equal(glaive.ports.some((port) => port.kind === 'weapon'), true)
assert.equal(ships.some((ship) => ship.id.startsWith('eaobjective') || ship.id.includes('derelict')), false)

const idris = ships.find((ship) => ship.id === 'aegs_idris_m')
const idrisNose = idris.ports.find((port) => port.id === 'hardpoint_nose_railgun')
assert.ok(idrisNose.accepts.some((rule) => rule.type === 'WeaponGun' && rule.subtypes.includes('Gun')))
assert.ok(idrisNose.accepts.some((rule) => rule.type === 'MissileLauncher' && rule.subtypes.includes('MissileRack')))
const hammer = items.find((item) => item.entityClass === 'mrck_s10_aegs_idris_nose_s12_torpedo')
assert.equal(hammer.attachType, 'MissileLauncher')
assert.equal(hammer.mounts.length, 20)
assert.equal(hammer.mounts[0].kind, 'torpedo')
assert.equal(hammer.mounts[0].maxSize, 12)
assert.equal(items.find((item) => item.entityClass === 'bomb_s03_fski_thunderball').ordnance, 'bomb')
assert.equal(items.find((item) => item.entityClass === 'misl_s12_cs_behr_executor').ordnance, 'torpedo')
assert.equal(items.find((item) => item.entityClass === 'misl_s02_ir_fski_ignite').ordnance, 'missile')
const tmsb = items.find((item) => item.entityClass === 'anvl_hornet_f7cm_mk2_ball_turret_bespoke')
assert.equal(tmsb.mounts[0].portTags, 'ANVL_BallisticGatling_Bespoke')
assert.equal(tmsb.mounts[0].defaultEntityClass, 'mount_gimbal_behr_ballisticgatling_hornet_bespoke')
assert.equal(tmsb.mounts[0].child.defaultEntityClass, 'behr_ballisticgatling_hornet_bespoke')

const outfile = path.join('node_modules', '.cache', 'ship-shop-fit.mjs')
await esbuild.build({
  entryPoints: [path.join('src', 'lib', 'shipShopData.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  packages: 'external',
})
const shop = await import(`${pathToFileURL(path.resolve(outfile)).href}?t=${Date.now()}`)

const idrisShip = shop.getShip('aegs_idris_m')
const noseParts = shop.partsForPort(idrisNose, idrisShip).map((item) => item.entityClass)
assert.ok(noseParts.includes('klwe_massdriver_s10'), 'Idris nose lists the railgun')
assert.ok(noseParts.includes('hrst_laserbeam_bespoke'), 'Idris nose lists the laser')
assert.ok(noseParts.includes('mrck_s10_aegs_idris_nose_s12_torpedo'), 'Idris nose lists the torpedo launcher')
const tubes = shop.missileSlotsForRack(idris, idrisNose, { entityClass: hammer.entityClass, source: 'stock' })
assert.equal(tubes[0].kind, 'torpedo')
assert.equal(tubes[0].size, 12)
const torpedoes = shop.partsForPort(tubes[0])
assert.ok(torpedoes.length > 0)
assert.ok(torpedoes.every((item) => item.ordnance === 'torpedo' && item.size === 12))

const gladius = shop.getShip('aegs_gladius')
const wingRack = gladius.ports.find((port) => port.id === 'hardpoint_missilerack_left_wing_outer')
const rackChoices = shop.partsForPort(wingRack, gladius)
assert.equal(rackChoices.some((item) => item.attachType === 'BombLauncher'), true)
const s3Gun = {
  id: 'test_s3_gun',
  label: 'Size 3',
  section: 'weapons',
  kind: 'weapon',
  size: 3,
  minSize: 3,
  maxSize: 3,
  locked: false,
  accepts: [{ type: 'WeaponGun', subtypes: ['Gun'] }],
}
assert.ok(
  shop.partsForPort(s3Gun, gladius).some((item) => item.entityClass === 'gats_ballisticgatling_s3'),
  'Mantis GT-220 lists on a size 3 gun mount that is not the RSI Mantis',
)
assert.equal(rackChoices.some((item) => item.kind === 'missile'), false)
const quad = rackChoices.find((item) => item.entityClass === 'mrck_s03_behr_quad_s01')
assert.ok(quad, 'a size 3 rack that holds more size 1 missiles stays selectable')
const dualSlots = shop.missileSlotsForRack(gladius, wingRack, { entityClass: 'mrck_s03_behr_dual_s02', source: 'stock' })
const dualMissiles = shop.partsForPort(dualSlots[0])
assert.ok(dualMissiles.length > 0)
assert.ok(dualMissiles.every((item) => item.ordnance === 'missile' && item.size === dualSlots[0].size))
const quadSlots = shop.missileSlotsForRack(gladius, wingRack, { entityClass: quad.entityClass, source: 'stock' })
assert.ok(quadSlots.length > dualSlots.length)
assert.equal(quadSlots[0].size, 1)
assert.ok(shop.partsForPort(quadSlots[0]).every((item) => item.ordnance === 'missile' && item.size === 1))
const bombRack = rackChoices.find((item) => item.attachType === 'BombLauncher')
const bombSlots = shop.missileSlotsForRack(gladius, wingRack, { entityClass: bombRack.entityClass, source: 'stock' })
assert.equal(bombSlots[0].kind, 'bomb')
const bombs = shop.partsForPort(bombSlots[0])
assert.ok(bombs.length > 0)
assert.ok(bombs.every((item) => item.ordnance === 'bomb'))

const scythe = shop.getShip('vncl_scythe')
const scytheRack = scythe.ports.find((port) => port.id === 'hardpoint_missile_rack_left')
assert.equal(scytheRack.locked, true)
const scytheTubes = shop.missileSlotsForRack(scythe, scytheRack, { entityClass: scytheRack.defaultEntityClass, source: 'stock' })
assert.equal(scytheTubes.length, 4)
assert.equal(scytheTubes[0].defaultEntityClass, 'misl_s01_ir_vncl_arrow')
assert.ok(scytheTubes.every((slot) => slot.locked !== true), 'a locked rack does not lock the missiles on it')
const scytheMissiles = shop.partsForPort(scytheTubes[0], scythe)
assert.ok(scytheMissiles.length > 1)

const polarisShip = shop.getShip('rsi_polaris')
const polarisFit = shop.stockPorts(polarisShip)
const missileStarted = performance.now()
for (const rack of polarisShip.ports) {
  if (rack.kind !== 'missileRack' && rack.kind !== 'torpedo') continue
  const tubes = shop.missileSlotsForRack(polarisShip, rack, polarisFit[rack.id])
  for (const tube of tubes) {
    if (!polarisFit[tube.id] && tube.defaultEntityClass) {
      polarisFit[tube.id] = { entityClass: tube.defaultEntityClass, source: 'stock' }
    }
    shop.matchingCopyPorts(polarisShip, polarisFit, tube)
  }
}
const missileMs = performance.now() - missileStarted
assert.ok(missileMs < 1000, `Polaris missile list took ${Math.round(missileMs)}ms`)

const ghost = shop.getShip('anvl_hornet_f7cs')
const ghostNose = ghost.ports.find((port) => port.id === 'hardpoint_class_4_nose')
assert.equal(ghostNose.kind, 'weaponMount')
assert.equal(ghostNose.minSize, 2)
assert.equal(ghostNose.maxSize, 3)
assert.equal(ghostNose.defaultEntityClass, null)

const ghost2 = shop.getShip('anvl_hornet_f7cs_mk2')
const ghostNose2 = ghost2.ports.find((port) => port.id === 'hardpoint_weapon_nose')
assert.equal(ghostNose2.label, 'Weapon Nose')
const ghostMk2Nose = shop.partsForPort(ghostNose2, ghost2)
assert.ok(ghostMk2Nose.some((item) => item.entityClass === 'anvl_hornet_f7c_mk2_nose_turret'), 'Ghost Mk II nose lists the Mk II nose turret')
assert.ok(ghostMk2Nose.some((item) => item.entityClass === 'anvl_hornet_f7c_nose_turret'), 'Mark I nose turret fits the Mark II Ghost')
assert.ok(
  shop.getShip('aegs_gladius').ports.every((port) => !shop.partsForPort(port, shop.getShip('aegs_gladius')).some((item) => item.entityClass === 'anvl_hornet_f7c_nose_turret')),
  'an F7 nose turret stays off a ship that is not an F7',
)

const size5Host = ships.find((ship) => !ship.id.startsWith('espr_') && ship.ports.some((port) => {
  if (port.locked || port.kind !== 'weapon') return false
  const min = port.minSize || port.size
  const max = port.maxSize || port.size
  return min <= 5 && max >= 5
}))
assert.ok(size5Host, 'a non-Esperia ship has an unlocked size 5 gun')
const size5Port = size5Host.ports.find((port) => {
  if (port.locked || port.kind !== 'weapon') return false
  const min = port.minSize || port.size
  const max = port.maxSize || port.size
  return min <= 5 && max >= 5
})
const size5Guns = shop.partsForPort(size5Port, shop.getShip(size5Host.id))
assert.ok(size5Guns.some((item) => item.entityClass === 'espr_ballisticcannon_s5'), 'Deadbolt V is listed on a size 5 gun outside Esperia')

assert.equal(
  matchShopRow(
    [{ uuid: 'uex-cf557', name: 'CF-557 Galdereen Repeater', nameFull: 'CF-557 Galdereen Repeater' }],
    { uuid: 'game-record-does-not-match', displayName: 'CF-557 Galdereen Repeater' },
  )?.name,
  'CF-557 Galdereen Repeater',
)

const jump = shop.getShip('orig_890jump')
const quantum = jump.ports.find((port) => port.kind === 'quantum')
const drives = shop.partsForPort(quantum, jump)
assert.ok(drives.some((item) => item.entityClass === 'qdrv_orig_s04_890j_scitem'))
assert.equal(drives.some((item) => item.entityClass === 'qdrv_aegs_s04_javelin_scitem'), false)
assert.ok(drives.every((item) => item.entityClass.includes('890')))

const hornet = shop.getShip('anvl_hornet_f7cm_mk2')
const center = hornet.ports.find((port) => port.id === 'hardpoint_weapon_center')
const fitted = shop.applyPortFit(hornet, shop.stockPorts(hornet), center, {
  entityClass: 'anvl_hornet_f7cm_mk2_ball_turret_bespoke',
  source: 'stock',
})
assert.equal(fitted['hardpoint_weapon_center/hardpoint_weapon_left']?.entityClass, 'mount_gimbal_behr_ballisticgatling_hornet_bespoke')
assert.equal(
  fitted['hardpoint_weapon_center/hardpoint_weapon_left/hardpoint_class_2']?.entityClass,
  'behr_ballisticgatling_hornet_bespoke',
)

const castillo = items.find((item) => item.entityClass === 'mrck_s03_temp_bomb')
assert.equal(castillo.displayName, 'CST-313 "Castillo"')
assert.equal(castillo.mounts[0].minSize, 3)
assert.equal(castillo.mounts[0].maxSize, 3)
assert.ok(rackChoices.some((item) => item.entityClass === 'mrck_s03_temp_bomb'), 'Castillo fits a size 3 rack hardpoint')
const meteor = shop.getShip('rsi_meteor')
const meteorRack = meteor.ports.find((port) => port.id === 'hardpoint_missile_rack_01')
const meteorChoices = shop.partsForPort(meteorRack, meteor)
assert.ok(meteorChoices.some((item) => item.entityClass === 'mrck_s03_temp_bomb'), 'Castillo fits a size 3 missile hardpoint that does not list a bomb launcher')
assert.equal(new Set(meteorChoices.map((item) => item.displayName)).size, meteorChoices.length)

const size4RackShip = ships.find((ship) => ship.ports.some((port) => port.kind === 'missileRack' && !port.locked && (port.minSize || port.size) <= 4 && (port.maxSize || port.size) >= 4))
const size4Rack = size4RackShip.ports.find((port) => port.kind === 'missileRack' && !port.locked && (port.minSize || port.size) <= 4 && (port.maxSize || port.size) >= 4)
const size4Choices = shop.partsForPort(size4Rack, shop.getShip(size4RackShip.id))
assert.equal(size4Choices.filter((item) => item.displayName === 'MSD-442 Missile Rack').length <= 1, true)
assert.equal(new Set(size4Choices.map((item) => `${item.displayName}|${item.size}`)).size, size4Choices.length)

function takesSize4Turret(port) {
  if (port.locked) return false
  const min = port.minSize || port.size
  const max = port.maxSize || port.size
  if (min > 4 || max < 4) return false
  return (port.accepts || []).some((rule) => String(rule.type).toLowerCase() === 'turret')
}
const foreign = ships.find((ship) => ship.id !== 'aegs_idris_m' && ship.ports.some(takesSize4Turret))
const foreignPort = foreign.ports.find(takesSize4Turret)
const foreignMounts = shop.partsForPort(foreignPort, shop.getShip(foreign.id))
assert.equal(foreignMounts.some((item) => item.entityClass === 'aegs_idris_lower_camera_mount' || item.entityClass === 'aegs_idris_upper_camera_mount'), false)
assert.equal(new Set(foreignMounts.filter((item) => item.displayName.startsWith('VariPuck ')).map((item) => item.displayName)).size, foreignMounts.filter((item) => item.displayName.startsWith('VariPuck ')).length)
const idrisGimbal = idris.ports.find((port) => port.id === 'hardpoint_front_left_turret/turret_left')
const idrisGimbals = shop.partsForPort(idrisGimbal, idrisShip)
assert.ok(idrisGimbals.some((item) => item.entityClass === 'aegs_idris_lower_camera_mount'))
assert.ok(idrisGimbals.some((item) => item.entityClass === 'aegs_idris_upper_camera_mount'))
assert.equal(idrisGimbals.filter((item) => item.displayName === 'VariPuck S4 Gimbal Mount').length, 1)

const torpedoFit = {
  [idrisNose.id]: { entityClass: 'mrck_s10_aegs_idris_nose_s12_torpedo', source: 'stock' },
  [tubes[0].id]: { entityClass: torpedoes[0].entityClass, source: 'stock' },
}
assert.equal(shop.matchingCopyPorts(idrisShip, torpedoFit, tubes[0]).length, tubes.length - 1)
assert.equal(shop.matchingCopyPorts(idrisShip, torpedoFit, idrisNose).length, 0)
const bombFit = {
  [wingRack.id]: { entityClass: bombRack.entityClass, source: 'stock' },
  [bombSlots[0].id]: { entityClass: bombs[0].entityClass, source: 'stock' },
}
assert.equal(shop.matchingCopyPorts(gladius, bombFit, bombSlots[0]).length, Math.max(0, bombSlots.length - 1))

const leonids = items.find((item) => item.entityClass === 'rsi_ballisticcannon_s5_meteor_bespoke')
assert.equal(leonids.stats.Weapon_CycleShots, 2)
assert.ok(Math.abs(leonids.stats.Weapon_CycleSeconds - (60 / 40 + 60 / 225)) < 0.0001)
assert.equal(leonids.burstDps, 1811)

const retaliatorFront = retaliator.ports.find((port) => port.id === 'hardpoint_front_module')
const retaliatorRear = retaliator.ports.find((port) => port.id === 'hardpoint_rear_module')
assert.equal(retaliatorFront?.kind, 'module')
assert.equal(retaliatorRear?.kind, 'module')
const frontModules = shop.partsForPort(retaliatorFront, shop.getShip('aegs_retaliator'))
assert.ok(frontModules.some((item) => item.entityClass === 'aegs_retaliator_module_front_cargo' && item.feature === '+38 SCU cargo'))
assert.ok(frontModules.some((item) => item.entityClass === 'aegs_retaliator_module_front_bomber' && item.feature === '4 × missiles'))
assert.ok(frontModules.some((item) => item.entityClass === 'aegs_retaliator_module_front_base'))
const rearModules = shop.partsForPort(retaliatorRear, shop.getShip('aegs_retaliator'))
assert.ok(rearModules.some((item) => item.feature === '+36 SCU cargo'))
assert.ok(rearModules.some((item) => item.feature === '2 × missiles'))
const ordnanceFit = shop.applyPortFit(
  shop.getShip('aegs_retaliator'),
  shop.stockPorts(shop.getShip('aegs_retaliator')),
  retaliatorFront,
  { entityClass: 'aegs_retaliator_module_front_bomber', source: 'stock' },
)
const retaliatorRacks = shop.portsForSection(shop.getShip('aegs_retaliator'), 'missiles', ordnanceFit)
assert.ok(retaliatorRacks.some((port) => port.id === 'hardpoint_front_module/hardpoint_torpedo_launcher_fore'))
assert.equal(shop.missileSlotsForRack(shop.getShip('aegs_retaliator'), retaliatorRacks.find((port) => port.id.endsWith('hardpoint_torpedo_launcher_fore')), ordnanceFit[retaliatorRacks.find((port) => port.id.endsWith('hardpoint_torpedo_launcher_fore')).id]).length, 4)

for (const id of ['rsi_apollo_medivac', 'rsi_apollo_triage']) {
  const apollo = shop.getShip(id)
  const left = apollo.ports.find((port) => port.id === 'hardpoint_modular_room_left')
  const right = apollo.ports.find((port) => port.id === 'hardpoint_modular_room_right')
  assert.equal(left?.kind, 'module', `${id} left module`)
  assert.equal(right?.kind, 'module', `${id} right module`)
  const choices = shop.partsForPort(left, apollo)
  assert.ok(choices.some((item) => item.feature === '1 × Tier 1 med bed'), `${id} lists the tier 1 bed`)
  assert.ok(choices.some((item) => item.feature === '3 × Tier 3 med beds'), `${id} lists the tier 3 beds`)
}

assert.equal(shop.getShip('anvl_hawk').ports.find((port) => port.id === 'hardpoint_missile_emp')?.kind, 'emp')
assert.equal(shop.getShip('aegs_sabre_raven').ports.filter((port) => port.kind === 'emp').length, 2)
const warlock = shop.getShip('aegs_avenger_warlock')
const warlockEmp = warlock.ports.find((port) => port.kind === 'emp')
assert.ok(warlockEmp?.defaultEntityClass, 'Avenger Warlock has an EMP hardpoint')
const warlockFitted = shop.stockPorts(warlock)
const warlockWithout = { ...warlockFitted }
delete warlockWithout[warlockEmp.id]
const warlockWithEmp = shop.snapshotForBuild(warlock, warlockFitted)
const warlockNoEmp = shop.snapshotForBuild(warlock, warlockWithout)
assert.ok(warlockWithEmp.coolantDemand > warlockNoEmp.coolantDemand, 'Warlock EMP pips add to the cooling load')

assert.equal(items.some((item) => item.displayName === 'Slayer Cannon'), false)
assert.equal(size5Guns.some((item) => item.displayName === 'Slayer Cannon'), false)

const hornetCenter = shop.getShip('anvl_hornet_f7cm_mk2').ports.find((port) => port.id === 'hardpoint_weapon_center')
assert.equal(hornetCenter?.kind, 'weaponMount')
const hornetCargoSlot = shop.getShip('anvl_hornet_f7c').ports.find((port) => port.id === 'hardpoint_class_4_center')
assert.equal(hornetCargoSlot?.kind, 'weaponMount')

console.log('ship shop catalog checks passed')
