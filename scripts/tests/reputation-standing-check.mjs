import assert from 'node:assert/strict'
import { alignContractStandings, playerFacingCareers } from '../lib/reputationStandingResolver.mjs'

const contractor = [
  { displayName: 'Neutral', minReputation: 0 },
  { displayName: 'Jr. Contractor', minReputation: 800 },
  { displayName: 'Contractor', minReputation: 2200 },
  { displayName: 'Sr. Contractor', minReputation: 5800 },
  { displayName: 'Veteran Contractor', minReputation: 15000 },
  { displayName: 'Head Contractor', minReputation: 38000 },
  { displayName: 'Elite Contractor', minReputation: 95250 },
]

const redWind = {
  careers: {
    hauling: {
      scopeKey: 'ReputationScope_Hauling',
      name: 'Hauling',
      standings: [
        { displayName: 'Trainee', minReputation: 0 },
        { displayName: 'Rookie', minReputation: 50 },
        { displayName: 'Junior', minReputation: 250 },
        { displayName: 'Member', minReputation: 5250 },
        { displayName: 'Experienced', minReputation: 27750 },
        { displayName: 'Senior', minReputation: 77750 },
        { displayName: 'Master', minReputation: 237750 },
      ],
    },
    standing: {
      scopeKey: 'FactionReputationScope',
      name: 'Standing',
      standings: contractor,
    },
  },
}

const redWindHaul = alignContractStandings(
  { name: 'Rookie', minReputation: 50 },
  { name: 'Master', minReputation: 237750 },
  redWind,
  { category: 'Hauling Interstellar', repScopeKey: 'ReputationScope_Hauling' },
)
assert.equal(redWindHaul.minStanding.name, 'Rookie')
assert.equal(redWindHaul.minStanding.minReputation, 50)
assert.equal(redWindHaul.maxStanding.name, 'Master')
assert.equal(redWindHaul.maxStanding.minReputation, 237750)
assert.equal(redWindHaul.repCareerLabel, 'Hauling')

const redWindPackage = alignContractStandings(
  { name: 'Neutral', minReputation: 0 },
  { name: 'Elite Contractor', minReputation: 95250 },
  redWind,
  { category: 'Hauling' },
)
assert.equal(redWindPackage.minStanding.name, 'Neutral')
assert.equal(redWindPackage.minStanding.minReputation, 0)
assert.equal(redWindPackage.maxStanding.name, 'Elite Contractor')
assert.equal(redWindPackage.maxStanding.minReputation, 95250)
assert.equal(redWindPackage.repCareerLabel, 'Standing')

const facing = playerFacingCareers(redWind.careers)
assert.deepEqual(Object.keys(facing).sort(), ['hauling', 'standing'])

const foxwell = {
  careers: {
    bounty: {
      scopeKey: 'ReputationScope_Bounty',
      name: 'Bounty Hunting',
      standings: [
        { displayName: 'Applicant', minReputation: 0 },
        { displayName: 'Tracker Trainee', minReputation: 1 },
        { displayName: 'Associate Tracker', minReputation: 5000 },
      ],
    },
    security: {
      scopeKey: 'ReputationScope_Security',
      name: 'Security',
      standings: [
        { displayName: 'Applicant', minReputation: 0 },
        { displayName: 'Security Trainee', minReputation: 1 },
        { displayName: 'Jr. Security Contractor', minReputation: 5000 },
      ],
    },
  },
}
const foxwellMerc = alignContractStandings(
  { name: 'Contractor', minReputation: 2200 },
  { name: 'Elite Contractor', minReputation: 95250 },
  foxwell,
  { category: 'Mercenary' },
)
assert.equal(foxwellMerc.minStanding.name, 'Security Trainee')
assert.equal(foxwellMerc.minStanding.minReputation, 2200)
assert.equal(foxwellMerc.maxStanding.name, 'Jr. Security Contractor')
assert.equal(foxwellMerc.repCareerLabel, 'Security')

const guild = {
  careers: {
    bounty: {
      scopeKey: 'ReputationScope_Bounty_BountyHuntersGuild',
      name: 'Bounty Hunting',
      standings: [
        { displayName: 'Applicant', minReputation: 0 },
        { displayName: 'Guild Steward', minReputation: 480000 },
      ],
    },
  },
}
const kept = alignContractStandings(
  { name: 'Guild Steward', minReputation: 480000 },
  null,
  guild,
  { category: 'Bounty Hunting' },
)
assert.equal(kept.minStanding.name, 'Guild Steward')
assert.equal(kept.minStanding.minReputation, 480000)
assert.equal(kept.repCareerLabel, 'Bounty Hunting')

const wayfarers = {
  scopeName: 'ReputationScope_Affinity',
  standings: [
    { displayName: 'Exalted', minReputation: 10000 },
    { displayName: 'Liked', minReputation: 2500 },
    { displayName: 'Neutral', minReputation: 0 },
  ],
}
const refuel = alignContractStandings(
  { name: 'Neutral', minReputation: 0 },
  { name: 'Elite Contractor', minReputation: 95250 },
  wayfarers,
  {},
)
assert.equal(refuel.minStanding.name, 'Neutral')
assert.equal(refuel.maxStanding.name, 'Exalted')
assert.equal(refuel.maxStanding.minReputation, 95250)
assert.equal(refuel.repCareerLabel, 'Affinity')

console.log('reputation standing checks passed')
