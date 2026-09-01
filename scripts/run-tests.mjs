/**
 * Automated test entrypoint for CI and local `npm test`.
 * 1) Unit helpers (scripts/tests/unit-suite.mjs)
 * 2) Mining math verification (scripts/verify-mining-math.mjs)
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(label, scriptRel) {
  console.log(`\n=== ${label} ===\n`)
  const result = spawnSync(process.execPath, [path.join(root, scriptRel)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('Unit suite', 'scripts/tests/unit-suite.mjs')
run('Blueprint SEO display', 'scripts/audit-blueprint-seo-display.mjs')
run('Mining math', 'scripts/verify-mining-math.mjs')

console.log('\nAll test suites passed.\n')
