/**
 * Bake the Information Archive into the Site Help bot's knowledge base.
 *
 * Bundles the same TypeScript the Archive page renders (esbuild -> dynamic import,
 * the trick generate-archive-guide.mjs already uses) and writes a compact JSON
 * payload the Edge Function injects into its system prompt.
 *
 * Runs as part of `npm run generate-archive-guide`, which itself runs at the end
 * of `npm run build` — so editing a page guide keeps the bot current for free.
 *
 * Output: supabase/functions/site-help-bot/knowledge.json
 */
import { buildSync } from 'esbuild'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { assertHelpKnowledgeBase, buildHelpKnowledgeBase } from './lib/helpKnowledgeBase.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const cacheDir = join(__dirname, '.cache')
const bundlePath = join(cacheDir, 'archiveGuideContent.mjs')
const destDir = join(root, 'supabase/functions/site-help-bot')
const dest = join(destDir, 'knowledge.json')

mkdirSync(cacheDir, { recursive: true })

buildSync({
  entryPoints: [join(root, 'src/lib/archiveGuide/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
  logLevel: 'silent',
})

const content = await import(pathToFileURL(bundlePath).href)
const knowledge = buildHelpKnowledgeBase(content)
assertHelpKnowledgeBase(knowledge)

mkdirSync(destDir, { recursive: true })
writeFileSync(dest, JSON.stringify(knowledge) + '\n', 'utf8')

const bytes = Buffer.byteLength(JSON.stringify(knowledge))
console.log(
  `Wrote help knowledge base (${knowledge.pages.length} page guides, ${bytes} bytes) -> supabase/functions/site-help-bot/knowledge.json`,
)
