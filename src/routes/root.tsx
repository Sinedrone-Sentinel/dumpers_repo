import { createRootRoute, createRoute } from '@tanstack/react-router'
import Layout from '../components/Layout'
import BlueprintsRoute from './Blueprints.index'
import ResourceTrackerRoute from './ResourceTracker.index'
import CustomOrdersRoute from './CustomOrders.index'
import FulfillmentRoute from './Fulfillment.index'
import { requirePreviewAccess } from '../lib/routeGuards'

const rootRoute = createRootRoute({
  component: Layout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: BlueprintsRoute,
})

const resourceTrackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources',
  component: ResourceTrackerRoute,
  beforeLoad: requirePreviewAccess(),
})

const customOrdersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: CustomOrdersRoute,
  beforeLoad: requirePreviewAccess(),
})

const fulfillmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/fulfillment',
  component: FulfillmentRoute,
  beforeLoad: requirePreviewAccess(),
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  resourceTrackerRoute,
  customOrdersRoute,
  fulfillmentRoute,
])

export default routeTree
