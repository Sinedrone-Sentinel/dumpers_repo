/**
 * Bulk-migrate common raw Tailwind form/button chrome to site-* tokens.
 * Dry-run by default; pass --write to apply.
 *
 * Skips: seo landing, node_modules, data JSON.
 */
import fs from 'node:fs'
import path from 'node:path'

const WRITE = process.argv.includes('--write')
const ROOT = path.resolve('src')
const SKIP_PARTS = ['seo\\PublicSeoLanding', 'seo/PublicSeoLanding', 'node_modules', '.json']

const REPLACEMENTS = [
  // Inputs / selects (common recipes)
  [
    /bg-slate-800 border border-slate-600 rounded-lg text-white/g,
    'site-input text-white',
  ],
  [
    /bg-slate-900\/70 border border-slate-600 rounded-lg text-white/g,
    'site-input text-white',
  ],
  [
    /bg-slate-800\/80 border border-slate-600 rounded(?:-lg)?/g,
    'site-surface',
  ],
  [
    /bg-slate-900\/60 border border-slate-700 rounded-xl/g,
    'site-surface',
  ],
  [
    /bg-slate-900\/50 border border-slate-700 rounded-lg/g,
    'site-surface',
  ],
  [
    /bg-slate-900\/40 border border-slate-700(?:\/\d+)? rounded-lg/g,
    'site-surface',
  ],
  [
    /bg-slate-900\/30 border border-slate-700(?:\/\d+)? rounded-lg/g,
    'site-surface',
  ],
  [
    /bg-slate-800\/50 border border-slate-700(?:\/\d+)? rounded-lg/g,
    'site-surface',
  ],
  [
    /bg-slate-800\/40 border border-slate-700(?:\/\d+)? rounded-lg/g,
    'site-surface',
  ],
  [
    /rounded-lg border border-slate-700(?:\/\d+)? bg-slate-900\/50/g,
    'site-surface',
  ],
  [
    /rounded-lg border border-slate-600 bg-slate-800/g,
    'site-surface',
  ],
  // Secondary / danger / success button recipes
  [
    /bg-slate-800 hover:bg-slate-700(?:\/\d+)? text-white border border-slate-700/g,
    'site-btn-secondary',
  ],
  [
    /bg-slate-800 hover:bg-slate-700 text-white rounded-lg/g,
    'site-btn-secondary',
  ],
  [
    /bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600/g,
    'site-filter-idle',
  ],
  [
    /bg-slate-800\/50 text-slate-600 border border-slate-700 cursor-not-allowed/g,
    'site-filter-idle opacity-40 cursor-not-allowed',
  ],
  [
    /bg-red-600 hover:bg-red-500(?: disabled:opacity-50)? text-white rounded-lg/g,
    'site-btn-danger',
  ],
  [
    /bg-red-600 hover:bg-red-700 text-white rounded(?:-lg)?/g,
    'site-btn-danger',
  ],
  [
    /bg-green-600 hover:bg-green-500 text-white rounded-lg/g,
    'site-btn-success',
  ],
  [
    /bg-green-900\/50 text-green-300 border border-green-500\/30 rounded/g,
    'site-btn-success text-xs',
  ],
  [
    /bg-amber-600 hover:bg-amber-500 text-white rounded-lg/g,
    'site-btn-primary',
  ],
  [
    /bg-orange-600 hover:bg-orange-500 text-white rounded-lg/g,
    'site-btn-primary',
  ],
  // Empty states
  [
    /text-center py-16 bg-slate-900\/30 rounded-2xl border border-dashed border-slate-700/g,
    'site-empty',
  ],
  [
    /text-center py-12 bg-slate-900\/30 rounded-2xl border border-dashed border-slate-700/g,
    'site-empty',
  ],
  [
    /text-center py-24 bg-slate-900\/30 rounded-3xl border-2 border-dashed border-slate-700/g,
    'site-empty py-24',
  ],
  // Banners
  [
    /p-3 rounded-lg bg-amber-900\/20 border border-amber-500\/30 text-amber-200 text-sm/g,
    'site-banner-warn',
  ],
  [
    /mb-4 p-3 rounded-lg bg-amber-900\/20 border border-amber-500\/30 text-amber-200 text-sm/g,
    'mb-4 site-banner-warn',
  ],
  [
    /p-3 rounded-lg bg-red-900\/30 border border-red-500\/40 text-red-300 text-sm/g,
    'site-banner-error',
  ],
  [
    /p-3 rounded-lg bg-sky-900\/20 border border-sky-500\/30 text-sky-200 text-sm/g,
    'site-banner-info',
  ],
  [
    /p-3 rounded-lg bg-green-900\/20 border border-green-500\/30 text-green-200 text-sm/g,
    'site-banner-success',
  ],
  // Dropdown list shells
  [
    /absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-900 border border-slate-600 rounded-lg shadow-xl/g,
    'site-dropdown-list',
  ],
  [
    /absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-slate-900 border border-slate-600 rounded-lg shadow-xl/g,
    'site-dropdown-list z-50',
  ],
  // Dividers
  [
    /border-t border-slate-700\/50/g,
    'site-divider',
  ],
  [
    /border-t border-slate-700\/80/g,
    'site-divider',
  ],
  [
    /border-b border-slate-700\/80/g,
    'border-b border-orange-500/15',
  ],
  [
    /border-b border-slate-700\/50/g,
    'border-b border-orange-500/10',
  ],
  [
    /border-l border-slate-700/g,
    'border-l border-orange-500/20',
  ],
  // Checkbox accent
  [
    /rounded border-slate-500 bg-slate-800 text-orange-500/g,
    'site-checkbox',
  ],
  [
    /rounded border-slate-600 bg-slate-800 text-orange-500/g,
    'site-checkbox',
  ],
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'data') continue
      walk(full, out)
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

let changedFiles = 0
let totalHits = 0

for (const file of walk(ROOT)) {
  const rel = path.relative(process.cwd(), file)
  if (SKIP_PARTS.some((p) => rel.includes(p))) continue

  let src = fs.readFileSync(file, 'utf8')
  let next = src
  let fileHits = 0

  for (const [pattern, replacement] of REPLACEMENTS) {
    const before = next
    next = next.replace(pattern, replacement)
    if (next !== before) {
      const matches = before.match(pattern)
      fileHits += matches?.length ?? 1
    }
  }

  if (next !== src) {
    changedFiles++
    totalHits += fileHits
    console.log(`${WRITE ? 'WRITE' : 'DRY '} ${rel} (~${fileHits} hits)`)
    if (WRITE) fs.writeFileSync(file, next, 'utf8')
  }
}

console.log(
  `\n${WRITE ? 'Applied' : 'Would change'} ${changedFiles} files (~${totalHits} replacements).` +
    (WRITE ? '' : ' Re-run with --write to apply.')
)
