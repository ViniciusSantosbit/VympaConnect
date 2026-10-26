import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster theme="dark" richColors />
    </QueryClientProvider>
  );
}
