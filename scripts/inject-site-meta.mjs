import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteTs = readFileSync(join(root, 'src/config/site.ts'), 'utf8')

function readConst(name) {
  const match = siteTs.match(
    new RegExp(`export const ${name} =\\s*(['"\`][\\s\\S]*?['"\`])\\s+as const`)
  )
  if (!match) throw new Error(`Missing ${name} in site.ts`)
  const raw = match[1].trim()
  if (raw.startsWith("'") || raw.startsWith('"')) {
    return raw.slice(1, -1).replace(/\\'/g, "'")
  }
  const template = raw.match(/^`([\s\S]*)`$/)
  if (template) return template[1]
  throw new Error(`Unsupported ${name} format`)
}

const SITE_URL = readConst('SITE_URL')
const SITE_TITLE = readConst('SITE_TITLE')
const SITE_DESCRIPTION = readConst('SITE_DESCRIPTION')
const SITE_OG_IMAGE = `${SITE_URL}/og-image.png`

const replacements = [
  [/<title>[\s\S]*?<\/title>/, `<title>${SITE_TITLE}</title>`],
  [
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${SITE_DESCRIPTION}" />`,
  ],
  [
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${SITE_URL}/" />`,
  ],
  [
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${SITE_URL}/" />`,
  ],
  [
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${SITE_TITLE}" />`,
  ],
  [
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${SITE_DESCRIPTION}" />`,
  ],
  [
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${SITE_OG_IMAGE}" />`,
  ],
  [
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${SITE_TITLE}" />`,
  ],
  [
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${SITE_DESCRIPTION}" />`,
  ],
  [
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${SITE_OG_IMAGE}" />`,
  ],
]

function ensureOgImageExtras(html) {
  if (!html.includes('og:image:secure_url')) {
    html = html.replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${SITE_OG_IMAGE}" />\n    <meta property="og:image:secure_url" content="${SITE_OG_IMAGE}" />\n    <meta property="og:image:type" content="image/png" />`
    )
  }
  return html
}

function injectMeta(htmlPath) {
  let html = readFileSync(htmlPath, 'utf8')
  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement)
  }
  html = ensureOgImageExtras(html)
  if (!html.includes('og:image:alt')) {
    html = html.replace(
      /<meta property="og:image:height" content="630" \/>/,
      `<meta property="og:image:height" content="630" />\n    <meta property="og:image:alt" content="${SITE_TITLE}" />`
    )
  }
  writeFileSync(htmlPath, html)
}

injectMeta(join(root, 'index.html'))

const distIndex = join(root, 'dist', 'index.html')
try {
  injectMeta(distIndex)
  console.log('Injected site meta into dist/index.html')
} catch {
  // dist may not exist during dev-only runs
}

console.log('Injected site meta into index.html')
