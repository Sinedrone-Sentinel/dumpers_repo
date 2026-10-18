import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { weaponBurstDps } from '../lib/shipItemStats.mjs'

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

console.log('ship shop catalog checks passed')
