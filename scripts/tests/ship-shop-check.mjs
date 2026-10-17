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
assert.equal(stalker.hullHp, null)

const nose = stalker.ports.find((port) => port.id === 'hardpoint_weapon_class2_nose')
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
assert.equal(raven.weaponPowerPool, 4)
const ravenFlight = items.find((item) => item.entityClass === 'controller_flight_aegs_sabre_raven_ex')
assert.equal(ravenFlight.stats.Power_Segments, 4)

const ignite = items.find((item) => item.entityClass === 'misl_s02_ir_fski_ignite')
assert.ok(ignite.stats.Missile_Damage > 0, 'Ignite has missile damage')

console.log('ship shop catalog checks passed')
