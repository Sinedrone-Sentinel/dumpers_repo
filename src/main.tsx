import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routes/root'
import QueryClientProvider from './providers/QueryClientProvider'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const appElement = document.getElementById('root')

if (appElement) {
  const root = ReactDOM.createRoot(appElement)
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <QueryClientProvider>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthProvider>
    </React.StrictMode>
  )
}
