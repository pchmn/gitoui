import type { DesktopBridge, GitBridge } from '../../preload/index.ts';

// The typed surface exposed by the preload (decision #5: window.git = core, window.desktop = shell).
// Imported as types only — no preload runtime enters the renderer bundle.
declare global {
  interface Window {
    readonly git: GitBridge;
    readonly desktop: DesktopBridge;
  }
}
