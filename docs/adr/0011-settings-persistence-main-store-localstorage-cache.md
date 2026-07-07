# Settings persistence: electron-store in main as truth, localStorage as boot cache

App-scoped Settings (theme mode, source color; later more) are persisted in **main**, in an
`electron-store`-backed `SettingsStore` service (the `RecentRepositoriesStore` pattern), exposed via
`window.desktop.*`. The renderer **keeps writing the same values to `localStorage`** — but only as a
boot cache: `ThemeProvider` initializes from `localStorage` synchronously (no flash of the wrong
theme while the first IPC round-trip is in flight), then reconciles against the store and treats it
as the single source of truth from there on. So the theme deliberately lives in two places, and only
one of them is authoritative.

Owning Settings in main is what lets the shell follow the app: on every theme change main sets
`nativeTheme.themeSource` (native menus, dialogs, and window chrome match the app instead of the
OS), and the Windows/Linux `titleBarOverlay` colors can finally sync (`win.setTitleBarOverlay`),
closing the TODO in `main/index.ts`. It also makes Settings readable before any window exists, and
shared by construction if a second window ever appears.

## Considered options

- **Keep `localStorage` only** (the status quo) — rejected: main can't see the theme, so
  `nativeTheme` / `titleBarOverlay` stay wrong, and any future non-renderer setting would force this
  migration anyway, with data already stranded in the renderer.
- **electron-store only, no localStorage cache** — rejected: the initial read is async over IPC, so
  first paint renders the default theme and flashes to the real one; a synchronous cache is the
  cheap fix, and stale-cache is harmless (one repaint at reconcile).

## Consequences

- The renderer never treats `localStorage` as authoritative — it is write-through cache only.
  Divergence resolves in the store's favor at mount.
- Every new Setting extends the `SettingsBlob` schema in contracts and rides the same
  `window.desktop.*` methods; per-setting ad-hoc persistence is a smell.
- Git configuration is explicitly **not** a Setting (see CONTEXT.md): it lives in git's own files,
  is edited in place, and never enters the store.
