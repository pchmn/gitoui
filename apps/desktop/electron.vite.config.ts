import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Workspace packages are consumed as TS source, so they must be BUNDLED (not externalized) —
// esbuild/rollup transpiles them. Third-party deps (effect, simple-git, …) stay external.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@gitoui/core', '@gitoui/contracts'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@gitoui/contracts'] })],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
