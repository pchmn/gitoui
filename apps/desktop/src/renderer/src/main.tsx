import { ThemeProvider } from '@gitoui/ui/theme-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import '@gitoui/ui/globals.css';
import './index.css';

// Renderer stack: TanStack Query (here) + Router + DB (wired with the first real routes/collections).
const queryClient = new QueryClient();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
