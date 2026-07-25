/**
 * Prerender public/offline routes so GitHub Pages serves real HTML to crawlers.
 * Requires: npm i -D playwright && npx playwright install chromium
 */
import { createServer } from 'http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { dirname, extname, join, normalize } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const seoTs = readFileSync(join(root, 'src/config/seo.ts'), 'utf8')
const guestKey = 'dumpers_guest_preview'

function readPrerenderPaths() {
  const match = seoTs.match(
    /export const SEO_PRERENDER_PATHS = \[([\s\S]*?)\] as const/
  )
  if (!match) throw new Error('Missing SEO_PRERENDER_PATHS in seo.ts')
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

function contentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function resolveStatic(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] || '/')
  const candidates = []
  if (clean === '/') {
    candidates.push(join(distDir, 'index.html'))
  } else {
    const rel = clean.replace(/^\//, '').replace(/\/$/, '')
    candidates.push(join(distDir, rel))
    candidates.push(join(distDir, `${rel}.html`))
    candidates.push(join(distDir, rel, 'index.html'))
  }
  // SPA fallback
  candidates.push(join(distDir, '404.html'))
  candidates.push(join(distDir, 'index.html'))

  for (const candidate of candidates) {
    const normalized = normalize(candidate)
    if (!normalized.startsWith(distDir)) continue
    if (existsSync(normalized) && statSync(normalized).isFile()) return normalized
  }
  return null
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const filePath = resolveStatic(req.url || '/')
      if (!filePath) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': contentType(filePath) })
      res.end(readFileSync(filePath))
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port })
    })
  })
}

function outFileForPath(urlPath) {
  if (urlPath === '/') return join(distDir, 'index.html')
  const rel = urlPath.replace(/^\//, '').replace(/\/$/, '')
  return join(distDir, rel, 'index.html')
}

async function prerenderPath(browser, baseUrl, urlPath) {
  const page = await browser.newPage()
  const useGuest = urlPath !== '/'
  await page.addInitScript(
    ([key, value]) => {
      sessionStorage.setItem(key, value)
    },
    [guestKey, useGuest ? '1' : '0']
  )

  const target = `${baseUrl}${urlPath === '/' ? '/' : urlPath}`
  await page.goto(target, { waitUntil: 'networkidle', timeout: 120_000 })

  // Landing or app chrome should be present
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || ''
      return text.length > 200 && !text.includes('Bootstrapping')
    },
    { timeout: 90_000 }
  )

  // Give route meta / paint a beat
  await page.waitForTimeout(500)

  let html = await page.content()
  if (!html.includes('<!DOCTYPE') && !html.includes('<!doctype')) {
    html = `<!DOCTYPE html>${html}`
  }

  const outPath = outFileForPath(urlPath)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html)
  await page.close()
  console.log(`Prerendered ${urlPath} → ${outPath.replace(root + '\\', '').replace(root + '/', '')}`)
}

async function main() {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error('dist/index.html missing — run vite build first')
  }

  // Ensure 404 shell exists for SPA deep links during crawl
  if (!existsSync(join(distDir, '404.html'))) {
    writeFileSync(join(distDir, '404.html'), readFileSync(join(distDir, 'index.html')))
  }

  const paths = readPrerenderPaths()
  const { server, port } = await startStaticServer()
  const baseUrl = `http://127.0.0.1:${port}`
  console.log(`Prerender server on ${baseUrl}`)

  const browser = await chromium.launch({ headless: true })
  try {
    // Landing first (overwrites index.html), then tool routes
    for (const urlPath of paths) {
      await prerenderPath(browser, baseUrl, urlPath)
    }
  } finally {
    await browser.close()
    server.close()
  }

  console.log(`Prerender complete (${paths.length} routes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
