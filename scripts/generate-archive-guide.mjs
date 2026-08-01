import { buildSync } from 'esbuild'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const cacheDir = join(__dirname, '.cache')
const bundlePath = join(cacheDir, 'archiveGuideContent.mjs')

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

const {
  ARCHIVE_GUIDE_META,
  ABOUT_SECTION,
  SITE_RULES_SECTION,
  OFFLINE_MODE_SECTION,
  DFP_SECTION,
  RATINGS_SECTION,
  ORDER_LIFECYCLE_SECTION,
  PENDING_REP_SECTION,
  ORDER_RULES_SECTION,
  ORDERING_TIPS_SECTION,
  TRADE_PROTECTION_SECTION,
  PAGE_GUIDES,
  ARCHIVE_TIPS,
  DATA_SOURCES,
  EXTERNAL_RESOURCES,
  ORGANIZATIONS,
  ARCHIVE_DISCLAIMER,
  PRINTABLE_TOC,
} = content

/** Convert lightweight **bold** markers to HTML. No site URLs. */
function rich(text) {
  const escaped = escapeHtml(text)
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ul(items) {
  return `<ul>${items.map((item) => `<li>${rich(item)}</li>`).join('')}</ul>`
}

function card(title, body, variant = '') {
  return `<div class="card ${variant}"><h4>${escapeHtml(title)}</h4>${body}</div>`
}

function sectionWrap(id, title, inner, pageBreak = false) {
  return `<section id="${id}"${pageBreak ? ' class="page-break"' : ''}>
  <h2>${escapeHtml(title)}</h2>
  <div class="section">${inner}</div>
</section>`
}

function toc() {
  const items = PRINTABLE_TOC.map(
    (entry) => `<li><a href="#${entry.id}">${escapeHtml(entry.label)}</a></li>`
  ).join('\n    ')
  return `<nav class="toc">
  <h3>Table of Contents</h3>
  <ul>
    ${items}
  </ul>
</nav>`
}

function pageGuidesHtml() {
  return PAGE_GUIDES.map(
    (guide) => `<h3 id="page-${guide.id}">${escapeHtml(guide.title)}</h3>
  <div class="section">
    <p>${escapeHtml(guide.description)}</p>
    ${ul(guide.details)}
    ${guide.relatesTo.length ? `<p><em>Related to: ${escapeHtml(guide.relatesTo.join(' • '))}</em></p>` : ''}
  </div>`
  ).join('\n  ')
}

const generatedAt = new Date().toISOString().slice(0, 10)

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ARCHIVE_GUIDE_META.documentTitle)}</title>
  <style>
    :root {
      --orange: #f97316;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-500: #64748b;
      --slate-400: #94a3b8;
      --slate-300: #cbd5e1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #cbd5e1;
      line-height: 1.6;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    @media print {
      body { background: white; color: #1e293b; padding: 0; }
      .page-break { page-break-before: always; }
      a[href^="#"] { color: inherit; text-decoration: none; }
      .no-print { display: none; }
    }
    h1 { color: var(--orange); font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { color: var(--orange); font-size: 1.5rem; margin: 2rem 0 1rem; border-bottom: 1px solid var(--slate-700); padding-bottom: 0.5rem; }
    h3 { color: #fbbf24; font-size: 1.1rem; margin: 1.5rem 0 0.75rem; }
    h4 { color: var(--slate-300); font-size: 1rem; margin: 1rem 0 0.5rem; }
    p { margin-bottom: 1rem; }
    .subtitle { color: var(--slate-400); font-size: 1rem; margin-bottom: 2rem; }
    .meta { color: var(--slate-500); font-size: 0.85rem; margin-bottom: 1.5rem; }
    .toc { background: var(--slate-800); border: 1px solid var(--slate-700); border-radius: 8px; padding: 1.5rem; margin: 2rem 0; }
    .toc h3 { margin-top: 0; color: var(--slate-300); }
    .toc ul { list-style: none; margin: 0; }
    .toc li { margin: 0.5rem 0; }
    .toc a { color: var(--orange); text-decoration: none; }
    .section { background: var(--slate-800); border: 1px solid var(--slate-700); border-radius: 8px; padding: 1.5rem; margin: 1.5rem 0; }
    .section.highlight { border-color: var(--orange); }
    ul, ol { margin: 1rem 0 1rem 1.5rem; }
    li { margin: 0.5rem 0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1rem 0; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .card { background: rgba(15, 23, 42, 0.5); border: 1px solid var(--slate-700); border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .card.green { border-color: #22c55e40; }
    .card.green h4 { color: #4ade80; }
    .card.amber { border-color: #f59e0b40; }
    .card.amber h4 { color: #fbbf24; }
    .card.blue { border-color: #3b82f640; }
    .card.blue h4 { color: #60a5fa; }
    .card.red { border-color: #ef444440; }
    .card.red h4 { color: #f87171; }
    .card.purple { border-color: #a855f740; }
    .card.purple h4 { color: #c084fc; }
    .note { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .note.warning { background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); }
    .note.danger { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); }
    hr { border: none; border-top: 1px solid var(--slate-700); margin: 2rem 0; }
    footer { text-align: center; color: var(--slate-500); font-size: 0.8rem; margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--slate-700); }
  </style>
</head>
<body>

<h1>${escapeHtml(ARCHIVE_GUIDE_META.title)}</h1>
<p class="subtitle">${escapeHtml(ARCHIVE_GUIDE_META.subtitle)}</p>
<p class="meta">Printable archive guide · Generated ${generatedAt} · Use the table of contents for offline navigation</p>

${toc()}

${sectionWrap(
  ABOUT_SECTION.id,
  ABOUT_SECTION.title,
  ABOUT_SECTION.paragraphs.map((p) => `<p>${rich(p)}</p>`).join('\n    ')
)}

${sectionWrap(
  SITE_RULES_SECTION.id,
  SITE_RULES_SECTION.title,
  `<p>${rich(SITE_RULES_SECTION.intro)}</p>
    ${SITE_RULES_SECTION.groups
      .map((group) => card(group.title, ul(group.items)))
      .join('\n    ')}`
)}

${sectionWrap(
  OFFLINE_MODE_SECTION.id,
  OFFLINE_MODE_SECTION.title,
  `<p>${rich(OFFLINE_MODE_SECTION.intro)}</p>
    <div class="grid">
      ${card('What Works Offline', ul(OFFLINE_MODE_SECTION.worksOffline), 'green')}
      ${card('Members-Only Features', ul(OFFLINE_MODE_SECTION.membersOnly), 'amber')}
    </div>
    <div class="note"><h4>Data Migration</h4><p>${rich(OFFLINE_MODE_SECTION.migration)}</p></div>
    <p><em>${escapeHtml(OFFLINE_MODE_SECTION.footnote)}</em></p>`
)}

${sectionWrap(
  DFP_SECTION.id,
  DFP_SECTION.title,
  `<div class="section highlight">
    ${card('The Problem', `<p>${escapeHtml(DFP_SECTION.problem.body)}</p>`, 'red')}
    ${card('The Solution', `<p>${rich(DFP_SECTION.solution.intro)}</p>${ul(DFP_SECTION.solution.bullets)}`, 'green')}
    ${card('The Goal', `<p>${escapeHtml(DFP_SECTION.goal.body)}</p>`, 'blue')}
  </div>`,
  true
)}

${sectionWrap(
  ORDER_LIFECYCLE_SECTION.id,
  ORDER_LIFECYCLE_SECTION.title,
  `<p>${rich(ORDER_LIFECYCLE_SECTION.intro)}</p>
    ${ORDER_LIFECYCLE_SECTION.steps
      .map((step) => card(step.title, `<p>${rich(step.body)}</p>`, 'blue'))
      .join('\n    ')}
    <div class="note"><p><strong>Reminders:</strong></p>${ul(ORDER_LIFECYCLE_SECTION.reminders)}</div>`
)}

${sectionWrap(
  RATINGS_SECTION.id,
  RATINGS_SECTION.title,
  `<p>${rich(RATINGS_SECTION.intro)}</p>
    ${card(RATINGS_SECTION.wtbWts.title, ul(RATINGS_SECTION.wtbWts.items))}
    <div class="grid">
      ${card(RATINGS_SECTION.asBuyer.title, ul(RATINGS_SECTION.asBuyer.items), 'green')}
      ${card(RATINGS_SECTION.asSeller.title, ul(RATINGS_SECTION.asSeller.items), 'purple')}
    </div>
    <div class="note warning"><p><strong>Note:</strong> ${escapeHtml(RATINGS_SECTION.note)}</p></div>`
)}

${sectionWrap(
  PENDING_REP_SECTION.id,
  PENDING_REP_SECTION.title,
  `<p>${rich(PENDING_REP_SECTION.intro)}</p>
    <div class="grid">
      ${card(PENDING_REP_SECTION.buyerLimits.title, ul(PENDING_REP_SECTION.buyerLimits.items), 'green')}
      ${card(PENDING_REP_SECTION.sellerLimits.title, ul(PENDING_REP_SECTION.sellerLimits.items), 'purple')}
    </div>
    <div class="note"><p><strong>Important:</strong> ${rich(PENDING_REP_SECTION.important)}</p></div>`
)}

${sectionWrap(
  ORDER_RULES_SECTION.id,
  ORDER_RULES_SECTION.title,
  `<p>${rich(ORDER_RULES_SECTION.intro)}</p>
    ${card('✓ ' + ORDER_RULES_SECTION.expected.title, ul(ORDER_RULES_SECTION.expected.items), 'green')}
    ${card('✗ ' + ORDER_RULES_SECTION.notAllowed.title, ul(ORDER_RULES_SECTION.notAllowed.items), 'red')}
    ${card('⚠ ' + ORDER_RULES_SECTION.pendingRep.title, ul(ORDER_RULES_SECTION.pendingRep.items), 'amber')}
    ${card('⏱ ' + ORDER_RULES_SECTION.timeLimits.title, ul(ORDER_RULES_SECTION.timeLimits.items), 'blue')}
    <div class="note danger">
      <h4>${escapeHtml(ORDER_RULES_SECTION.consequences.title)}</h4>
      ${ul(ORDER_RULES_SECTION.consequences.items)}
      <p><em>${escapeHtml(ORDER_RULES_SECTION.consequences.note)}</em></p>
    </div>`,
  true
)}

${sectionWrap(
  ORDERING_TIPS_SECTION.id,
  ORDERING_TIPS_SECTION.title,
  `${ORDERING_TIPS_SECTION.intros.map((p) => `<p>${rich(p)}</p>`).join('\n    ')}
    ${ORDERING_TIPS_SECTION.tips
      .map((tip) => card((tip.variant === 'amber' ? '⚠ ' : '✓ ') + tip.title, `<p>${rich(tip.body)}</p>`, tip.variant))
      .join('\n    ')}
    <div class="note"><p><strong>Tip:</strong> ${escapeHtml(ORDERING_TIPS_SECTION.closingTip)}</p></div>`
)}

${sectionWrap(
  TRADE_PROTECTION_SECTION.id,
  TRADE_PROTECTION_SECTION.title,
  `<p>${escapeHtml(TRADE_PROTECTION_SECTION.intro)}</p>
    ${ul(TRADE_PROTECTION_SECTION.items)}
    <p><em>${rich(TRADE_PROTECTION_SECTION.evidenceNote)}</em></p>`
)}

<section id="page-guides" class="page-break">
  <h2>Page-by-Page Guide</h2>
  ${pageGuidesHtml()}
</section>

${sectionWrap(
  'archive-tips',
  'Quick Tips',
  `<div class="grid">${ARCHIVE_TIPS.map((tip) => card(tip.title, `<p>${escapeHtml(tip.content)}</p>`)).join('')}</div>`
)}

${sectionWrap(
  'data-sources',
  'Data Sources & Attribution',
  `<div class="grid">${DATA_SOURCES.map((source) => card(source.title, `<p>${escapeHtml(source.content)}</p>`)).join('')}</div>
    <p><em>${escapeHtml(ARCHIVE_DISCLAIMER)}</em></p>`
)}

${sectionWrap(
  'external-resources',
  'External Resources',
  `<p>The following external sites provide additional Star Citizen tools and information (names only — look them up when online):</p>
    ${ul(EXTERNAL_RESOURCES.map((r) => `**${r.title}** — ${r.description}`))}
    <h4>Organizations</h4>
    ${ul(
      ORGANIZATIONS.map((org) =>
        org.badge ? `**${org.title}** (${org.badge}) — ${org.description}` : `**${org.title}** — ${org.description}`
      )
    )}`
)}

<hr>

<footer>
  <p><strong>${escapeHtml(ARCHIVE_GUIDE_META.title)}</strong> — Complete Archive Guide</p>
  <p>Generated ${generatedAt} from the live Archive content module.</p>
  <p class="no-print">To save as PDF: use your browser Print (Ctrl+P / Cmd+P) and choose Save as PDF. Internal links (#sections) work in most PDF viewers.</p>
</footer>

</body>
</html>
`

const outPath = join(root, 'public/archive-guide.html')
writeFileSync(outPath, html, 'utf8')
console.log(`Wrote ${outPath}`)
