/**
 * Build-time public blueprint SEO pages for GitHub Pages crawlers.
 *
 * Regenerates from src/data/game-blueprints.json on every `npm run build`.
 * After `npm run parse-game-data` (or any catalog update), the next production
 * build adds/updates/removes `/blueprints/{slug}/` HTML automatically — no
 * hand-maintained page list.
 *
 * Usage: node scripts/generate-blueprint-seo-pages.mjs
 * (expects dist/ to exist from vite build; safe to re-run)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  blueprintDisplayName,
  blueprintInternalKey,
  blueprintSeoPath,
  buildBlueprintSeoSlugMap,
  hasBlueprintSeoEntity,
} from './lib/blueprintSeoSlug.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const siteTs = readFileSync(join(root, 'src/config/site.ts'), 'utf8')
const blueprintsJson = JSON.parse(
  readFileSync(join(root, 'src/data/game-blueprints.json'), 'utf8')
)

function readSiteUrl() {
  const match = siteTs.match(/export const SITE_URL =\s*(['"`])([\s\S]*?)\1\s+as const/)
  if (!match) throw new Error('Missing SITE_URL in site.ts')
  return match[2].replace(/\/$/, '')
}

const SITE_URL = readSiteUrl()
const GUEST_KEY = 'dumpers_guest_preview'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatCraftTime(bp) {
  const ct = bp.craftTime
  if (ct && (ct.hours || ct.minutes || ct.seconds)) {
    const parts = []
    if (ct.hours) parts.push(`${ct.hours}h`)
    if (ct.minutes) parts.push(`${ct.minutes}m`)
    if (ct.seconds) parts.push(`${ct.seconds}s`)
    return parts.join(' ') || '—'
  }
  const mins = bp.craftTimeMinutes
  if (mins == null || Number.isNaN(Number(mins))) return '—'
  const totalSec = Math.round(Number(mins) * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function craftTimeIsoDuration(bp) {
  const ct = bp.craftTime
  let totalSec = 0
  if (ct && (ct.hours || ct.minutes || ct.seconds)) {
    totalSec = (ct.hours || 0) * 3600 + (ct.minutes || 0) * 60 + (ct.seconds || 0)
  } else if (bp.craftTimeMinutes != null) {
    totalSec = Math.round(Number(bp.craftTimeMinutes) * 60)
  }
  if (totalSec <= 0) return null
  return `PT${totalSec}S`
}

function listMaterials(bp) {
  const lines = []
  for (const slot of bp.slots || []) {
    const opt =
      (slot.options || []).find((o) => o.type === 'resource' || o.resourceName) ||
      slot.options?.[0]
    if (!opt) continue
    const name = opt.resourceName || opt.itemName || 'Material'
    let amountText = '—'
    if (opt.standardCargoUnits != null && Number(opt.standardCargoUnits) > 0) {
      amountText = `${Number(opt.standardCargoUnits)} SCU`
    } else if (opt.count != null) {
      amountText = `${opt.count} item${opt.count === 1 ? '' : 's'}`
    }
    lines.push({
      slot: slot.slotDisplayName || 'Input',
      label: name,
      amountText,
    })
  }
  return lines
}

function formatPct(chance) {
  if (chance == null || Number.isNaN(Number(chance))) return ''
  const pct = Number(chance) * 100
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10
  return `${rounded}% BP drop`
}

function listMissions(bp) {
  return [...(bp.rewardMissions || [])]
    .filter((m) => m.mission && String(m.mission).trim())
    .sort((a, b) =>
      String(a.mission).localeCompare(String(b.mission), undefined, { sensitivity: 'base' })
    )
    .map((m) => {
      const standingParts = []
      if (m.standingName) {
        const minRep =
          m.minReputation != null ? ` (${Number(m.minReputation).toLocaleString()} rep)` : ''
        standingParts.push(`${m.standingName}${minRep}`)
      }
      if (m.maxStandingName && m.maxStandingName !== m.standingName) {
        const maxRep =
          m.maxReputation != null ? ` (${Number(m.maxReputation).toLocaleString()})` : ''
        standingParts.push(`${m.maxStandingName}${maxRep}`)
      }
      const loc =
        m.system || m.region
          ? [m.system, m.region].filter(Boolean).join(' ')
          : (m.locations || []).join(', ')
      const meta = [m.category, loc].filter(Boolean).join(' · ')
      const rep =
        m.repPoints != null && Number(m.repPoints) !== 0
          ? `${Number(m.repPoints) > 0 ? '+' : ''}${m.repPoints} rep`
          : ''
      return {
        title: String(m.mission).trim(),
        dropText: formatPct(m.chance),
        standingText: standingParts.join(' – '),
        repText: rep,
        metaText: meta,
      }
    })
}

function pageDescription(bp, materials, missions, craft) {
  const name = blueprintDisplayName(bp)
  const matSummary = materials
    .slice(0, 4)
    .map((m) => m.label)
    .join(', ')
  const parts = [
    `Star Citizen ${name} crafting blueprint`,
    craft !== '—' ? `craft time ${craft}` : null,
    matSummary ? `materials: ${matSummary}` : null,
    missions.length > 0
      ? `${missions.length} reward mission${missions.length === 1 ? '' : 's'}`
      : null,
    "Open Dumper's Repo Offline Mode for the full tracker and DFP.",
  ].filter(Boolean)
  return parts.join(' – ')
}

function absoluteUrl(path) {
  if (!path || path === '/') return `${SITE_URL}/`
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

function guestClickAttr() {
  return `onclick="try{sessionStorage.setItem('${GUEST_KEY}','1')}catch(e){}"`
}

function renderPage({ bp, slug }) {
  const name = blueprintDisplayName(bp)
  const materials = listMaterials(bp)
  const missions = listMissions(bp)
  const craft = formatCraftTime(bp)
  const category = (bp.categoryName || bp.category || 'General').trim()
  const title = `${name} Blueprint — Star Citizen Crafting | Dumper's Repo`
  const description = pageDescription(bp, materials, missions, craft)
  const path = blueprintSeoPath(slug)
  const pageUrl = absoluteUrl(path)
  const catalogUrl = absoluteUrl('/blueprints/')
  const q = encodeURIComponent(name)
  const liveHref = `/?q=${q}`
  const totalTime = craftTimeIsoDuration(bp)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'All Blueprints', item: catalogUrl },
      { '@type': 'ListItem', position: 2, name, item: pageUrl },
    ],
  }
  const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `${name} Blueprint`,
    description,
    url: pageUrl,
    ...(totalTime ? { totalTime } : {}),
    yield: {
      '@type': 'QuantitativeValue',
      name,
      value: 1,
      unitText: 'item',
    },
    supply: materials.map((m) => ({
      '@type': 'HowToSupply',
      name: m.label,
      requiredQuantity: { '@type': 'QuantitativeValue', unitText: m.amountText },
    })),
  }

  const materialsHtml =
    materials.length === 0
      ? `<p class="muted">No material inputs listed.</p>`
      : `<ul class="list">${materials
          .map(
            (m) =>
              `<li><span class="muted">${escapeHtml(m.slot)}:</span> <strong>${escapeHtml(m.label)}</strong> <span class="muted">${escapeHtml(m.amountText)}</span></li>`
          )
          .join('\n')}</ul>`

  const missionsHtml =
    missions.length === 0
      ? `<p class="muted">No reputation mission rewards listed (may be a default / starter blueprint).</p>`
      : `<ul class="missions">${missions
          .map((m) => {
            const bits = [m.metaText, m.standingText, m.repText, m.dropText]
              .filter(Boolean)
              .map((t) => `<span>${escapeHtml(t)}</span>`)
              .join('')
            return `<li class="card"><div class="mission-title">${escapeHtml(m.title)}</div><div class="meta">${bits}</div></li>`
          })
          .join('\n')}</ul>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Dumper's Repo" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${SITE_URL}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${SITE_URL}/og-image.png" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(howToLd)}</script>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #020617; color: #e2e8f0; line-height: 1.5; }
    a { color: #fb923c; text-decoration: none; }
    a:hover { color: #fdba74; }
    header, main, footer { max-width: 48rem; margin: 0 auto; padding: 1rem 1.25rem; }
    header { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; background: rgba(2,6,23,.9); max-width: none; }
    header .inner { max-width: 48rem; margin: 0 auto; width: 100%; display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: space-between; padding: 0 1.25rem; }
    .brand { font-weight: 700; letter-spacing: .04em; color: #f8fafc; }
    .eyebrow { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #fb923c; margin: 0; }
    h1 { font-size: 1.75rem; margin: .5rem 0 0; color: #fff; }
    h2 { font-size: 1.125rem; margin: 2rem 0 .75rem; padding-bottom: .5rem; border-bottom: 1px solid #1e293b; color: #fff; }
    .lead { color: #cbd5e1; font-size: .95rem; }
    .muted { color: #64748b; font-size: .875rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1.25rem 0 0; }
    .btn { display: inline-block; border-radius: .75rem; padding: .65rem 1.1rem; font-size: .875rem; font-weight: 600; border: 1px solid transparent; }
    .btn-primary { background: linear-gradient(90deg,#ea580c,#f59e0b); color: #fff; }
    .btn-secondary { background: rgba(15,23,42,.6); border-color: #475569; color: #e2e8f0; }
    .btn-ghost { border-color: #334155; color: #94a3b8; }
    .list { list-style: none; padding: 0; margin: .75rem 0 0; }
    .list li { padding: .25rem 0; font-size: .9rem; }
    .missions { list-style: none; padding: 0; margin: .75rem 0 0; display: grid; gap: .75rem; }
    .card { border: 1px solid #1e293b; background: rgba(15,23,42,.45); border-radius: .5rem; padding: .75rem; }
    .mission-title { font-weight: 600; color: #fff; font-size: .9rem; }
    .meta { display: flex; flex-wrap: wrap; gap: .5rem .75rem; margin-top: .35rem; font-size: .75rem; color: #94a3b8; }
    footer { color: #475569; font-size: .75rem; padding-bottom: 2rem; }
  </style>
</head>
<body data-seo="blueprint-page">
  <header>
    <div class="inner">
      <a class="brand" href="/blueprints/">Dumper's Repo</a>
      <div class="actions" style="margin:0">
        <a class="btn btn-primary" href="${escapeHtml(liveHref)}" ${guestClickAttr()}>Open in live tracker</a>
        <a class="btn btn-ghost" href="/#sign-in">Sign in</a>
      </div>
    </div>
  </header>
  <main>
    <p class="eyebrow">Star Citizen crafting blueprint</p>
    <h1>${escapeHtml(name)} Blueprint</h1>
    <p class="lead">${escapeHtml(description)}</p>
    <p class="muted">${escapeHtml(category)}${craft !== '—' ? ` · Craft time ${escapeHtml(craft)}` : ''}</p>
    <div class="actions">
      <a class="btn btn-primary" href="${escapeHtml(liveHref)}" ${guestClickAttr()}>Open in live blueprint tracker</a>
      <a class="btn btn-secondary" href="/targets/" ${guestClickAttr()}>Open Mission Tracker</a>
      <a class="btn btn-ghost" href="/blueprints/">All blueprints</a>
    </div>
    <h2>Materials</h2>
    ${materialsHtml}
    <h2>Reward missions</h2>
    ${missionsHtml}
  </main>
  <footer>
    <p>© 2026 Sinedrone Sentinel - All data is subject to change every patch</p>
    <p>Buy. Craft. Sell.</p>
  </footer>
</body>
</html>
`
}

if (!existsSync(distDir)) {
  throw new Error('dist/ missing — run vite build first')
}

const blueprints = blueprintsJson.blueprints || []
const slugMap = buildBlueprintSeoSlugMap(blueprints)
const byInternal = new Map()
for (const bp of blueprints) {
  if (!hasBlueprintSeoEntity(bp)) continue
  const key = blueprintInternalKey(bp)
  if (key) byInternal.set(key, bp)
}

// Clear previous per-slug dirs under dist/blueprints (keep catalog index.html from prerender)
const blueprintsDist = join(distDir, 'blueprints')
mkdirSync(blueprintsDist, { recursive: true })

const paths = []
let written = 0
for (const [internal, slug] of slugMap.entries()) {
  const bp = byInternal.get(internal)
  if (!bp) continue
  const dir = join(blueprintsDist, slug)
  // Remove stale dir contents by recreating
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), renderPage({ bp, slug }), 'utf8')
  paths.push(blueprintSeoPath(slug))
  written += 1
}

const manifest = {
  generatedAt: new Date().toISOString(),
  gameDataVersion: blueprintsJson.version || null,
  count: written,
  paths,
}
writeFileSync(join(distDir, 'blueprint-seo-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(
  `Generated ${written} blueprint SEO pages → dist/blueprints/{slug}/ (from game-blueprints.json${
    blueprintsJson.version ? ` ${blueprintsJson.version}` : ''
  })`
)
