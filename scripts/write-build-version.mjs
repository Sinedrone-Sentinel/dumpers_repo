import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const buildId = process.env.VITE_BUILD_ID || process.env.GITHUB_SHA?.slice(0, 7) || `local-${Date.now()}`

mkdirSync(distDir, { recursive: true })
writeFileSync(join(distDir, 'version.json'), JSON.stringify({ buildId }, null, 2))

// GitHub Pages: serve the SPA shell for deep links and hard refreshes on client routes
const indexPath = join(distDir, 'index.html')
const indexHtml = readFileSync(indexPath, 'utf8')
writeFileSync(join(distDir, '404.html'), indexHtml)
writeFileSync(join(distDir, '.nojekyll'), '')

console.log(`Wrote dist/version.json (buildId: ${buildId})`)
console.log('Wrote dist/404.html and dist/.nojekyll for GitHub Pages SPA routing')
