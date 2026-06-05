import { join } from 'node:path';
import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { registerIpc } from '#ipc/methods';

// Frameless title bar so the renderer draws its own topbar (see TopBar in the renderer).
// macOS keeps the native traffic lights overlaid (positioned to center in the 44px topbar);
// Windows/Linux get the native min/max/close controls via an overlay on the right.
// NOTE: titleBarOverlay colors are static here — syncing them with the active theme
// (win.setTitleBarOverlay on theme change) is a deferred follow-up.
const isMac = process.platform === 'darwin';
const titleBarOptions: BrowserWindowConstructorOptions = isMac
  ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 15 } }
  : {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: 'rgba(0,0,0,0)', symbolColor: '#8b8b8b', height: 44 },
    };

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    ...titleBarOptions,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      // contextIsolation + no nodeIntegration = renderer has no direct Node access.
      // NOTE: sandbox:false to allow an ESM preload (electron-vite default). Hardening to a
      // full OS sandbox (sandbox:true) requires building the preload as CJS — deferred.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
