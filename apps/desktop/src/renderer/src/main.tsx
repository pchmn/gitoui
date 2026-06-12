import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '#renderer/core/providers';
import { AppShell } from '#renderer/core/shell/AppShell';
import { ActiveRepositoryProvider } from '#renderer/modules/repository/ActiveRepositoryContext';
import '@gitoui/ui/globals.css';
import './index.css';

// Bootstrap + root composition: app-level providers wrap the feature providers, which wrap the shell.
const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <ActiveRepositoryProvider>
        <AppShell />
      </ActiveRepositoryProvider>
    </AppProviders>
  </StrictMode>,
);
