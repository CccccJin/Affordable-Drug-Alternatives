import { QueryClient } from '@tanstack/react-query';

// Create a client with optimized settings for our chemical search app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache search results for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed requests up to 3 times
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx errors (client errors)
        const err = error as { status?: number };
        if (err?.status !== undefined && err.status >= 400 && err.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      // Retry with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});
