/**
 * Shape the Information Archive into the Site Help bot's knowledge base.
 *
 * The Help bot answers "how do I do X on this site" and must answer ONLY from
 * what the Archive actually documents, so this is a straight re-shaping of the
 * same content the Archive page renders — no new prose, nothing invented here.
 *
 * Pure functions; the bake runner is scripts/build-help-knowledge-base.mjs.
 */

/** The whole payload rides in every prompt, so keep it honest about its size. */
export const HELP_KB_MAX_BYTES = 120_000
const MIN_PAGE_GUIDES = 20

export function buildHelpKnowledgeBase(source) {
  const pages = (source.PAGE_GUIDES ?? []).map((guide) => ({
    id: guide.id,
    title: guide.title,
    summary: guide.description,
    howTo: guide.details ?? [],
    relatedPages: guide.relatesTo ?? [],
  }))

  return {
    source: "Dumper's Repo Information Archive",
    pageCount: pages.length,
    pages,
    topics: {
      about: source.ABOUT_SECTION ?? null,
      offlineMode: source.OFFLINE_MODE_SECTION ?? null,
      dfp: source.DFP_SECTION ?? null,
      ratings: source.RATINGS_SECTION ?? null,
      orderLifecycle: source.ORDER_LIFECYCLE_SECTION ?? null,
      pendingReputation: source.PENDING_REP_SECTION ?? null,
      siteRules: source.SITE_RULES_SECTION ?? null,
      orderRules: source.ORDER_RULES_SECTION ?? null,
      orderingTips: source.ORDERING_TIPS_SECTION ?? null,
      tradeProtection: source.TRADE_PROTECTION_SECTION ?? null,
    },
    quickTips: source.ARCHIVE_TIPS ?? [],
    externalResources: source.EXTERNAL_RESOURCES ?? [],
  }
}

export function assertHelpKnowledgeBase(kb) {
  if (!kb?.pages?.length) throw new Error('Help knowledge base has no page guides')
  if (kb.pages.length < MIN_PAGE_GUIDES) {
    throw new Error(
      `Help knowledge base dropped to ${kb.pages.length} page guides (expected at least ${MIN_PAGE_GUIDES})`,
    )
  }
  for (const page of kb.pages) {
    if (!page.id || !page.title) throw new Error('Help knowledge base page is missing id/title')
    if (!page.howTo.length) {
      throw new Error(`Help knowledge base page "${page.title}" has no steps`)
    }
  }
  if (!kb.topics?.siteRules || !kb.topics?.dfp) {
    throw new Error('Help knowledge base is missing site rules or DFP sections')
  }
  const bytes = Buffer.byteLength(JSON.stringify(kb))
  if (bytes > HELP_KB_MAX_BYTES) {
    throw new Error(
      `Help knowledge base is ${bytes} bytes, over the ${HELP_KB_MAX_BYTES} prompt budget`,
    )
  }
  return true
}
