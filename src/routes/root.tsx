import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import Layout from '../components/Layout'
import BlueprintsRoute from './Blueprints.index'

const rootRoute = createRootRoute({
  component: Layout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: BlueprintsRoute,
})

export const routeTree = rootRoute.addChildren([indexRoute])

export default routeTree
