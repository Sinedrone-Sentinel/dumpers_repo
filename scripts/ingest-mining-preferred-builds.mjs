import fs from 'fs'
import path from 'path'

const root = process.cwd()
const prospector = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/mining-premade-research/prospector-candidates.json'), 'utf8')
)
const mole = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/mining-premade-research/mole-candidates.json'), 'utf8')
)

function toSlot(hp) {
  return {
    laserName: hp.laserName,
    mode: hp.headMode === 'custom' ? 'custom' : 'stock',
    modules: hp.modules ?? [],
    ...(hp.slotQualities ? { slotQualities: hp.slotQualities } : {}),
    ...(hp.customLabel ? { customLabel: hp.customLabel } : {}),
  }
}

function toBuild(c) {
  const hardpoints = [...c.hardpoints].sort((a, b) => a.hardpointIndex - b.hardpointIndex)
  return {
    id: c.id,
    displayName: c.proposedDisplayName,
    creator: c.creator,
    jobDesignation: c.jobDesignation,
    vesselId: c.vesselId,
    kind: c.kind,
    audience: c.audience,
    description: c.description,
    lasers: hardpoints.map(toSlot),
    ...(c.intendedDepositType ? { intendedDepositType: c.intendedDepositType } : {}),
    ...(c.intendedOres?.length ? { intendedOres: c.intendedOres } : {}),
    ...(c.variationOf ? { variationOf: c.variationOf } : {}),
    ...(c.mappingNotes ? { recognitionNotes: c.mappingNotes } : {}),
  }
}

const builds = [...mole.candidates, ...prospector.candidates]
  .filter((c) => c.status === 'complete' || c.status === 'org_anchor')
  .map(toBuild)

fs.writeFileSync(
  path.join(root, 'src/data/mining-preferred-builds.json'),
  JSON.stringify({ version: 1, builds }, null, 2)
)

for (const file of ['prospector-candidates.json', 'mole-candidates.json']) {
  const filePath = path.join(root, 'scripts/mining-premade-research', file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  for (const c of data.candidates) {
    c.catalogPriority = 'v1_ship'
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

console.log(`Ingested ${builds.length} preferred mining builds.`)
