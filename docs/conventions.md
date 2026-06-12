# Conventions

How code is organized, named, and imported across the workspace. Companion to `AGENTS.md`, which
holds the **architecture invariants** (the do-not-break rules) and points here for everything else.
When the two disagree, fix one — they must agree.

## TypeScript / Effect idioms

- **Effect** (stable v3), in `core` + `main` only: services via `Context.Tag` / `Effect.Service` +
  `Layer`; typed errors via `Schema.TaggedError`. (That Effect *stops at the IPC boundary* is an
  invariant — see `AGENTS.md`; this is just the in-`core` style.)
- Co-locate tests: `<name>.test.ts` next to its source.

## Renderer file organization

The renderer (`apps/desktop/src/renderer/src`) is organized **feature-first**, mirroring the
sibling `rekipe` web app (`core / modules / shared`):

```
renderer/src/
  main.tsx                 # bootstrap + root composition (the one place that knows every layer)
  core/                    # app-level infrastructure + the shell
    providers.tsx          # query cache, theming, toast surface — module-agnostic
    shell/                 # the always-present app frame: AppShell, TopBar, StatusBar
  modules/<feature>/       # vertical feature slices, grouped by kind inside
    repository/
      components/          # EmptyState, RepositoryView
      hooks/               # useOpenRepository
      ActiveRepositoryContext.tsx   # context + types.ts live at the module root
  shared/                  # cross-feature leaf code (components/ hooks/ utils/) — added on first use
```

- **`core/`** — infrastructure every feature depends on, plus the **shell** (`core/shell/`), the
  app frame. `core/` is module-agnostic *except* `core/shell/`, which is the composition layer and
  may read feature content (e.g. the StatusBar reads the active-Repository context).
- **`modules/<feature>/`** — one folder per feature, with the **same shape every time**: group by
  kind into `components/` and `hooks/`; the module's **context and `types.ts` live at its root**
  (they're the shared core, imported by both). Uniform on purpose — no per-module "do we split yet?"
  call, even when a folder holds a single file.
- **`shared/`** — reusable across features. Created when the first genuinely-shared thing appears;
  don't pre-create empty folders (git doesn't track them anyway).
- **Dependency direction**: features depend on `core`/`shared`, never the reverse. The only
  composition seams are `main.tsx` (wires providers → feature providers → shell) and `core/shell/`
  (renders feature content).

## Naming

Context-dependent — each package follows the convention idiomatic to its ecosystem:

| Where | Kind | Convention | Example |
|---|---|---|---|
| Renderer app | Components | `PascalCase.tsx` | `StatusBar.tsx`, `EmptyState.tsx` |
| Renderer app | Hooks (`use` prefix) | `camelCase.ts` | `useOpenRepository.ts` |
| Renderer app | Context modules | `PascalCaseContext.tsx` | `ActiveRepositoryContext.tsx` |
| `packages/ui` | Design-system components | **shadcn lowercase / kebab** | `button.tsx`, `theme-provider.tsx`, `toast.tsx` |
| `core` / `contracts` | Module named after one class/service | `PascalCase.ts` | `GitClient.ts`, `RepoWatcher.ts` |
| `core` / `contracts` | Module of functions / schemas | `camelCase.ts` / lowercase | `runGit.ts`, `git.ts` |
| Everywhere | Constants | `SCREAMING_SNAKE_CASE` | `DEFAULT_PRIMARY` |

`packages/ui` deliberately keeps the **shadcn lowercase** filenames (`button.tsx`) — it's the
ecosystem expectation and keeps `shadcn add` drop-ins frictionless. Don't "PascalCase-ify" it to
match the app.

**Icons** — `@phosphor-icons/react`; always import the **`Icon`-suffixed** alias (`WarningCircleIcon`,
`FolderOpenIcon`). The bare names (`WarningCircle`) are deprecated.

## Imports

- **Cross-package** → `@gitoui/*` **subpath exports** (`@gitoui/ui/button`, `@gitoui/contracts/git`).
  No barrel index.
- **Intra-package, node-side** (main / preload / core / contracts / ui) → the package.json
  **`imports` field** (`#ipc/*`, `#preload/*`, `#components/*`). The target carries the extension
  (`./src/ipc/*.ts`), so single-extension folders are honored by tsgo + vite + vitest + Node at once.
- **Renderer** (`apps/desktop`, web side) → a clean, extensionless **`#renderer/*`** alias for
  imports that **cross a boundary** (module → module, → `core`, → `shared`); plain **relative**
  (`./Sibling`, `../hooks/useX`) **within a module**, so a module stays self-contained and movable.
  - The renderer mixes `.ts` and `.tsx` in one folder, so the single-extension `imports`-field
    trick doesn't fit. It is the **one** place that uses **tsconfig `paths`** (`tsconfig.web.json`)
    — for tsgo — while the package.json `imports` field (`#renderer/*`) covers vite (native,
    extension-resolving). No `vite-tsconfig-paths` plugin needed.
  - This relaxes the workspace "imports field, never tsconfig paths" rule. It's justified and
    contained: the renderer is **vite-only** (it never runs in raw Node or vitest), so that rule's
    cross-runtime-parity rationale doesn't apply here.

## Commits

- **Conventional commits** (`feat:`, `fix:`, `chore:`, …) — release-it squashes them into the changelog.
