# Architecture decisions — gitoui

> gitoui: a desktop git client (GitKraken-style), organized as a monorepo.
> Tooling inspiration: `../rekipe`.

This document records the decisions made and their rationale, before any scaffolding.

## Overview

```
      ┌──────────── @gitoui/contracts (Effect Schema: payload / success / error) ────────────┐
      │                                                                                       │
renderer (Chromium)                    main (Node)                      core (@gitoui/core)
React + Router + Query + DB ─IPC req/res─► makeIpcMethod ──────► Effect<Success, TaggedError, GitClient>
   │   typed window.git.*    ─IPC stream─► makeIpcSubscription ─► Stream<Event, …>   (wraps simple-git → git)
   └ feeds the collections              (Schema decode/encode + runPromiseExit → serialized plain data)
```

Layers:
- **renderer** (Chromium): the React UI, sandboxed, no direct Node access. TanStack Router/Query/DB.
- **main** (Node.js): the only layer that talks to Electron; owns `@gitoui/core` and exposes it through a home-made IPC registry.
- **core** (`packages/core`): pure git engine (Node + git), knows nothing about Electron → testable in isolation, reusable (future CLI).
- **contracts** (`packages/contracts`): Effect schemas (SSOT), **schema-only** (zero runtime logic). Imported by renderer, main and core to type/validate IPC payloads, results and errors.

## Monorepo structure

```
gitoui/
├── apps/
│   └── desktop/              # @gitoui/desktop — Electron
│       └── src/
│           ├── main/         # Node process: owns @gitoui/core, mounts the IPC registry
│           ├── ipc/          # home-made registry: makeIpcMethod / makeIpcSubscription (Schema decode/encode)
│           ├── preload/      # contextBridge: typed API surface derived from @gitoui/contracts
│           └── renderer/     # React/Vite: @gitoui/ui + TanStack Router/Query/DB, calls window.git.*
├── packages/
│   ├── tsconfig/             # @gitoui/tsconfig — shared base.json
│   ├── contracts/           # @gitoui/contracts — Effect schemas (IPC SSOT: payload/success/error), schema-only
│   ├── ui/                   # @gitoui/ui — React design system (Base UI, cva/cn, Tailwind)
│   └── core/                 # @gitoui/core — git engine (Effect + simple-git)
├── .agents/  (+ .claude → .agents)
│   ├── skills/  commands/  settings.local.json
├── docs/
├── .github/workflows/        # build + release of desktop binaries
├── .vscode/
├── AGENTS.md   CLAUDE.md (→ @AGENTS.md)   README.md
├── package.json  pnpm-workspace.yaml  turbo.json  biome.json
├── .release-it.json  .node-version  .gitignore
```

Package naming: `@gitoui/*` scope (like `@rekipe/*`).

## Decisions

