import { supabase } from './supabase'

const VISITOR_STORAGE_KEY = 'dumpers_visitor_id'
const GEO_RESOLVED_STORAGE_KEY = 'dumpers_analytics_geo_resolved_v1'
const HEARTBEAT_MS = 60_000
const MAX_PING_SECONDS = 300

const SKIP_PATH_PREFIXES = [
  '/analytics',
  '/support-dashboard',
  '/discord-subscribe',
  '/theme-preview',
  '/privacy',
]

export type AnalyticsContext = {
  isGuest: boolean
  isSuperAdmin?: boolean
}

type ToolSegment = {
  toolId: string
  subToolId: string
}

let context: AnalyticsContext = { isGuest: false, isSuperAdmin: false }
let currentSegment: ToolSegment | null = null
let segmentStartedAt: number | null = null
let pendingMs = 0
let isDocumentVisible = typeof document !== 'undefined'
  ? document.visibilityState !== 'hidden'
  : true
let initialized = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function isEnabled(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function shouldTrack(): boolean {
  return isEnabled() && !context.isSuperAdmin
}

export function getAnalyticsVisitorId(): string {
  let id = localStorage.getItem(VISITOR_STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_STORAGE_KEY, id)
  }
  return id
}

function visitorNeedsGeoLookup(visitorId: string): boolean {
  return localStorage.getItem(GEO_RESOLVED_STORAGE_KEY) !== visitorId
}

function markVisitorGeoLookupAttempted(visitorId: string): void {
  localStorage.setItem(GEO_RESOLVED_STORAGE_KEY, visitorId)
}

async function recordAnalyticsPingRpc(payload: {
  visitor_id: string
  tool_id: string
  sub_tool_id: string
  active_seconds: number
  is_guest: boolean
}): Promise<void> {
  await supabase.rpc('record_analytics_ping', {
    p_visitor_id: payload.visitor_id,
    p_tool_id: payload.tool_id,
    p_sub_tool_id: payload.sub_tool_id,
    p_active_seconds: payload.active_seconds,
    p_is_guest: payload.is_guest,
  })
}

/**
 * Routine pings use PostgREST RPC (not Edge). Edge is only for the one-time
 * geo lookup per visitor — IP is available on the function request, not via RPC.
 */
async function recordAnalyticsPing(payload: {
  visitor_id: string
  tool_id: string
  sub_tool_id: string
  active_seconds: number
  is_guest: boolean
  needs_geo: boolean
}): Promise<void> {
  if (payload.needs_geo) {
    const { error } = await supabase.functions.invoke('record-analytics-ping', {
      body: payload,
    })
    // Always mark attempted so a failing Edge path cannot spam invocations every minute.
    markVisitorGeoLookupAttempted(payload.visitor_id)
    if (!error) return
  }

  await recordAnalyticsPingRpc(payload)
}

function normalizeSubTool(subToolId?: string): string {
  return (subToolId ?? '').trim().slice(0, 64)
}

function pathToTool(pathname: string): string | null {
  if (SKIP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null
  }

  if (pathname === '/' || pathname.startsWith('/blueprints')) return 'blueprints'
  if (pathname.startsWith('/wikelo')) return 'wikelo'
  if (pathname.startsWith('/targets')) return 'mission_tracker'
  if (pathname.startsWith('/resources')) return 'resource_tracker'
  if (pathname.startsWith('/mining-tracker')) return 'mining_tracker'
  if (pathname.startsWith('/commodity-lookup')) return 'commodity_lookup'
  if (pathname.startsWith('/orders')) return 'custom_orders'
  if (pathname.startsWith('/bazaar')) return 'fulfillment'
  if (pathname.startsWith('/archive')) return 'archive'
  if (pathname.startsWith('/partnership')) return 'partnership'
  if (pathname.startsWith('/guest-locked')) return 'guest_locked'

  return null
}

function accumulateVisibleTime() {
  if (!segmentStartedAt) return
  pendingMs += Date.now() - segmentStartedAt
  segmentStartedAt = null
}

function startSegmentTimer() {
  if (!shouldTrack() || !currentSegment || !isDocumentVisible) return
  segmentStartedAt = Date.now()
}

