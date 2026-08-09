/**
 * VirusTotal release gate for DumperApps.exe
 *
 * - Requires VT_API_KEY
 * - Uploads the file (large-file URL when >32MB)
 * - Polls until analysis completes
 * - Classifies known unsigned-PyInstaller / ML heuristic false positives
 * - Fails only on unexplained malicious detections (or too many "known" hits)
 * - Writes dist sidecar files for the GitHub Release
 *
 * Usage: node scripts/ci/virustotal-release-gate.mjs <path-to-exe>
 *
 * Context: PyInstaller --onefile bootloaders are widely abused by malware and
 * unsigned builds routinely trip Microsoft Wacatac*!ml and a few noisy engines.
 * Authenticode (SignPath) is the real long-term fix; until then we gate on
 * unexplained detections while still publishing the full VT report.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const VT_API = 'https://www.virustotal.com/api/v3'
const LARGE_FILE_BYTES = 32 * 1024 * 1024
const POLL_MS = 20_000
const MAX_WAIT_MS = 15 * 60_000
const MIN_REQUEST_GAP_MS = 16_000 // free tier ~4 req/min

/** Safety valve: if "known FP" count exceeds this, refuse to publish. */
const DEFAULT_MAX_KNOWN_HEURISTICS = 12

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let lastRequestAt = 0
async function throttle() {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed)
  }
  lastRequestAt = Date.now()
}

