/**
 * Every tracked JSON file under src/data must parse in full.
 *
 * Something on Windows has cut large data files off at about 1 MiB on disk
 * (game-ship-item-stats.json, 1.8 MB, ending at 1,048,569 bytes). The later suites
 * then fail with a bare JSON SyntaxError, so this runs first and names the file.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIB = 1024 * 1024

const files = execFileSync('git', ['ls-files', '-z', '--', 'src/data/*.json'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

if (files.length === 0) {
  console.error('No tracked JSON files found under src/data.')
  process.exit(1)
}

function committedSize(rel) {
  try {
    return Number(execFileSync('git', ['cat-file', '-s', `HEAD:${rel}`], { cwd: root, encoding: 'utf8' }).trim())
  } catch {
    return null
  }
}

const broken = []
for (const rel of files) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) continue
  const text = fs.readFileSync(full, 'utf8')
  try {
    JSON.parse(text)
  } catch (err) {
    const size = fs.statSync(full).size
    const head = committedSize(rel)
    const nearMib = size > MIB - 64 && size <= MIB
    broken.push({ rel, size, head, nearMib, message: err.message })
  }
}

if (broken.length > 0) {
  console.error('These data files do not parse:\n')
  for (const b of broken) {
    const sizes = b.head ? `${b.size.toLocaleString()} bytes on disk, ${b.head.toLocaleString()} committed` : `${b.size.toLocaleString()} bytes on disk`
    console.error(`  ${b.rel}: ${sizes}`)
    if (b.nearMib) console.error('    Cut off at about 1 MiB, the same truncation seen before.')
    console.error(`    ${b.message}`)
    console.error(`    Restore it: git checkout -- ${b.rel}\n`)
  }
  process.exit(1)
}

console.log(`${files.length} data JSON files parse in full.`)
