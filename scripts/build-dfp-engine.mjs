/**
 * Build canonical DFP engine bundle + version manifest for dumpers-repo.com hosting.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const outJs = path.join(root, 'public', 'dfp-engine.js')
const outVersion = path.join(root, 'public', 'dfp-version.json')
const entry = path.join(root, 'dfp-engine', 'formula.ts')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.dfpEngineVersion ?? '1.1.0-type-modifiers'

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: outJs,
  minify: true,
  legalComments: 'none',
  target: ['es2020'],
})

const bytes = fs.readFileSync(outJs)
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')

fs.writeFileSync(
  outVersion,
  JSON.stringify({ version, sha256, module: 'dfp-engine.js' }, null, 2) + '\n',
)

console.log('DFP engine built:', outJs, sha256.slice(0, 12) + '…')
