import { createRootRoute, createRoute } from '@tanstack/react-router'
import Layout from '../components/Layout'
import { RouteErrorPage, RouteNotFoundPage } from '../components/RouteErrorPage'
import BlueprintsRoute from './Blueprints.index'
import ResourceTrackerRoute from './ResourceTracker.index'
import CustomOrdersRoute from './CustomOrders.index'
import FulfillmentRoute from './Fulfillment.index'
import TargetsRoute from './Targets.index'
import ArchiveRoute from './Archive.index'
import SupportDashboardRoute from './SupportDashboard.index'
import GuestLockedRoute from './GuestLocked.index'
import MiningTrackerRoute from './MiningTracker.index'
import ShopsRoute from './Shops.index'
import { requireFeature } from '../lib/routeGuards'
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
  }),
})

const targetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/targets',
  component: TargetsRoute,
  beforeLoad: requireFeature('target_bp_list'),
})

const resourceTrackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources',
  component: ResourceTrackerRoute,
  beforeLoad: requireFeature('resource_tracker'),
})

const shopsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shops',
  component: ShopsRoute,
  beforeLoad: requireFeature('shops_browse'),
  validateSearch: (search: Record<string, unknown>) => ({
    shop: typeof search.shop === 'string' ? search.shop : undefined,
  }),
})

const customOrdersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: CustomOrdersRoute,
  beforeLoad: requireFeature('custom_orders'),
})

const fulfillmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/fulfillment',
  component: FulfillmentRoute,
  beforeLoad: requireFeature('fulfillment'),
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

export const routeTree = rootRoute.addChildren([
  indexRoute,
  miningTrackerRoute,
  targetsRoute,
  resourceTrackerRoute,
  shopsRoute,
  customOrdersRoute,
  fulfillmentRoute,
  archiveRoute,
  supportDashboardRoute,
  guestLockedRoute,
])

export default routeTree
