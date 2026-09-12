/**
 * Automated test entrypoint for CI and local `npm test`.
 * 1) Unit helpers (scripts/tests/unit-suite.mjs)
 * 2) Blueprint SEO display audit
 * 3) Mining math verification
 * 4) Dumper spawn-confirm prune (Python)
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

console.log('\n=== Dumper spawn-confirm ===\n')
const spawnScript = path.join(root, 'scripts/tests/dumper-spawn-confirm.py')
let spawnConfirm = spawnSync('python', [spawnScript], { cwd: root, stdio: 'inherit', env: process.env })
if (spawnConfirm.error && spawnConfirm.error.code === 'ENOENT') {
  spawnConfirm = spawnSync('python3', [spawnScript], { cwd: root, stdio: 'inherit', env: process.env })
}
if (spawnConfirm.status !== 0) {
  process.exit(spawnConfirm.status ?? 1)
}

console.log('\nAll test suites passed.\n')
