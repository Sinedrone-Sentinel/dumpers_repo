/**
 * Standalone patch page (public/What's New.html).
 * One self-contained file: no site chrome, no external assets.
 * A blueprint that becomes orderable counts as new even when its record did not change.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { humanizeStatName, humanizeToken } from './tickerLanguage.mjs'

export const WHATS_NEW_PAGE_NAME = "What's New.html"
export const WHATS_NEW_ISSUE_KEY = 'patch:whats-new'

const CATEGORY_ORDER = [
  'Blueprints',
  'Resources',
  'Components',
  'FPS Weapons',
  'Ordnance',
  'Missions',
  'Salvage',
  'Wikelo',
]

const ACTION_LABEL = { added: 'Added', removed: 'Removed', changed: 'Changed' }

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slug(value) {
  return String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/** Reward pools plus starter blueprints. Same set the site treats as orderable. */
export function orderableKeysFromCatalog(blueprintsDoc, missionsDoc) {
  const keys = new Set()
  const missions = missionsDoc?.blueprintMissions ?? {}
  for (const [name, pools] of Object.entries(missions)) {
    if (Array.isArray(pools) && pools.length && name) keys.add(String(name).toLowerCase())
  }
  for (const bp of blueprintsDoc?.blueprints ?? []) {
    if (bp?.isDefault && bp.internalName) keys.add(String(bp.internalName).toLowerCase())
  }
  return keys
}

/** Keys that gained or lost orderable status between two catalogs. */
export function orderableFlip(prevKeys, nextKeys) {
  const prev = prevKeys instanceof Set ? prevKeys : new Set(prevKeys ?? [])
  const next = nextKeys instanceof Set ? nextKeys : new Set(nextKeys ?? [])
  return {
    became: [...next].filter((key) => !prev.has(key)).sort(),
    lost: [...prev].filter((key) => !next.has(key)).sort(),
  }
}

/** StatName_GPP_* lines from global.ini, keyed by letters and digits only. */
export function statNamesFromIni(text) {
  const map = new Map()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).split(',')[0].trim()
    if (!/^StatName_GPP_/i.test(key)) continue
    const name = line.slice(eq + 1).trim()
    if (!name) continue
    map.set(slug(key.replace(/^StatName_GPP_/i, '')), name)
  }
  return map
}

export function loadStatNames(projectRoot) {
  const path = join(projectRoot, 'extracted-data', 'Data', 'Localization', 'english', 'global.ini')
  if (!existsSync(path)) return new Map()
  try {
    return statNamesFromIni(readFileSync(path, 'utf8'))
  } catch {
    return new Map()
  }
}

function statLabel(property, statNames) {
  const named = statNames?.get?.(slug(property))
  return named || humanizeStatName(property) || 'Stat'
}

function num(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}

function modifierEnds(mod) {
  if (mod?.isIntegerAdditive) {
    return { start: Number(mod.additiveAtStart ?? 0), end: Number(mod.additiveAtEnd ?? mod.additiveAtStart ?? 0), additive: true }
  }
  const start = Number(mod?.baseAmount ?? 1)
  const span = Number(mod?.endQuality ?? 1000) - Number(mod?.startQuality ?? 0)
  const end = start + Number(mod?.perQuality ?? 0) * (span || 0)
  return { start, end, additive: false }
}

function modifierText(mod, statNames) {
  const { start, end, additive } = modifierEnds(mod)
  const range =
    (mod.startQuality ?? 0) === 0 && (mod.endQuality ?? 1000) === 1000
      ? ''
      : ` (Q${mod.startQuality ?? 0}–${mod.endQuality ?? 1000})`
  const values = additive ? `${num(start)} → ${num(end)}` : `x${num(start)} → x${num(end)}`
  return `${esc(statLabel(mod.property, statNames))}: ${values}${range}`
}

function slotModifiers(slot) {
  const seen = new Set()
  const mods = []
  for (const option of slot?.options ?? []) {
    for (const mod of option?.modifiers ?? []) {
      if (!mod?.property || seen.has(mod.property)) continue
      seen.add(mod.property)
      mods.push(mod)
    }
  }
  return mods
}

function optionText(option) {
  if (option?.type === 'item') {
    const name = option.displayName || option.entityName || humanizeToken(option.itemName)
    return `${option.quantity ?? 1}x ${name}`
  }
  const scu = Number(option?.standardCargoUnits)
  const amount = Number.isFinite(scu) ? ` ${num(scu)} SCU` : ''
  return `${option?.resourceName || 'Resource'}${amount}`
}

function minQualityText(slot) {
  const values = [...new Set((slot?.options ?? []).map((option) => Number(option?.minQuality) || 0))]
    .filter((value) => value > 1)
  if (!values.length) return '—'
  return values.map((value) => String(value)).join(' / ')
}

