import { QueryClient } from '@tanstack/react-query'

// Online-first app: short stale window for snappy reads, no refetch-on-focus churn.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
