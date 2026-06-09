import React from 'react'
import ReactDOM from 'react-dom/client'
import QueryClientProvider from './providers/QueryClientProvider'
import { AuthProvider } from './contexts/AuthContext'
import RouterApp from './components/RouterApp'
import DfpInitGate from './components/DfpInitGate'
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
          <DfpInitGate>
            <QueryClientProvider>
              <RouterApp />
            </QueryClientProvider>
          </DfpInitGate>
        </AuthProvider>
      </React.StrictMode>
    )
  })
}
