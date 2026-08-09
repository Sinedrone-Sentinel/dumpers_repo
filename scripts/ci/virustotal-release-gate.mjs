/**
 * VirusTotal release gate for DumperApps.exe
 *
 * - Requires VT_API_KEY
 * - Uploads the file (large-file URL when >32MB)
 * - Polls until analysis completes
 * - Gate modes (VT_GATE_MODE):
 *   - named (default): fail only on *named* malware-family labels; generic/ML hits warn but allow publish
 *   - strict: fail if malicious count > VT_MAX_MALICIOUS (default 0)
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

/** @returns {'named' | 'strict'} */
function gateMode() {
  const raw = String(process.env.VT_GATE_MODE || 'named').trim().toLowerCase()
  if (raw === 'named' || raw === 'strict') return raw
  fail(`VT_GATE_MODE must be "named" or "strict" (got ${process.env.VT_GATE_MODE})`)
}

/**
 * Classify a VT "malicious" engine result as generic/heuristic vs a named family.
 * Fail-closed: unknown labels are treated as named (block publish).
 *
 * @param {string} engine
 * @param {string} result
 * @returns {'generic' | 'named'}
 */
export function classifyMaliciousResult(engine, result) {
  const r = String(result || '').trim()
  const lower = r.toLowerCase()

  // Bare category labels with no family token
  if (!r || lower === 'malicious' || lower === 'malware' || lower === 'trojan' || lower === 'virus') {
    return 'generic'
  }

  // Well-known heuristic / ML / generic buckets (not concrete malware families)
  const genericPatterns = [
    /!ml\b/i,
    /\bml\.score\b/i,
    /\.ml\./i,
    /\bwacatac\b/i,
    /\bsusgen\b/i,
    /\bgeneric\b/i,
    /\bheur/i,
    /\bai[_-]?detect/i,
    /malware\.[0-9a-f]{6,}/i, // Bkav-style W32.Malware.<hex>
    /trojan\.win32\.save\.a/i, // Sangfor's classic generic
    /\bzapchast\b/i,
    /\briskware\b/i,
    /\bpua\b/i,
    /\bpup\b/i,
    /\bunwanted\b/i,
    /\bscore\b/i,
    /\bbehaves?[_-]?like\b/i,
    /\bstatic[_-]?ml\b/i,
  ]

  for (const re of genericPatterns) {
    if (re.test(r)) return 'generic'
  }

  // Engine name alone is not used — unknown concrete labels block.
  void engine
  return 'named'
}

function listFlagged(results, categories) {
  const out = []
  for (const [engine, row] of Object.entries(results || {})) {
    if (categories.includes(row?.category)) {
      out.push({ engine, result: row.result || row.category, category: row.category })
    }
  }
  return out.sort((a, b) => a.engine.localeCompare(b.engine))
}

function formatHit(hit) {
  return `${hit.engine}: ${hit.result}`
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
  const mode = gateMode()
  const maxMalicious = maxMaliciousAllowed()
  console.log(`SHA256 ${sha256}`)
  console.log(`VirusTotal permalink (after scan): ${permalink}`)
  if (mode === 'named') {
    console.log('Gate: named mode — fail only on named malware-family labels (generic/ML hits allowed)')
  } else {
    console.log(`Gate: strict mode — fail if malicious > ${maxMalicious}`)
  }

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

  const maliciousHits = listFlagged(attrs.results, ['malicious'])
  const suspiciousHits = listFlagged(attrs.results, ['suspicious'])
  const genericHits = []
  const namedHits = []
  for (const hit of maliciousHits) {
    if (classifyMaliciousResult(hit.engine, hit.result) === 'generic') genericHits.push(hit)
    else namedHits.push(hit)
  }

  if (maliciousHits.length) {
    console.log('Malicious engine hits:')
    for (const hit of maliciousHits) {
      const kind = classifyMaliciousResult(hit.engine, hit.result)
      console.log(`  - [${kind}] ${formatHit(hit)}`)
    }
  }
  if (suspiciousHits.length) {
    console.log('Suspicious engine hits:')
    for (const hit of suspiciousHits) console.log(`  - ${formatHit(hit)}`)
  }

  const outDir = dirname(filePath)
  const report = {
    sha256,
    permalink,
    analysisId,
    gateMode: mode,
    stats: { malicious, suspicious, undetected, harmless },
    maliciousEngines: maliciousHits.map(formatHit),
    suspiciousEngines: suspiciousHits.map(formatHit),
    genericMaliciousEngines: genericHits.map(formatHit),
    namedMaliciousEngines: namedHits.map(formatHit),
    gatedAt: new Date().toISOString(),
  }
  writeFileSync(join(outDir, 'VIRUSTOTAL.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
  writeFileSync(
    join(outDir, 'VIRUSTOTAL.txt'),
    [
      permalink,
      `sha256=${sha256}`,
      `gateMode=${mode}`,
      `malicious=${malicious}`,
      `namedMalicious=${namedHits.length}`,
      `genericMalicious=${genericHits.length}`,
      `suspicious=${suspicious}`,
      `undetected=${undetected}`,
      `harmless=${harmless}`,
      `gatedAt=${report.gatedAt}`,
      '',
    ].join('\n'),
    'utf8',
  )

  const gateSummary =
    mode === 'named'
      ? `**${namedHits.length} named-family** / ${genericHits.length} generic-ML malicious (${malicious} total) / ${suspicious} suspicious`
      : `**${malicious} malicious** / ${suspicious} suspicious (undetected ${undetected})`

  writeFileSync(
    join(outDir, 'VIRUSTOTAL_RELEASE_FOOTER.md'),
    [
      '',
      '### VirusTotal',
      '',
      `- Report: ${permalink}`,
      `- Detections at publish gate: ${gateSummary}`,
      mode === 'named'
        ? '- Publish requires **no named malware-family** malicious labels (generic/ML heuristic hits may still appear on VirusTotal).'
        : '- This Windows build is only published after a clean VirusTotal gate in CI.',
      '',
    ].join('\n'),
    'utf8',
  )

  if (mode === 'named') {
    if (namedHits.length > 0) {
      fail(
        `VirusTotal gate failed: ${namedHits.length} named malware-family detection(s). Refusing to publish DumperApps.exe. Named: ${namedHits.map(formatHit).join('; ')}. See ${permalink}`,
      )
    }
    if (genericHits.length > 0) {
      console.warn(
        `::warning::VirusTotal reported ${genericHits.length} generic/ML malicious hit(s); named-family gate allows publish. Review ${permalink}`,
      )
    }
  } else if (malicious > maxMalicious) {
    fail(
      `VirusTotal gate failed: ${malicious} malicious detection(s) (max allowed ${maxMalicious}). Refusing to publish DumperApps.exe. See ${permalink}`,
    )
  }

  if (suspicious > 0) {
    console.warn(
      `::warning::VirusTotal reported ${suspicious} suspicious detection(s). Publish continues. Review ${permalink}`,
    )
  }

  console.log(`VirusTotal gate passed (${mode}). ${permalink}`)
}

const isMain = process.argv[1] && basename(process.argv[1]) === 'virustotal-release-gate.mjs'
if (isMain) {
  main().catch((err) => fail(err?.stack || String(err)))
}
