import { createRootRoute, createRoute } from '@tanstack/react-router'
import Layout from '../components/Layout'
import { RouteErrorPage, RouteNotFoundPage } from '../components/RouteErrorPage'
import BlueprintsRoute from './Blueprints.index'
import ResourceTrackerRoute from './ResourceTracker.index'
import CustomOrdersRoute from './CustomOrders.index'
import FulfillmentRoute from './Fulfillment.index'
import TargetsRoute from './Targets.index'
import TargetsLiveRoute from './TargetsLive.index'
import ArchiveRoute from './Archive.index'
import SupportDashboardRoute from './SupportDashboard.index'
import GuestLockedRoute from './GuestLocked.index'
import MiningTrackerRoute from './MiningTracker.index'
import DiscordSubscribeRoute from './DiscordSubscribe.index'
import AnalyticsRoute from './Analytics.index'
import { requireFeature, requireSuperAdmin } from '../lib/routeGuards'
import type { FeatureId } from '../lib/featureAccess'

const rootRoute = createRootRoute({
  component: Layout,
  notFoundComponent: RouteNotFoundPage,
  errorComponent: RouteErrorPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: BlueprintsRoute,
})

const miningTrackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mining-tracker',
  component: MiningTrackerRoute,
  beforeLoad: requireFeature('mining_tracker'),
  validateSearch: (search: Record<string, unknown>) => ({
    ore: typeof search.ore === 'string' ? search.ore : undefined,
    location: typeof search.location === 'string' ? search.location : undefined,
    add: search.add === true || search.add === 'true' || search.add === '1',
    view:
      search.view === 'guide'
        ? 'guide'
        : search.view === 'ledger'
          ? 'ledger'
          : search.view === 'tracker'
            ? 'tracker'
            : undefined,
  }),
})

const targetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/targets',
  component: TargetsRoute,
  beforeLoad: requireFeature('target_bp_list'),
})

const targetsLiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/targets/live',
  component: TargetsLiveRoute,
  beforeLoad: requireFeature('target_bp_list'),
})

const resourceTrackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources',
  component: ResourceTrackerRoute,
  beforeLoad: requireFeature('resource_tracker'),
})

const customOrdersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: CustomOrdersRoute,
  beforeLoad: requireFeature('custom_orders'),
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search.tab === 'completed' || search.tab === 'archive'
        ? (search.tab as 'completed' | 'archive')
        : undefined,
  }),
})

const fulfillmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/fulfillment',
  component: FulfillmentRoute,
  beforeLoad: requireFeature('fulfillment'),
  validateSearch: (search: Record<string, unknown>) => ({
    highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
  }),
})

const archiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/archive',
  component: ArchiveRoute,
  beforeLoad: requireFeature('archive_browse'),
})

const supportDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/support-dashboard',
  component: SupportDashboardRoute,
  beforeLoad: requireFeature('support_dashboard'),
})

const guestLockedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/guest-locked',
  component: GuestLockedRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    feature: (search.feature as FeatureId | undefined) ?? 'custom_orders',
  }),
})

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  component: AnalyticsRoute,
  beforeLoad: requireSuperAdmin(),
})

const discordSubscribeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discord-subscribe',
  component: DiscordSubscribeRoute,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  miningTrackerRoute,
  targetsRoute,
  targetsLiveRoute,
  resourceTrackerRoute,
  customOrdersRoute,
  fulfillmentRoute,
  archiveRoute,
  supportDashboardRoute,
  guestLockedRoute,
  analyticsRoute,
  discordSubscribeRoute,
])

export default routeTree
