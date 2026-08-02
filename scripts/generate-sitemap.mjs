import { writeFileSync, readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { blueprintSeoPath, buildBlueprintSeoSlugMap } from './lib/blueprintSeoSlug.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteTs = readFileSync(join(root, 'src/config/site.ts'), 'utf8')
const seoTs = readFileSync(join(root, 'src/config/seo.ts'), 'utf8')

function readSiteUrl() {
  const match = siteTs.match(/export const SITE_URL =\s*(['"`])([\s\S]*?)\1\s+as const/)
  if (!match) throw new Error('Missing SITE_URL in site.ts')
  return match[2].replace(/\/$/, '')
}

function readStringArrayConst(name) {
  const match = seoTs.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`))
  if (!match) throw new Error(`Missing ${name} in seo.ts`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

function readBlueprintSeoPaths() {
  const manifestPath = join(root, 'dist', 'blueprint-seo-manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (Array.isArray(manifest.paths)) return manifest.paths
  }
  // Fallback if generator has not run yet
  const data = JSON.parse(readFileSync(join(root, 'src/data/game-blueprints.json'), 'utf8'))
  const blueprints = data.blueprints || []
  const map = buildBlueprintSeoSlugMap(blueprints)
  return [...map.values()].map((slug) => blueprintSeoPath(slug))
}

const siteUrl = readSiteUrl()
const prerenderPaths = readStringArrayConst('SEO_PRERENDER_PATHS')
const extraSitemap = [...seoTs.matchAll(/SEO_SITEMAP_PATHS[\s\S]*?'(\/[^']+\.html)'/g)].map(
  (m) => m[1]
)
const blueprintPaths = readBlueprintSeoPaths()
const paths = [
  ...new Set([...prerenderPaths, ...extraSitemap, '/archive-guide.html', ...blueprintPaths]),
]
const today = new Date().toISOString().slice(0, 10)

/** GitHub Pages serves prerendered dirs as /path/ (200). Bare /path 301s — avoid that in <loc>. */
function sitemapLoc(path) {
  if (path === '/') return `${siteUrl}/`
  if (path.endsWith('.html')) return `${siteUrl}${path}`
  const bare = path.endsWith('/') ? path.slice(0, -1) : path
  return `${siteUrl}${bare}/`
}

const urls = paths
  .map((path) => {
    const loc = sitemapLoc(path)
    const isBlueprintPage = path.startsWith('/blueprints/') && path !== '/blueprints/'
    const priority = path === '/' ? '1.0' : path.endsWith('.html') ? '0.6' : isBlueprintPage ? '0.7' : '0.8'
    const changefreq = isBlueprintPage ? 'weekly' : 'weekly'
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  })
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

const distPath = join(root, 'dist', 'sitemap.xml')
writeFileSync(distPath, xml)
console.log(
  `Wrote ${distPath} (${paths.length} URLs; ${blueprintPaths.length} blueprint SEO pages)`
)
