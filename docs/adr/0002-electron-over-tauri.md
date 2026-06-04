# Desktop framework: Electron (not Tauri)

gitoui's git engine runs in Node via `simple-git` (see [ADR-0001](./0001-git-engine-simple-git.md)), so the desktop shell must host a **Node main process**. Electron provides exactly that — a Node main process plus a sandboxed Chromium renderer — making it the natural fit.

## Considered options

- **Tauri** — rejected. Its core is Rust, so the git logic would have to live in Rust, contradicting the Node-engine requirement. Smaller binaries, but the wrong language for our engine.
- **Tauri + Node sidecar** — rejected. Too much plumbing to bolt a Node process onto a Rust shell.

## Consequences

- Heavy binaries (~150 MB) — accepted.
