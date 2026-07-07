# Merge conflicts: git-native marker text through the IPC, resolution as one write+stage

Extending ADR 0008's philosophy to Conflicted entries: the IPC method that feeds Conflict mode
carries the **Working-tree file content as-is, conflict markers included** (`<<<<<<<` / `=======` /
`>>>>>>>`) — not a parsed section structure, and not the three index versions (base `:1:`, ours
`:2:`, theirs `:3:`). The marker text is git's own resolution surface: it is what `@pierre/diffs`'s
conflict primitive consumes, and partial hand-resolutions made in an external editor stay visible.
The index versions can ride along later without breaking the contract (the same way `oldContent`/
`newContent` accompany `patch` in the diff method).

Resolution is **in-memory until committed to disk in one step**: the renderer holds the per-section
current/incoming/both choices (instant preview), and *Mark resolved* makes a single IPC call — core
writes the resolved file and stages it (resolving *is* staging, per CONTEXT.md). No free-text
editing in-app; the Code & Diff view stays non-editable.

## Considered options

- **Ship the three index versions and reconstruct sections in the renderer** — rejected: ignores
  partial manual resolutions already present in the Working-tree file, and does not match what
  `@pierre/diffs` takes as input.
- **Both markers and index versions in the payload from day one** — rejected: heavier payload with
  no immediate consumer; the contract can grow additively when a base/diff3 view materialises.
- **Write to the Working tree immediately on each section choice (VS Code-style), stage separately**
  — rejected: N writes, a half-resolved state on disk racing the external editor and the watcher,
  and a two-step finish where our domain language says resolving is staging.

## Consequences

- One atomic write+stage means the watcher sees a Conflicted entry flip directly to Staged — no
  intermediate "markers gone but still unmerged" state produced by the app itself.
- If the Working-tree file changes under an open Conflict mode (external edit), the in-memory
  choices are stale; Mark resolved must detect this (same spirit as hunk staging in ADR 0008:
  typed error, renderer refetches).
- Files whose content legitimately contains marker-like lines can confuse marker parsing; accepted
  as the same trade-off every marker-based tool makes.
