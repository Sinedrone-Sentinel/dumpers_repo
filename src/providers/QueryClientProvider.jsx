import { QueryClient, QueryClientProvider as ReactQueryProvider } from '@tanstack/react-query'
import { useState } from 'react'

function QueryClientProviderWrapper({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 30,
      },
    },
  }))

  return (
    <ReactQueryProvider client={queryClient}>
      {children}
    </ReactQueryProvider>
  )
}

export default QueryClientProviderWrapper
