import { ThemeProvider } from '@gitoui/ui/theme-provider';
import { Toaster, ToastProvider } from '@gitoui/ui/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Renderer stack: TanStack Query (here) + Router + DB (wired with the first real routes/collections).
const queryClient = new QueryClient();

/**
 * App-level infrastructure providers: the query cache, runtime theming, and the toast surface.
 * Module-agnostic on purpose — feature state (e.g. the active Repository) is wired at the root in
 * `main.tsx`, so this layer never has to know about any one feature.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
