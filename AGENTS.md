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

## Design Context

Before any UI/UX work, read [`PRODUCT.md`](./PRODUCT.md) (strategy: register, users, principles)
and [`DESIGN.md`](./DESIGN.md) (visual system: tokens, typography, components). In short:

- **Register:** product. Personality: **minimal · clear · frictionless**. The **commit graph is
  the protagonist**; chrome recedes around it.
- **Theme is source-derived.** The whole palette is computed in OKLCH at runtime from one
  user-chosen source color (`--primary-source`, default brown `#8a6048`). Pull from tokens, never
  hardcode a grey. Flat at rest (depth via tonal step + 1px hairlines), compact controls, DM Sans
  for UI (DM Mono for code/diff content only), light + dark equal.
- **Anti-references:** GitKraken's saturated cockpit; generic SaaS.

For a sense of the overall direction, see the starting mockups in
[`docs/mockups/`](./docs/mockups/README.md) (target feel, not the final spec — `DESIGN.md` wins
on any conflict).

The `$impeccable` skill reads these files plus the `.impeccable/design.json` sidecar.

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
- for a specific package, use `pnpm <command> --filter <package-name>`
- Type-checking uses **tsgo** (`@typescript/native-preview`).

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
- `PRODUCT.md` / `DESIGN.md` / `.impeccable/design.json` — if you changed the visual system (tokens,
  typography, components, named rules) or the mockups in `docs/mockups/`. `DESIGN.md` is the SSOT;
  the `.impeccable/design.json` sidecar mirrors it, so keep the two in sync. When a mockup and
  `DESIGN.md` disagree, `DESIGN.md` wins.

## Conventions

How code is organized, named, and imported — TypeScript/Effect idioms, the feature-first renderer
layout (`core / modules / shared`), per-package naming, the `#renderer/*` alias, Phosphor icons,
conventional commits — lives in **[`docs/conventions.md`](./docs/conventions.md)**. The architecture
invariants above are the do-not-break rules; conventions are everything else.

## Agent skills

### Issue tracker

Issues, PRDs, and triage live in this repo's GitHub Issues (`pchmn/gitoui`), via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage states using default label strings (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
