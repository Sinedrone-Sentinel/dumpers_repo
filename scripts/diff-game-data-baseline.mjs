#!/usr/bin/env node
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

function strip(obj) {
  if (Array.isArray(obj)) return obj.map(strip)
  if (obj && typeof obj === 'object') {
    const o = {}
    for (const k of Object.keys(obj)) {
      if (k === '_extracted') continue
      o[k] = strip(obj[k])
    }
    return o
  }
  return obj
}

const baselineDir = '.phase2-baseline'
const dataDir = 'src/data'
const files = readdirSync(baselineDir).filter((f) => f.startsWith('game-') && f.endsWith('.json'))

let allMatch = true
for (const f of files) {
  const a = strip(JSON.parse(readFileSync(join(baselineDir, f), 'utf8')))
  const b = strip(JSON.parse(readFileSync(join(dataDir, f), 'utf8')))
  const match = JSON.stringify(a) === JSON.stringify(b)
  console.log(match ? 'OK' : 'DIFF', f)
  if (!match) allMatch = false
}
console.log(allMatch ? '\nALL MATCH (ignoring _extracted)' : '\nMISMATCHES FOUND')
process.exit(allMatch ? 0 : 1)
