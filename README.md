# gitoui

A desktop git client, built as a pnpm + Turborepo monorepo.

- **renderer** (Chromium): React + TanStack Router/Query/DB. Sandboxed, no Node access.
- **main** (Node): owns `@gitoui/core`, mounts a home-made typed IPC registry.
- **`@gitoui/core`**: pure git engine (Effect + `simple-git`), Electron-free, testable.
- **`@gitoui/contracts`**: Effect `Schema` IPC contracts (SSOT), schema-only.

See [`docs/decisions.md`](./docs/decisions.md) for the architecture rationale, [`CONTEXT.md`](./CONTEXT.md)
for the domain glossary, and [`docs/adr/`](./docs/adr/) for the recorded decisions.

## Commands

```sh
pnpm install
pnpm dev          # turbo dev (electron-vite for apps/desktop)
pnpm build        # build desktop binaries
pnpm check-types  # tsgo across the workspace
pnpm check        # biome format + lint (write)
pnpm test         # vitest
```

## Stack

Electron · electron-vite · React 19 · TanStack Router/Query/DB · Effect (stable v3) ·
`simple-git` · Base UI + Tailwind v4 · Biome · tsgo · Vitest.
