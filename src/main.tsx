import React from 'react'
import ReactDOM from 'react-dom/client'
import QueryClientProvider from './providers/QueryClientProvider'
import { AuthProvider } from './contexts/AuthContext'
import RouterApp from './components/RouterApp'
import './index.css'
import { setupCacheBusting, checkAppVersion } from './lib/appVersion'

const appElement = document.getElementById('root')

if (appElement) {
  const root = ReactDOM.createRoot(appElement)

  setupCacheBusting()

  void checkAppVersion().then(() => {
    root.render(
      <React.StrictMode>
        <AuthProvider>
          <QueryClientProvider>
            <RouterApp />
          </QueryClientProvider>
        </AuthProvider>
      </React.StrictMode>
    )
  })
}
