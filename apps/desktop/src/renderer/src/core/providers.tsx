import { ThemeProvider } from '@gitoui/ui/theme-provider';
import { Toaster, ToastProvider } from '@gitoui/ui/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Renderer stack: TanStack Query (here) + Router + DB (wired with the first real routes/collections).
// `retry: false`: every query here wraps a local, deterministic git command — a failure (corrupt
// repo, missing path) fails identically on every attempt, so TanStack Query's default 3-retry
// backoff only delays the error state by ~7s. A module with a genuinely transient source can
// still opt back in per-query.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

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
