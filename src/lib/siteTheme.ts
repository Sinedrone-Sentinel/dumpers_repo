/**
 * Site theme catalog — visual source of truth lives in `src/index.css` (`.site-*`).
 *
 * Use these class names (or the CSS classes directly) for new UI. Prefer tokens over
 * raw `bg-slate-800 border-slate-600` so look updates stay in one CSS file.
 *
 * Prerender / SEO landing may keep bespoke layouts; member app chrome should use this.
 */

/** Layout & atmosphere */
export const sitePage = {
  bg: 'site-page-bg',
  shell: 'site-shell',
  header: 'site-app-header',
  headerOffset: 'site-header-offset',
  tickerOffset: 'site-ticker-offset',
  footer: 'site-footer',
  title: 'site-page-title',
  subtitle: 'site-page-subtitle',
  headerRule: 'site-header-rule',
} as const

/** Surfaces */
export const siteSurface = {
  glass: 'site-glass',
  surface: 'site-surface',
  card: 'site-card',
  cardAcquired: 'site-card site-card-acquired',
  panel: 'site-panel',
  panelLead: 'site-panel-lead',
  section: 'site-section',
  sectionHeader: 'site-section-header',
  sectionBody: 'site-section-body',
  chipStrip: 'site-chip-strip',
  menuPanel: 'site-menu-panel',
  menuItem: 'site-menu-item',
  menuItemActive: 'site-menu-item site-menu-item-active',
  menuItemLocked: 'site-menu-item site-menu-item-locked',
  menuChildRail: 'site-menu-child-rail',
  menuSection: 'site-menu-section',
  divider: 'site-divider',
  modalShell: 'site-modal-shell',
  modalBackdrop: 'site-modal-backdrop',
  empty: 'site-empty',
} as const

/** Form controls */
export const siteForm = {
  input: 'site-input',
  textarea: 'site-textarea',
  label: 'site-label',
  hint: 'site-hint',
  error: 'site-error-text',
  checkbox: 'site-checkbox',
  radio: 'site-radio',
  range: 'site-range',
  toggle: 'site-toggle',
} as const

/** Buttons — pair with `site-btn-shimmer` when a hover sweep is wanted */
export const siteBtn = {
  primary: 'site-btn-primary',
  secondary: 'site-btn-secondary',
  danger: 'site-btn-danger',
  success: 'site-btn-success',
  accent: 'site-btn-accent',
  ghost: 'site-btn-ghost',
  icon: 'site-btn-icon',
  shimmer: 'site-btn-shimmer',
  burn: 'site-btn-burn',
  chrome: 'site-chrome-control',
} as const

/** Filters / tabs / chips */
export const siteFilter = {
  idle: 'site-filter-idle',
  orange: 'site-filter-selected-orange',
  blue: 'site-filter-selected-blue',
  green: 'site-filter-selected-green',
  amber: 'site-filter-selected-amber',
  red: 'site-filter-selected-red',
  purple: 'site-filter-selected-purple',
  cyan: 'site-filter-selected-cyan',
  slate: 'site-filter-selected-slate',
} as const

/** Nav */
export const siteNav = {
  link: 'site-nav-link',
  active: 'site-nav-link site-nav-link-active',
  idle: 'site-nav-link site-nav-link-idle',
} as const

/** Overlays / lists / feedback */
export const siteOverlay = {
  dropdownList: 'site-dropdown-list',
  dropdownItem: 'site-dropdown-item',
  dropdownItemActive: 'site-dropdown-item site-dropdown-item-active',
  tooltip: 'site-tooltip-panel',
  tickerBar: 'site-ticker-bar',
  tickerSheet: 'site-glass-ticker',
  listRow: 'site-list-row',
  tableWrap: 'site-table-wrap',
  table: 'site-table',
  progress: 'site-progress',
  progressBar: 'site-progress-bar',
} as const

/** Banners & badges */
export const siteFeedback = {
  bannerWarn: 'site-banner-warn',
  bannerError: 'site-banner-error',
  bannerInfo: 'site-banner-info',
  bannerSuccess: 'site-banner-success',
  badgeAmber: 'site-badge-amber',
  badgeOrange: 'site-badge-orange',
  badgeGreen: 'site-badge-green',
  badgeRed: 'site-badge-red',
  badgeSlate: 'site-badge-slate',
} as const
