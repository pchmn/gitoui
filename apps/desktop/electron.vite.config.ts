import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Workspace packages are consumed as TS source, so they must be BUNDLED (not externalized) —
// esbuild/rollup transpiles them. Third-party deps (effect, simple-git, …) stay external.
export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@gitoui/core', '@gitoui/contracts'],
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: {
        exclude: ['@gitoui/contracts'],
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    // The @pierre/diffs highlight worker code-splits (dynamic grammar imports), which the default
    // iife worker output can't express — Electron's Chromium handles module workers fine.
    worker: { format: 'es' },
  },
});