### 1. Desktop framework → Electron
- **Why**: the main process is Node.js → git calls go through a Node SDK. This is the GitKraken stack.
- **Rejected**: Tauri (Rust core, smaller binaries but git logic would be in Rust, doesn't fit the Node requirement); Tauri + Node sidecar (too much plumbing).
- **Accepted tradeoff**: heavy binaries (~150 MB).

### 2. "Backend" → `packages/core` (SDK), not `apps/backend`
- In a desktop app there is no separate running server. The "backend" = main process + a reusable git library.
- **Why a package**: testable in isolation, reusable (future CLI/web), `core` ignores Electron.
- **Rejected**: git logic directly inside `apps/desktop` (less testable); a separate `apps/backend` server (overkill for a pure desktop app).

### 3. Git engine → `simple-git`
- **Why**: `simple-git` `spawn`s the system `git` binary. We inherit **the user's entire config** for free: `~/.gitconfig`, credential helpers (macOS Keychain…), hooks, remotes, GPG/SSH signing, aliases. Same approach as GitKraken & co.
- **Rejected**: `isomorphic-git` (pure JS but partial feature set, does not reuse the system config); `nodegit` (libgit2, painful to compile).

### 4. Renderer → React + Vite + TanStack Router (NOT TanStack Start)
- **TanStack Router** alone = a type-safe routing library, works in an SPA. In Electron: memory history (or hash).
- **TanStack Start rejected**: it's a full-stack metaframework (SSR + server functions + Node server). In Electron there is no server and no SSR (renderer loaded via `file://`) → no point here.

### 5. IPC layer → `packages/contracts` (Effect Schema) + home-made registry (option B)
- **Choice**: a **schema-only** `@gitoui/contracts` package in `effect/Schema` as the **single source of truth** (payload / success / error per method), plus a small **home-made registry** à la `makeIpcMethod` / `makeIpcSubscription` that decodes/encodes at the boundary and runs Effect handlers over Electron IPC.
- **Contract format (Option 2, stable v3)**: methods are plain `Schema` triples via a tiny home-made helper — `defineMethod({ payload, success, error })` / `defineSubscription({ payload, item, error })`. `contracts` depends only on `effect` (Schema), **not** `@effect/rpc`; method-vs-subscription is the helper you pick, not a `stream` flag. (On v4 we'd have used `Rpc.make`; not worth pulling `@effect/rpc` on v3 just for the descriptor shape.)
- **IPC surface — split by domain, mirroring the core/non-core boundary**: `window.git.*` = the git domain, every method backed by `@gitoui/core`; `window.desktop.*` = shell/app capabilities (folder dialog, `openExternal`, reveal in Finder, window controls, recent repos, settings, pushed events like `onMenuAction`), backed *directly* by Electron APIs in `main`, **never** by `core`. Both go through the *same* `makeIpcMethod` registry (same 3-case envelope). Contracts organized as subpaths `@gitoui/contracts/git` + `@gitoui/contracts/desktop` (no barrel). `window.git.pickFolder()` would be a category error — hence the split.
- **What we get**: types derived from the schema, **runtime validation at the boundary**, **typed errors** (`Schema.TaggedError`), Effect handlers + tracing — on **stable Effect (v3)**, with no custom transport to hand-build.
- **Inspiration, not copy-paste** (corrected after reading t3code's actual code): t3code *did* hand-write `DesktopIpc` + `makeIpcMethod` (Schema decode/encode) for its local Electron IPC — **but only for desktop-shell ops** (folder picker, SSH prompts, updates). Its **git operations + all streaming (`subscribeVcsStatus`) go over a WebSocket server** (`effect/unstable/rpc`), because it has a *remote* dimension (SSH/Tailscale). We have **no remote dimension** → mounting a WS server to talk to our own main process would be absurd. So we keep the home-made-IPC *idea* but **extend it to cover git + streaming too**. That extension is **net-new machinery we write ourselves**, not adopted as-is: (i) git request/response over `ipcMain.handle`, (ii) `Exit → plain data` error serialization (t3code's `makeIpcMethod` just throws on failure; the typed-error JSON serialization lives in its WS/`rpc` layer, not its IPC), (iii) `Stream → webContents.send` subscriptions. t3code's `makeIpcMethod` is the *shape* we borrow; the substance is ours.
- **Rejected**:
  - **Option A — `@effect/rpc` over IPC**: req/res + streaming batteries-included, but on stable v3 it's a **separate `@effect/rpc` dependency** *plus* an IPC transport adapter to build (its transports are Socket/HTTP/Worker — Electron isn't one). Overkill for a local app, and we'd lose the explicit `Exit → plain data` control (Style A throw, `Defect` distinction) we designed. *Migration possible later if a remote/server dimension appears — `contracts` is reused as-is, B doesn't lock us in.*
  - **Option C — manual bridge without schema** (hand-written TS interfaces): simpler at first, but no runtime validation, no structured typed errors, no clean subscriptions. Undersells the "learn Effect" goal.
  - `electron-trpc`: same as A, dependency + magic, rejected.

#### Streaming / subscriptions
- A git UI wants to **watch** the repo (fs-watcher → live push of status / branch / stash to the UI). Conceptually this is t3code's `stream: true` `subscribeVcsStatus` — **but in t3code that's a WebSocket RPC stream, not IPC**. We re-implement the same intent over Electron IPC.
- On our side: a twin helper `makeIpcSubscription({ channel, payload, item, handler: Stream<…> })` that `webContents.send`s each event. **This is net-new code, not "thin glue"** — the real work is teardown correctness: unsubscribe must finalize the Effect `Stream` scope, AND the subscription must be torn down on window close / renderer reload (otherwise we leak fs-watchers and `webContents.send` into a dead frame). Treat this as one of the two riskiest pieces of the scaffold (the other being `Exit → plain data`).

### 6. Renderer reactive store → TanStack DB
- A reactive client store with **collections** + incremental **live queries**, on top of TanStack Query.
- **Why**: a git UI has many derived views over the same data (commits per branch, staged/unstaged files, graph, search). We define collections (`commits`, `branches`, `status`, `stashes`) and live queries that recompute on their own.
- **Integration**: TanStack Query feeds the collections (`queryCollectionOptions`), the query = the IPC call. Coherent renderer stack (Router + Query + DB).
- **Usage pattern (settled with the graph's pagination, issue #44)**: collections are **module-scope, long-lived, one per entity type** (never per-render, never per-parameter) — the `commits` collection holds *every* repo's commits, each row tagged `repoPath`, and live queries narrow with `where(eq(commits.repoPath, root))`. Large paged lists use **`syncMode: 'on-demand'`**: the live query's predicates (`where`, `limit`, `offset`) are pushed down to the `queryFn` via `ctx.meta.loadSubsetOptions` and translated to the IPC call (`listCommits`'s `repoPath`/`skip`/`limit`). Load-more = grow the live query's `limit` (a recompile pushes the new window down); TanStack DB reconciles by per-subset row ownership, so a Branch-switch `invalidateQueries` refetch evicts stale Commits instead of merging over them. Function-form `queryKey` follows the base-prefix convention (`['commits', repoPath, …]`) so the existing `commitsKey(root)` invalidation reaches every subset of that repo and no other's.
- **Known warts (pinned `@tanstack/db` 0.6.x / `react-db` 0.1.x)**: `useLiveInfiniteQuery` is a dead end here — its `setWindow` path never asks the on-demand sync layer for more rows (only the recompile-with-a-larger-limit path fetches); upstream #968/#820, fixed on `main` but unreleased. The stand-in is the shared `useLivePaginatedQuery` hook (`shared/hooks/`), which mirrors `useLiveInfiniteQuery`'s API over the recompile path — swap it out when the fix ships. Until then load-more re-requests the *full window* (`skip: 0`, growing `limit`), not a delta page — the pushed-down `offset` is always 0 in this version; fine for local `git log`, and the `queryFn` already honors `offset` for when the lib starts sending deltas. And on a subset query error the lib leaks *derived* unhandled promise rejections (`.finally()`/argless `.catch()` off the subset's ready promise) — the error state itself is surfaced correctly (`utils.isError`); tests scope around it.
- **Note**: young (2025), API still moving — acceptable for a learning project.

### 7. Effects/error handling in `core` → Effect
- `core` models git operations as `Effect`s with **typed errors** (`RepoNotFoundError`, `MergeConflictError`, `DirtyWorkingTreeError`…), DI (git client as a service), structured concurrency.
- **Execution primitive — `runGit`, interruption-aware from day 1** (not naive `Effect.tryPromise`): `simple-git`'s `Promise` doesn't know about Effect interruption, so a fiber interrupt would leave a `git clone` running as a zombie. `runGit` wraps `simple-git`'s instance-level `AbortSignal` inside `Effect.acquireRelease` so **fiber interruption → `controller.abort()` → child process killed**. Decided now because it's the signature *every* op is built on — retrofitting (i)→(ii) would touch every long op. Cancellation is "kill the process" (not graceful), which is correct for git. The UI "Cancel" buttons (clone/fetch/pull/push) are **deferred but de-risked** — the capability is dormant, wiring it is trivial later.
- **`RepoWatcher` service — one shared, ref-counted fs-watcher per repo** (lives in `core`, not `main`, because "one watcher per repo" is a *git-domain* rule, keeping `core` Electron-free and testable). Holds `Map<repoPath, { pubsub, refCount, watcher }>`; `watchStatus(repo): Stream<Status>` subscribes to the shared `PubSub`, ++refCount; its finalizer --refCount and closes the watcher at 0. N components watching one repo = 1 watcher, 1 recompute per change.
- **Why here**: an isolated learning ground (pure library, not mixed with React).

#### Key subtlety: Effect stops at the IPC boundary
- IPC only carries **serializable JSON** (structured-clone). An `Effect` and its typed errors do not cross the bridge.
- The Effect world lives in `core` + `main`. At the boundary, `makeIpcMethod` **decodes** the payload (`Schema.decodeUnknownEffect`), runs the Effect handler, **encodes** the success (`Schema.encodeUnknownEffect`), and `runPromiseExit` turns the `Exit` into a **3-case plain-data envelope** (never a bare throw): `{_tag:'Success', value}` / `{_tag:'Failure', error}` (typed `Schema.TaggedError` encoded as a plain object) / `{_tag:'Defect', defect}` (a `Die`/unexpected crash → generic message only, **distinct** from business errors so the UI can treat a bug differently). The preload wrapper unwraps it **Style A**: returns `value` on success, **throws the typed error** on Failure/Defect (idiomatic for TanStack Query/DB; the renderer narrows by `_tag` via a `matchError` helper). Subscriptions mirror this with `Event/Failure/Defect/Done`.
- The renderer therefore receives only plain data. **It imports `@gitoui/contracts` as `import type` only** — `effect/Schema` is *absent from the renderer runtime bundle*, enforced by `verbatimModuleSyntax`. This makes the layering literally true at runtime: `core`/`main` = Effect + Schema, renderer = plain data + TanStack, **zero Effect in the renderer**.

### 8. Renderer reactivity → hybrid (TanStack on the UI side, Effect on the core side), NOT full-Effect
- **Choice**: Effect stops at the IPC; the renderer stays 100% React + **TanStack Router/Query/DB**. We learn **both**, each in the layer where it's the best tool.
- **Why**: the shape of a git UI's data (normalized entities + many derived/joined/filtered views + large virtualized lists) is *made* for TanStack DB (collections + incremental live queries). `@effect/atom-react` is an atom system (reactive cells, signal-style), **not** a relational store → we'd have to reimplement filters/joins by hand.
- **Rejected — full-Effect / `@effect/atom-react`** (the t3code approach): more coherent (single paradigm) and a better pure-Effect exercise, but (a) we'd drop TanStack DB which we wanted to explore, and (b) we'd hand-roll the UI data layer. t3code goes full-Effect because it shares a `client-runtime` across web + mobile + desktop streamed from a remote server — a pressure we don't have (single local app).
- **Accepted tradeoff**: feeding a TanStack DB collection from a live stream needs a bit of glue (vs an atom backed by a `Stream`, which is trivial). Contained to a handful of subscriptions.
- **Typed errors at the call site — the one place the hybrid pinches** (and how we mitigate it): because Effect stops at the IPC, the renderer never gets Effect's *compiler-tracked* error channel. A thrown error is `unknown` in TS, and `useQuery`'s `TError` is *asserted*, not inferred. Atoms (`@effect-atom/atom-react`) would give a typed `Result<A, E>` for free — but that's the full-Effect path that costs us TanStack DB. **Chosen middle path ("level 3"):** Effect stays the *dialect of the data layer*, TanStack stays the store. We wrap calls in a **contract-derived typed query helper** (`useGitQuery('status', payload)` infers both success and the error union from `@gitoui/contracts`) plus a **`matchError` helper keyed by `_tag`** for exhaustive handling. Recovers ~90% of the atom ergonomics; the residual cost (error type *asserted* vs *tracked*, no `Effect.catchTag` composition) is an accepted papercut.
- **We'd flip to full-Effect if**: a shared remote/web/mobile dimension appears, or the goal becomes "Effect as deep as possible, TanStack secondary".

## Reference: t3code (`../t3code`)

A very well-architected Electron app, studied as a reference. **Different scope** (a multi-target coding-agents client web+desktop+mobile, backend = a Node WebSocket server, local **or remote** via SSH/Tailscale) → ~80% of its complexity answers problems we don't have.

**Patterns adopted (at our scale):**
- `packages/contracts` schema-only in `effect/Schema` (SSOT payload/success/error) — decision 5.
- Declarative method registry à la `makeIpcMethod` (Schema decode/encode at the boundary) — decision 5.
- Subscriptions/streams for repo watching — decision 5.
- Effect Services + Layers in `core`/`main`, co-located `.test.ts` tests — decision 7.
- pnpm `catalog:` to pin `effect`; `shared`/`contracts` as subpath exports (no barrel index).

**Left out (for now):** separate server (`apps/server`), WebSocket transport, SSH/Tailscale, multi-environment split (`LocalApi`/`EnvironmentApi`), auth/auto-updater, web/mobile targets, and most of the bleeding-edge toolchain (`vite-plus`, `oxlint` + home-made plugin, `effect@4-beta`, strict `@effect/language-service` diagnostics).

**Adopted from the bleeding edge (one deliberate bet — see Toolchain below):** `tsgo` only. Stack: **biome + electron-vite + vitest + stable effect (v3) + tsgo**.

## Tooling

> Base *shape* from rekipe; `catalog:` from t3code (rekipe uses `syncpack` — we pick one: catalog); `electron-vite` + the bleeding-edge bits are net-new (rekipe has no Electron).


- **pnpm workspaces** (`apps/*`, `packages/*`) + **`catalog:`** to pin the `effect` version across all packages (borrowed from t3code). `contracts`/`shared` as **subpath exports** (no barrel index).
- **Turborepo** (`turbo.json`: build/dev/test/check-types)
- **Biome** (format + lint; drop the tailwind bits if unused)
- **release-it** + `@release-it/conventional-changelog` + `@release-it-plugins/workspaces` (GitHub release + changelog)
- **electron-vite** (dev/build: Vite for main/preload/renderer, HMR) + **electron-builder** (packaging mac/win/linux binaries; run on tag by a GH workflow)
- `.node-version`, `.gitignore`, `.vscode/`
- `.agents/` + `.claude → .agents` symlink (skills/, commands/, settings)
- `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`) + `docs/`
- **Not reused**: rekipe's dokploy/docker `.github` workflows (server deployment) → replaced by desktop-binary build/release workflows.