async function flushPendingTime() {
  if (!shouldTrack() || !currentSegment) return

  accumulateVisibleTime()
  const seconds = Math.min(Math.round(pendingMs / 1000), MAX_PING_SECONDS)
  pendingMs = 0

  if (seconds <= 0) return

  try {
    const visitorId = getAnalyticsVisitorId()
    const needsGeo = visitorNeedsGeoLookup(visitorId)

    await recordAnalyticsPing({
      visitor_id: visitorId,
      tool_id: currentSegment.toolId,
      sub_tool_id: currentSegment.subToolId,
      active_seconds: seconds,
      is_guest: context.isGuest,
      needs_geo: needsGeo,
    })
  } catch {
    // Analytics must never break the app.
  }
}

function setSegment(toolId: string, subToolId = '') {
  if (!shouldTrack()) return

  const next: ToolSegment = {
    toolId,
    subToolId: normalizeSubTool(subToolId),
  }

  const sameTool =
    currentSegment?.toolId === next.toolId &&
    currentSegment?.subToolId === next.subToolId

  if (sameTool) return

  void flushPendingTime()
  currentSegment = next
  startSegmentTimer()
}

export function trackAnalyticsRoute(pathname: string) {
  const toolId = pathToTool(pathname)
  if (!toolId) {
    void flushPendingTime()
    currentSegment = null
    segmentStartedAt = null
    pendingMs = 0
    return
  }

  setSegment(toolId)
}

export function setAnalyticsSubTool(subToolId: string) {
  if (!currentSegment) return
  setSegment(currentSegment.toolId, subToolId)
}

export function updateAnalyticsContext(next: AnalyticsContext) {
  const wasTracking = shouldTrack()
  context = next
  const nowTracking = shouldTrack()

  if (wasTracking && !nowTracking) {
    void flushPendingTime()
    currentSegment = null
    segmentStartedAt = null
    pendingMs = 0
    return
  }

  if (!wasTracking && nowTracking && currentSegment) {
    startSegmentTimer()
  }
}

function handleVisibilityChange() {
  const visible = document.visibilityState !== 'hidden'
  if (visible === isDocumentVisible) return

  isDocumentVisible = visible

  if (!visible) {
    void flushPendingTime()
    return
  }

  startSegmentTimer()
}

function handlePageHide() {
  void flushPendingTime()
}

export function initAnalytics(getContext: () => AnalyticsContext) {
  if (!isEnabled() || initialized) return
  initialized = true

  const refreshContext = () => updateAnalyticsContext(getContext())
  refreshContext()

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', handlePageHide)

  heartbeatTimer = setInterval(() => {
    refreshContext()
    void flushPendingTime()
    startSegmentTimer()
  }, HEARTBEAT_MS)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    initialized = false
    void flushPendingTime()
  }
}

export const ANALYTICS_TOOL_LABELS: Record<string, string> = {
  blueprints: 'Blueprints',
  wikelo: 'Wikelo',
  mission_tracker: 'Mission Tracker',
  resource_tracker: 'Resource Tracker',
  mining_tracker: 'Mining Tracker',
  commodity_lookup: 'Commodity Lookup',
  custom_orders: 'My Listings',
  fulfillment: 'The Bazaar',
  archive: 'Info Archive',
  partnership: 'Partnership',
  guest_locked: 'Guest Locked',
}

export const ANALYTICS_SUB_TOOL_LABELS: Record<string, string> = {
  my_tracker: 'My Tracker',
  browse_missions: 'Browse Missions',
  live_tracker: 'Live Tracker',
  my_resources: 'My Resources',
  can_craft: 'Can Craft',
  site_total: 'Site Total',
  rs_tracker: 'RS Tracker',
  mining_guide: 'Mining Guide',
  ledger: 'Ledgers',
  active: 'Active Orders',
  completed: 'Completed Orders',
  archive: 'Archived Orders',
  fulfillment: 'WTB Fulfillment',
  store: 'WTS Store',
  apply: 'Apply',
  applications: 'Applications',
  manage: 'Manage services',
  officer_pending: 'Pending review',
  welcome: 'Overview',
  components: 'Components',
  ordnance: 'Ordnance',
  factions: 'Factions',
  lore: 'Resource Lore',
  general: 'General Archive',
}

export function formatAnalyticsDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`
}
