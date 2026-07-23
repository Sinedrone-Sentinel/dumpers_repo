import React from 'react'
import ReactDOM from 'react-dom/client'
import QueryClientProvider from './providers/QueryClientProvider'
import { AuthProvider } from './contexts/AuthContext'
import { OrderDraftProvider } from './contexts/OrderDraftContext'
import { MiningTrackerProvider } from './contexts/MiningTrackerContext'
import { MiningLoadoutProvider } from './contexts/MiningLoadoutContext'
import RouterApp from './components/RouterApp'
import DfpInitGate from './components/DfpInitGate'
import './index.css'
import { setupCacheBusting } from './lib/appVersion'

const appElement = document.getElementById('root')

if (appElement) {
  const root = ReactDOM.createRoot(appElement)

  // bfcache restore still hard-reloads; deploy mismatch shows UpdateAvailableBanner in AppChrome.
  setupCacheBusting()

  root.render(
    <React.StrictMode>
      <AuthProvider>
        <MiningTrackerProvider>
          <MiningLoadoutProvider>
          <OrderDraftProvider>
            <DfpInitGate>
              <QueryClientProvider>
                <RouterApp />
              </QueryClientProvider>
            </DfpInitGate>
          </OrderDraftProvider>
          </MiningLoadoutProvider>
        </MiningTrackerProvider>
      </AuthProvider>
    </React.StrictMode>
  )
}
