# AGENTS.md

Guidance for AI agents working in this repo. Read this first.

## What this is

gitoui — a desktop git client (GitKraken-style), pnpm + Turborepo monorepo.

```
apps/desktop          @gitoui/desktop — Electron (main / preload / renderer)
packages/contracts    @gitoui/contracts — Effect Schema IPC contracts (schema-only, SSOT)
packages/core         @gitoui/core — git engine (Effect + simple-git), Electron-free
packages/ui           @gitoui/ui — React design system (Base UI + cva/cn + Tailwind)
packages/tsconfig     @gitoui/tsconfig — shared base.json
```

## Architecture invariants (do not break)

- **Effect stops at the IPC boundary.** `core` + `main` are Effect; the renderer is plain
  data + TanStack only. The renderer imports `@gitoui/contracts` as `import type` ONLY —
  `effect/Schema` must never enter the renderer runtime bundle (`verbatimModuleSyntax` enforces it).
- **`core` is Electron-free.** It knows nothing about `electron`. Shell capabilities live in
  `main` and are exposed as `window.desktop.*`; git lives in `core` and is exposed as `window.git.*`.
- **The IPC boundary never throws a bare error.** `makeIpcMethod` returns a 3-case envelope
  (`Success` / `Failure` / `Defect`); the preload re-throws the typed error (Style A).
- **One fs-watcher per repo** (the `RepoWatcher` service, ref-counted, in `core`).
- **`runGit` is interruption-aware** — fiber interruption kills the child git process.

The full rationale is in `docs/decisions.md`; the recorded decisions are in `docs/adr/`; the domain
vocabulary (e.g. "Working tree" not "working directory") is in `CONTEXT.md`. Honor the glossary.

## Commands

- `pnpm dev` · `pnpm build` · `pnpm test` · `pnpm check-types` (tsgo) · `pnpm check` (biome).
- Type-checking uses **tsgo** (`@typescript/native-preview`). If it chokes on an Effect type,
  the escape hatch is to swap `tsgo` → `tsc` in the package's `check-types` script.

## Post-Modification Verification

**ALWAYS** run these after completing any task, in this order, and fix issues before finishing:

```bash
pnpm check         # Biome format + lint (auto-fixes)
pnpm check-types   # tsgo type-check across the workspace
pnpm test          # Vitest
```

Then check whether docs need updating to reflect your change:

- `AGENTS.md` / `README.md` — new modules, moved files, changed commands.
- `CONTEXT.md` — if you introduced or renamed a **domain term**. Honor the glossary; don't coin a
  synonym for something already named (e.g. it's "Working tree", never "working directory").
- `docs/decisions.md` + `docs/adr/` — if you made a decision that is hard to reverse, surprising
  without context, and the result of a real trade-off, record it (add an ADR; bump the number).

## Conventions

- Effect (stable v3). Services via `Context.Tag`/`Effect.Service` + `Layer`. Typed errors via
  `Schema.TaggedError`. Co-locate `*.test.ts` next to source.
- Packages export **subpaths, no barrel index** (e.g. `@gitoui/contracts/git`).
- Intra-package imports use the **`imports` field** (`#…`, e.g. `#ipc/channels`), never tsconfig
  `paths` — one declaration in `package.json`, honored by tsgo + vite + vitest + Node at once.
- Conventional commits (release-it squashes to a changelog).
