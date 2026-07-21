# Diff & tree rendering: @pierre libraries, git-native patch through the IPC

The Code & Diff view and the Inspector's Tree tab are rendered by **`@pierre/diffs`** and
**`@pierre/trees`** (Apache-2.0, from The Pierre Computer Company) instead of home-made renderers.
`@pierre/diffs` brings unified/split layout, virtualization, word-level inline diffing, per-line
annotations/gutter hooks (the seam for *Stage hunk*), Shiki syntax highlighting off the main thread
(worker pool), and a `File` component that also covers the raw-file view. Re-implementing that
surface is weeks of work orthogonal to what gitoui is exploring.

The consequence for the contract is the surprising part: **the `diff` IPC method carries the raw
`git diff` patch text (plus the full old/new file contents), not a parsed structure** — even though
our IPC is otherwise typed-schema SSOT. Parsing in `core` only to re-serialize a structure the
library would immediately re-parse (`parsePatchFiles`) is dead weight; the patch string *is* the
canonical representation, and it is git's own. Full contents ride along to unlock the library's
hunk-expansion and richer diffing later without a contract change.

**Hunk identity stays git-authoritative.** Because the renderer displays hunks parsed from git's own
patch, `stageHunk`/`unstageHunk` identify a hunk by its git positions (path + old/new start lines);
`core` re-runs the diff, re-finds the hunk, and applies that hunk's patch via `git apply --cached`
(`--reverse` to unstage). If the Working tree moved in between, the hunk no longer matches → typed
error, the renderer refetches. No patch text is ever round-tripped from the renderer.

## Considered options

- **Structured `FileDiff` contract parsed in `core` + home-made renderer** (the initial decision,
  reversed in the same design session) — rejected: keeps the schema-SSOT purity but re-implements
  virtualization, split view, word diff, highlighting workers; and the structure would not feed
  `@pierre/diffs` anyway.
- **Ship old/new contents only, let the library compute the diff (jsdiff)** — rejected: the
  displayed hunks would no longer be git's hunks, so hunk staging would have to reconstruct patches
  from the library's structures and own the CRLF / no-newline-at-EOF edge cases.
- **Established tree libs (react-arborist, headless-tree) or generalizing `buildTree.ts`** —
  set aside in favor of ecosystem coherence with `@pierre/diffs` (shared theming). `@pierre/trees`
  is `1.0.0-beta` and renders through an embedded Preact island, so it is wrapped behind a local
  component to keep the exit cheap.

## Consequences

- `@gitoui/contracts` gains a method whose success schema is mostly opaque text (`patch`,
  `oldContent`, `newContent` + flags). Schema validation still guards the envelope; the *content*
  is validated by git itself.
- Syntax highlighting arrives with the library (Shiki): no separate highlighter integration. What
  remains ours is a custom Shiki theme emitting the OKLCH token variables (light + dark), specified
  in `DESIGN.md`, so the code panel obeys the source-derived palette and stays restrained.
- Highlighting runs on the library's worker pool (`DiffWorkerPool` in `DiffBody.tsx`: 2 workers via
  Vite's `?worker` import, warmed at app launch from `AppShell`): the first render paints plain text
  synchronously and Shiki colors stream in, so opening a diff never blocks the UI thread. The
  renderer's `worker.format: 'es'` in `electron.vite.config.ts` exists for this (the worker
  code-splits). The old main-thread path (shared highlighter preloaded and gated in `DiffBody`)
  remains the fallback when the pool is absent (tests) or its workers fail to spawn. Diffs carry a
  content-hash `cacheKey`, so the pool caches highlight results (LRU 100): hovering/focusing a
  Changes or Commit-detail row pre-highlights it (`useDiffPrimer`), making the first open paint
  colorized on its first frame instead of flashing plain text for the tokenization round trip.
- **We carry a one-line patch on `@pierre/diffs`** (`patches/@pierre__diffs@1.2.12.patch`, pnpm
  `patchedDependencies`): `DiffHunksRenderer.hydrate` claims `highlighted: true` with no result when
  it adopts already-painted DOM, which under React StrictMode's double-mount (dev) makes the worker
  response compute `triggerRenderUpdate = false` — first open of a file stayed unhighlighted. The
  patch scopes `highlighted` to "a highlighted result actually exists". Present in 1.2.12 and
  1.3.0-beta.11; re-check on every library upgrade and drop the patch once fixed upstream.
- Hunk expansion on a partial patch is not native to the library; the contents shipped in the
  contract keep that door open but the integration is explicitly future work.
- Two runtime dependencies from one young vendor (diffs stable, trees beta). Mitigation: both are
  consumed behind local wrapper components, and the patch-text contract is renderer-agnostic — a
  home-made renderer could consume the same contract later.