async function vtFetch(pathOrUrl, apiKey, init = {}) {
  await throttle()
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${VT_API}${pathOrUrl}`
  const headers = new Headers(init.headers || {})
  headers.set('x-apikey', apiKey)
  if (!headers.has('accept')) headers.set('accept', 'application/json')
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { res, json, text }
}

function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

function intEnv(name, fallback) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) fail(`${name} must be a non-negative integer (got ${raw})`)
  return n
}

/**
 * Known noisy heuristics for unsigned PyInstaller onefile builds.
 * Keep this tight — unknown families must still fail the gate.
 */
function isKnownPackerHeuristic(engine, result) {
  const e = String(engine || '').toLowerCase()
  const r = String(result || '').toLowerCase()

  // Microsoft Defender ML heuristics (Wacatac / !ml) — notorious PyInstaller FPs
  if (e.includes('microsoft')) {
    if (r.includes('wacatac') || r.includes('wacapew') || r.includes('!ml')) return true
  }

  // Bkav often labels generic packed PE as W32.Malware.<hash>
  if (e === 'bkav' || e.startsWith('bkav')) {
    if (r.includes('w32.malware') || r.includes('malware')) return true
  }

  // Zillya Zapchast family frequently fires on packers / installers
  if (e === 'zillya' && r.includes('zapchast')) return true

  // APEX generic "Malicious" with no family name
  if (e === 'apex' && (r === 'malicious' || r === '' || r === 'null')) return true

  return false
}

async function uploadFile(filePath, apiKey) {
  const size = statSync(filePath).size
  const fileName = basename(filePath)
  const bytes = readFileSync(filePath)
  const form = new FormData()
  form.append('file', new Blob([bytes]), fileName)

  let uploadUrl = `${VT_API}/files`
  if (size > LARGE_FILE_BYTES) {
    console.log(`File is ${(size / (1024 * 1024)).toFixed(1)} MiB — requesting large upload URL`)
    const { res, json, text } = await vtFetch('/files/upload_url', apiKey)
    if (!res.ok) fail(`Failed to get VT upload URL (${res.status}): ${text.slice(0, 400)}`)
    uploadUrl = json?.data
    if (!uploadUrl) fail('VT upload_url response missing data URL')
  }

  console.log(`Uploading ${fileName} to VirusTotal...`)
  const { res, json, text } = await vtFetch(uploadUrl, apiKey, { method: 'POST', body: form })
  if (!res.ok) fail(`VT upload failed (${res.status}): ${text.slice(0, 400)}`)
  const analysisId = json?.data?.id
  if (!analysisId) fail('VT upload response missing analysis id')
  return analysisId
}

async function pollAnalysis(analysisId, apiKey) {
  const started = Date.now()
  while (Date.now() - started < MAX_WAIT_MS) {
    const { res, json, text } = await vtFetch(`/analyses/${analysisId}`, apiKey)
    if (res.status === 429) {
      console.warn('VT rate limited while polling — backing off 60s')
      await sleep(60_000)
      continue
    }
    if (!res.ok) fail(`VT analysis poll failed (${res.status}): ${text.slice(0, 400)}`)
    const status = json?.data?.attributes?.status
    console.log(`VT analysis status: ${status || 'unknown'}`)
    if (status === 'completed') {
      return json.data.attributes
    }
    await sleep(POLL_MS)
  }
  fail(`VT analysis did not complete within ${MAX_WAIT_MS / 1000}s`)
}

function classifyHits(results, categories) {
  const known = []
  const unexplained = []
  for (const [engine, row] of Object.entries(results || {})) {
    if (!categories.includes(row?.category)) continue
    const label = `${engine}: ${row.result || row.category}`
    if (row.category === 'malicious' && isKnownPackerHeuristic(engine, row.result)) {
      known.push(label)
    } else {
      unexplained.push(label)
    }
  }
  known.sort()
  unexplained.sort()
  return { known, unexplained }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) fail('Usage: node scripts/ci/virustotal-release-gate.mjs <path-to-exe>')

  const apiKey = process.env.VT_API_KEY || process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) {
    fail(
      'Missing VT_API_KEY secret. DumperApps.exe will not be published until VirusTotal gating is configured. See docs/TRUST_AND_SIGNING.md',
    )
  }

  try {
    statSync(filePath)
  } catch {
    fail(`File not found: ${filePath}`)
  }

  const sha256 = sha256File(filePath)
  const permalink = `https://www.virustotal.com/gui/file/${sha256}`
  const maxUnexplained = intEnv('VT_MAX_UNEXPLAINED_MALICIOUS', 0)
  const maxKnown = intEnv('VT_MAX_KNOWN_HEURISTICS', DEFAULT_MAX_KNOWN_HEURISTICS)

  console.log(`SHA256 ${sha256}`)
  console.log(`VirusTotal permalink (after scan): ${permalink}`)
  console.log(
    `Gate: fail if unexplained malicious > ${maxUnexplained} (known PyInstaller/ML heuristics allowed up to ${maxKnown})`,
  )

  const analysisId = await uploadFile(filePath, apiKey)
  const attrs = await pollAnalysis(analysisId, apiKey)
  const stats = attrs.stats || {}
  const malicious = Number(stats.malicious || 0)
  const suspicious = Number(stats.suspicious || 0)
  const undetected = Number(stats.undetected || 0)
  const harmless = Number(stats.harmless || 0)

  console.log(
    `VT stats: malicious=${malicious} suspicious=${suspicious} undetected=${undetected} harmless=${harmless}`,
  )

  const { known: knownMalicious, unexplained: unexplainedMalicious } = classifyHits(attrs.results, [
    'malicious',
  ])
  const { unexplained: unexplainedSuspicious } = classifyHits(attrs.results, ['suspicious'])

  if (knownMalicious.length) {
    console.log('Known packer/ML heuristic hits (allowed):')
    for (const line of knownMalicious) console.log(`  - ${line}`)
  }
  if (unexplainedMalicious.length) {
    console.log('Unexplained malicious hits (block publish):')
    for (const line of unexplainedMalicious) console.log(`  - ${line}`)
  }
  if (unexplainedSuspicious.length) {
    console.log('Suspicious hits:')
    for (const line of unexplainedSuspicious) console.log(`  - ${line}`)
  }

  const outDir = dirname(filePath)
  const report = {
    sha256,
    permalink,
    analysisId,
    stats: { malicious, suspicious, undetected, harmless },
    knownMalicious,
    unexplainedMalicious,
    unexplainedSuspicious,
    gatedAt: new Date().toISOString(),
  }
  writeFileSync(join(outDir, 'VIRUSTOTAL.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
  writeFileSync(
    join(outDir, 'VIRUSTOTAL.txt'),
    [
      permalink,
      `sha256=${sha256}`,
      `malicious=${malicious}`,
      `suspicious=${suspicious}`,
      `undetected=${undetected}`,
      `harmless=${harmless}`,
      `knownHeuristicMalicious=${knownMalicious.length}`,
      `unexplainedMalicious=${unexplainedMalicious.length}`,
      `gatedAt=${report.gatedAt}`,
      '',
    ].join('\n'),
    'utf8',
  )

  const footerLines = [
    '',
    '### VirusTotal',
    '',
    `- Report: ${permalink}`,
    `- Engines at publish gate: **${malicious} malicious** / ${suspicious} suspicious (undetected ${undetected})`,
  ]
  if (knownMalicious.length) {
    footerLines.push(
      `- ${knownMalicious.length} malicious hit(s) classified as known unsigned-PyInstaller / ML heuristics (allowed):`,
    )
    for (const line of knownMalicious) footerLines.push(`  - ${line}`)
  }
  footerLines.push(
    `- Unexplained malicious detections required to publish: **${unexplainedMalicious.length}** (max ${maxUnexplained}).`,
    `- Windows builds stay draft until this CI gate passes. Authenticode (SignPath) further reduces SmartScreen/ML noise when live.`,
    '',
  )
  writeFileSync(join(outDir, 'VIRUSTOTAL_RELEASE_FOOTER.md'), footerLines.join('\n'), 'utf8')

  if (unexplainedMalicious.length > maxUnexplained) {
    fail(
      `VirusTotal gate failed: ${unexplainedMalicious.length} unexplained malicious detection(s) (max ${maxUnexplained}). Refusing to publish. See ${permalink}`,
    )
  }

  if (knownMalicious.length > maxKnown) {
    fail(
      `VirusTotal gate failed: ${knownMalicious.length} known-heuristic hits exceeds safety cap ${maxKnown}. Refusing to publish. See ${permalink}`,
    )
  }

  if (knownMalicious.length) {
    console.warn(
      `::warning::Accepted ${knownMalicious.length} known PyInstaller/ML heuristic false positive(s). Full report: ${permalink}`,
    )
  }

  if (suspicious > 0) {
    console.warn(
      `::warning::VirusTotal reported ${suspicious} suspicious detection(s). Publish continues. Review ${permalink}`,
    )
  }

  console.log(`VirusTotal gate passed. ${permalink}`)
}

main().catch((err) => fail(err?.stack || String(err)))