function craftTimeText(bp) {
  const time = bp?.craftTime
  if (!time) return ''
  const parts = []
  if (time.hours) parts.push(`${time.hours}h`)
  if (time.minutes) parts.push(`${time.minutes}m`)
  if (time.seconds) parts.push(`${time.seconds}s`)
  return parts.join(' ')
}

function blueprintName(bp, key) {
  const named = bp?.blueprintName || bp?.displayName
  if (named && !String(named).startsWith('@')) return String(named)
  return humanizeToken(key)
}

function indexBlueprints(blueprints) {
  const byKey = new Map()
  for (const bp of blueprints ?? []) {
    const key = String(bp?.internalName || '').toLowerCase()
    if (key) byKey.set(key, bp)
  }
  return byKey
}

function cardHtml(bp, key, flags, statNames) {
  const name = blueprintName(bp, key)
  const badges = [`<span class="b cat">${esc(bp?.categoryName || bp?.category || 'Blueprint')}</span>`]
  const time = craftTimeText(bp)
  if (time) badges.push(`<span class="b">${esc(time)}</span>`)
  if (flags.added) badges.push('<span class="b new">New blueprint</span>')
  if (flags.became && !flags.added) badges.push('<span class="b ord">Now orderable</span>')
  if (flags.added && flags.orderable) badges.push('<span class="b ord">Orderable</span>')
  if (flags.added && !flags.orderable) badges.push('<span class="b wait">Not obtainable yet</span>')
  if (bp?.isDefault) badges.push('<span class="b">Starter</span>')

  const missions = []
  const seen = new Set()
  for (const row of bp?.rewardMissions ?? []) {
    const title = String(row?.mission || '').trim()
    if (!title || seen.has(title)) continue
    seen.add(title)
    missions.push(title)
    if (missions.length >= 6) break
  }

  const rows = (bp?.slots ?? []).map((slot) => {
    const options = slot.options ?? []
    const ingredients = options.map((option) => esc(optionText(option))).join(' <strong>or</strong> ')
    const mods = slotModifiers(slot)
    const stats = mods.length
      ? mods.map((mod) => modifierText(mod, statNames)).join('<br>')
      : '<span class="muted">None</span>'
    return `<tr><td>${esc(slot.slotDisplayName || slot.slotDebugName || 'Slot')}</td><td>${ingredients || '—'}</td><td>${esc(minQualityText(slot))}</td><td>${stats}</td></tr>`
  })

  let html = `<div class="card"><div class="ch"><h4>${esc(name)}</h4><div>${badges.join('')}</div></div>`
  if (missions.length) {
    html += `<p class="src"><strong>Awarded by:</strong> ${missions.map((title) => esc(title)).join('; ')}</p>`
  }
  if (rows.length) {
    html += `<table><tr><th>Slot</th><th>Ingredient</th><th>Min quality</th><th>Stats tied to this slot (Q0 → Q1000)</th></tr>${rows.join('')}</table>`
  }
  html += '</div>'
  return html
}

function groupList(items, changed) {
  if (changed) {
    const rows = items
      .map((item) => `<tr><td>${esc(item.label)}</td><td>${esc(item.summary || '')}</td></tr>`)
      .join('')
    return `<table><tr><th>Name</th><th>What changed</th></tr>${rows}</table>`
  }
  return `<ul class="tight">${items.map((item) => `<li>${esc(item.label)}</li>`).join('')}</ul>`
}

const PAGE_CSS = `
  body { background:#0f172a; color:#e2e8f0; font-family:Segoe UI, Arial, sans-serif; max-width:1100px; margin:2rem auto; padding:0 1.5rem; line-height:1.5; }
  h1 { color:#38bdf8; border-bottom:2px solid #1e293b; padding-bottom:.4rem; }
  h2 { color:#38bdf8; margin-top:2.5rem; border-bottom:1px solid #1e293b; padding-bottom:.3rem; }
  h3 { color:#fbbf24; margin-top:1.6rem; }
  p.meta, .muted { color:#94a3b8; }
  p.meta { font-size:.9rem; }
  table { border-collapse:collapse; width:100%; margin:.6rem 0 1.2rem; font-size:.92rem; }
  th, td { border:1px solid #334155; padding:.4rem .6rem; text-align:left; vertical-align:top; }
  th { background:#1e293b; color:#cbd5e1; }
  tr:nth-child(even) td { background:#111c33; }
  .note { background:#1e293b; border-left:4px solid #38bdf8; padding:.6rem .9rem; margin:1rem 0; }
  .card { background:#111c33; border:1px solid #334155; border-radius:8px; padding:.7rem 1rem; margin:.8rem 0; }
  .card tr:nth-child(even) td { background:#0f172a; }
  .ch { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.4rem; }
  .ch h4 { margin:0; color:#f1f5f9; font-size:1.05rem; }
  .b { display:inline-block; font-size:.75rem; padding:.1rem .5rem; border-radius:999px; background:#334155; margin-left:.3rem; color:#e2e8f0; }
  .b.cat { background:#0c4a6e; } .b.new { background:#065f46; } .b.ord { background:#92400e; } .b.wait { background:#7f1d1d; }
  .src { margin:.4rem 0; font-size:.88rem; }
  ul.tight li { margin:.15rem 0; }
  nav a { color:#7dd3fc; margin-right:1rem; text-decoration:none; }
  @media print {
    body { background:#fff; color:#000; }
    th { background:#eee; color:#000; }
    tr:nth-child(even) td, .card, .note { background:#f6f6f6; }
    h1, h2 { color:#000; } h3, .ch h4 { color:#333; }
  }
`