## Toolchain

- **Effect: stable v3 (latest).** We seriously evaluated `effect@4-beta` (to lean on t3code's patterns directly) and **rejected it**: gitoui uses *neither* `effect/unstable/rpc` *nor* `effect/unstable/reactivity` — v4's headline in-core additions — because we chose IPC option B + TanStack DB; and the concepts we want to learn (`Effect`/`Layer`/`Context.Service`/`Schema`/`Stream`/interruption) are **identical** on v3. So beta would add churn + thin docs (the real tax on a *learning* project) for ~zero gain on our design. *We'll revisit when v4 is stable.* Pinned via `catalog:` so `contracts`/`core`/`desktop` never skew (Schema type identity across packages is non-negotiable).
- **`tsgo` for everything** (`@typescript/native-preview`, the TS7 Go port) — sole type-checker (`check-types` + editor); the **one** deliberate bleeding-edge bet. **Escape hatch**: the build transpiles via electron-vite (esbuild/rolldown), so `tsgo` is **not in the build path** — if it chokes on Effect's demanding types, swap `tsgo`→`tsc` in the `check-types` script (one line), zero build impact. **Known loss**: tsgo's tsserver doesn't support TS plugins yet → no `@effect/language-service` in-editor diagnostics (already "left out"). **No ADR — trivially reversible.**
- **`catalog:`** (from t3code; rekipe uses `syncpack` — pick one) pins `effect`, `@tanstack/*`, `react`/`react-dom`, `typescript`/`tsgo` across all packages.
- **Versions: latest available at scaffold time**, catalog-pinned, **verified mutually compatible** (TanStack DB ↔ TanStack Query major, react 19 ↔ rest). Concrete tooling pins lifted from rekipe: node `24.12.0`, pnpm `10.28.1`, turbo `^2.7.5`, biome `^2.3.11`.
- **electron-vite + electron-builder**, **ESM main** (`"type": "module"`, modern Electron).

## Added dependencies (beyond tooling)

| Layer | Additions |
|---|---|
| `packages/contracts` | `effect` (`Schema` only — schema-only, no runtime) |
| `packages/core` | `effect` (+ `@effect/platform` later if needed), `simple-git`, depends on `@gitoui/contracts` |
| `apps/desktop` (renderer) | `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-db`, `@tanstack/react-virtual` (Commit graph virtualization, issue #44), `react`, Tailwind, depends on `@gitoui/contracts` + `@gitoui/ui` |
| `apps/desktop` (main/preload) | `electron`, home-made IPC registry (`makeIpcMethod`/`makeIpcSubscription`), depends on `@gitoui/core` + `@gitoui/contracts` |
| `packages/ui` | React design system (Base UI, cva/cn, Tailwind) |

## Status

Decisions locked, **scaffolding not started yet** (folders + package.json + working config, no business logic).
