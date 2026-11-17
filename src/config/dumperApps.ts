/** Dumper Apps page — BP Dumper, StarOrg-Strings, RSI+. */

export const DUMPER_APPS_PATH = '/dumper-apps' as const

export type DumperAppTabId = 'bp-dumper' | 'starorg-strings' | 'rsi-plus'

export const DUMPER_APP_TABS: {
  id: DumperAppTabId
  label: string
  shortLabel: string
}[] = [
  { id: 'bp-dumper', label: 'BP Dumper', shortLabel: 'BP Dumper' },
  { id: 'starorg-strings', label: 'StarOrg Codex', shortLabel: 'Codex' },
  { id: 'rsi-plus', label: 'RSI+', shortLabel: 'RSI+' },
]

export const DEFAULT_DUMPER_APP_TAB: DumperAppTabId = 'bp-dumper'

export function parseDumperAppTab(raw: unknown): DumperAppTabId {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'starorg-strings' || value === 'starorg' || value === 'codex') return 'starorg-strings'
  if (value === 'rsi-plus' || value === 'rsi+' || value === 'rsi') return 'rsi-plus'
  if (value === 'bp-dumper' || value === 'bp' || value === 'dumper') return 'bp-dumper'
  return DEFAULT_DUMPER_APP_TAB
}

/** StarOrg Codex (starorg-strings) GitHub releases. */
export const STARORG_STRINGS_REPO = 'voidput/starorg-strings' as const
export const STARORG_STRINGS_RELEASES_API =
  `https://api.github.com/repos/${STARORG_STRINGS_REPO}/releases/latest` as const
export const STARORG_STRINGS_RELEASES_PAGE =
  `https://github.com/${STARORG_STRINGS_REPO}/releases` as const
export const STARORG_STRINGS_DISPLAY_NAME = 'StarOrg-Strings' as const
export const STARORG_STRINGS_PRODUCT_NAME = 'StarOrg Codex' as const

/** Microsoft Store product StarOrg Codex. Recommended Windows install. */
export const STARORG_CODEX_STORE_PRODUCT_ID = '9NWHZD6MLMLD' as const

export const STARORG_CODEX_STORE_URL =
  `https://apps.microsoft.com/detail/${STARORG_CODEX_STORE_PRODUCT_ID}` as const

/**
 * RSI+ Chrome Web Store listing (StarOrg).
 * Extension id jpdcafgdkkhgffohcddpebmippacbide — update if the listing URL changes.
 */
export const RSI_PLUS_DISPLAY_NAME = 'RSI+' as const
export const RSI_PLUS_CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/rsi+/jpdcafgdkkhgffohcddpebmippacbide' as const