/**
 * @param {{ version?: string, groups?: {category:string, action:string, items:{key:string, label:string, summary?:string|null}[]}[], blueprints?: object[], became?: string[], lost?: string[], orderableKeys?: Set<string>|string[], statNames?: Map<string, string>, lostLabels?: Record<string, string> }} input
 */
export function renderWhatsNewHtml(input = {}) {
  const version = String(input.version || '').trim()
  const groups = (input.groups ?? []).filter((group) => group.items?.length)
  const byKey = indexBlueprints(input.blueprints)
  const orderable = input.orderableKeys instanceof Set ? input.orderableKeys : new Set(input.orderableKeys ?? [])
  const statNames = input.statNames instanceof Map ? input.statNames : new Map()
  const added = new Set()
  for (const group of groups) {
    if (group.category === 'Blueprints' && group.action === 'added') {
      for (const item of group.items) added.add(String(item.key).toLowerCase())
    }
  }
  const became = (input.became ?? []).map((key) => String(key).toLowerCase())
  const cardKeys = [...new Set([...added, ...became])].sort((a, b) =>
    blueprintName(byKey.get(a), a).localeCompare(blueprintName(byKey.get(b), b)),
  )

  const present = new Set(groups.map((group) => group.category))
  const categories = [
    ...CATEGORY_ORDER.filter((category) => present.has(category)),
    ...[...present].filter((category) => !CATEGORY_ORDER.includes(category)).sort(),
  ]

  let catalog = ''
  for (const category of categories) {
    const rows = groups.filter((group) => group.category === category)
    catalog += `<h2>${esc(category)}</h2>`
    for (const action of ['added', 'changed', 'removed']) {
      const group = rows.find((row) => row.action === action)
      if (!group) continue
      catalog += `<h3>${ACTION_LABEL[action] || action} (${group.items.length})</h3>`
      catalog += groupList(group.items, action === 'changed')
    }
  }

  let cards = ''
  for (const key of cardKeys) {
    const bp = byKey.get(key)
    cards += cardHtml(bp, key, {
      added: added.has(key),
      became: became.includes(key),
      orderable: orderable.has(key) || bp?.isDefault === true,
    }, statNames)
  }

  const lostRows = (input.lost ?? []).map((key) => {
    const id = String(key).toLowerCase()
    const label = input.lostLabels?.[id] || input.lostLabels?.[key] || blueprintName(byKey.get(id), id)
    return `<tr><td>${esc(label)}</td><td>No released contract awards this anymore</td></tr>`
  })

  const empty = !catalog && !cards && !lostRows.length
  const body = empty
    ? '<p>Nothing player-facing changed in this patch.</p>'
    : `${catalog}
<h2 id="recipes">Blueprint recipes</h2>
<p>New blueprints, and blueprints that became orderable this patch. A blueprint already in the files counts as new once a released contract awards it. Minimum quality is shown when the recipe asks for more than the default.</p>
${cards || '<p class="muted">No blueprint recipes changed hands this patch.</p>'}
<h2 id="lost">No longer orderable (${lostRows.length})</h2>
${lostRows.length ? `<table><tr><th>Blueprint</th><th>Why</th></tr>${lostRows.join('')}</table>` : '<p class="muted">None.</p>'}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>What's New${version ? ` ${esc(version)}` : ''}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<h1>What's New${version ? ` in ${esc(version)}` : ''}</h1>
<p class="meta">Patch changes members can use. Names are the in-game names.</p>
<nav><a href="#recipes">Blueprint recipes</a><a href="#lost">No longer orderable</a></nav>
<div class="note">A blueprint counts as new when it is added, or when it becomes orderable. Orderable means a released contract awards it, or it is a starter blueprint. This page replaces the separate patch lists.</div>
${body}
</body>
</html>
`
}
