/**
 * VirusTotal release gate for DumperApps.exe
 *
 * - Requires VT_API_KEY
 * - Uploads the file (large-file URL when >32MB)
 * - Polls until analysis completes
 * - Fails the process if malicious > VT_MAX_MALICIOUS (default 0)
 * - Writes dist sidecar files for the GitHub Release
 *
 * Usage: node scripts/ci/virustotal-release-gate.mjs <path-to-exe>
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const VT_API = 'https://www.virustotal.com/api/v3'
const LARGE_FILE_BYTES = 32 * 1024 * 1024
const POLL_MS = 20_000
const MAX_WAIT_MS = 15 * 60_000
const MIN_REQUEST_GAP_MS = 16_000 // free tier ~4 req/min

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

function maxMaliciousAllowed() {
  const raw = process.env.VT_MAX_MALICIOUS
  if (raw == null || raw === '') return 0
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) fail(`VT_MAX_MALICIOUS must be a non-negative integer (got ${raw})`)
  return n
}

async function uploadFile(filePath, apiKey) {
  const size = statSync(filePath).size
  const fileName = basename(filePath)
  const bytes = readFileSync(filePath)
  const form = new FormData()
  form.append('file', new Blob([bytes]), fileName)

  let uploadUrl = `${VT_API}/files`
  if (size > LARGE_FILE_BYTES) {
    console.log(`File is ${(size / (1024 * 1024)).toFixed(1)} MiB ? requesting large upload URL`)
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
      console.warn('VT rate limited while polling ? backing off 60s')
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

function listFlagged(results, categories) {
  const out = []
  for (const [engine, row] of Object.entries(results || {})) {
    if (categories.includes(row?.category)) {
      out.push(`${engine}: ${row.result || row.category}`)
    }
  }
  return out.sort()
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
  const maxMalicious = maxMaliciousAllowed()
  console.log(`SHA256 ${sha256}`)
  console.log(`VirusTotal permalink (after scan): ${permalink}`)
  console.log(`Gate: fail if malicious > ${maxMalicious}`)

  // Always upload/analyze this exact build so the report matches the release artifact.
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

  const maliciousEngines = listFlagged(attrs.results, ['malicious'])
  const suspiciousEngines = listFlagged(attrs.results, ['suspicious'])
  if (maliciousEngines.length) {
    console.log('Malicious engine hits:')
    for (const line of maliciousEngines) console.log(`  - ${line}`)
  }
  if (suspiciousEngines.length) {
    console.log('Suspicious engine hits:')
    for (const line of suspiciousEngines) console.log(`  - ${line}`)
  }

  const outDir = dirname(filePath)
  const report = {
    sha256,
    permalink,
    analysisId,
    stats: { malicious, suspicious, undetected, harmless },
    maliciousEngines,
    suspiciousEngines,
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
      `gatedAt=${report.gatedAt}`,
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(outDir, 'VIRUSTOTAL_RELEASE_FOOTER.md'),
    [
      '',
      '### VirusTotal',
      '',
      `- Report: ${permalink}`,
      `- Detections at publish gate: **${malicious} malicious** / ${suspicious} suspicious (undetected ${undetected})`,
      `- This Windows build is only published after a clean VirusTotal gate in CI.`,
      '',
    ].join('\n'),
    'utf8',
  )

  if (malicious > maxMalicious) {
    fail(
      `VirusTotal gate failed: ${malicious} malicious detection(s) (max allowed ${maxMalicious}). Refusing to publish DumperApps.exe. See ${permalink}`,
    )
  }

  if (suspicious > 0) {
    console.warn(
      `::warning::VirusTotal reported ${suspicious} suspicious detection(s). Publish continues (malicious=${malicious}). Review ${permalink}`,
    )
  }

  console.log(`VirusTotal gate passed. ${permalink}`)
}

main().catch((err) => fail(err?.stack || String(err)))
