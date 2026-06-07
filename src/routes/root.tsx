import { createRootRoute, createRoute } from '@tanstack/react-router'
import Layout from '../components/Layout'
import { RouteErrorPage, RouteNotFoundPage } from '../components/RouteErrorPage'
import BlueprintsRoute from './Blueprints.index'
import ResourceTrackerRoute from './ResourceTracker.index'
import CustomOrdersRoute from './CustomOrders.index'
import FulfillmentRoute from './Fulfillment.index'
import TargetsRoute from './Targets.index'
import { requireFeature } from '../lib/routeGuards'

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

export const routeTree = rootRoute.addChildren([
  indexRoute,
  targetsRoute,
  resourceTrackerRoute,
  customOrdersRoute,
  fulfillmentRoute,
])

export default routeTree
