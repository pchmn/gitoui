# RepoWatcher uses one recursive `fs.watch`, not per-directory watchers

The `RepoWatcher` service (decision #7) watches a Repository with a single
`node:fs.watch(repoPath, { recursive: true })` — one OS subscription (FSEvents on macOS,
`ReadDirectoryChangesW` on Windows) for the whole tree. Event paths are filtered in JS: working-tree
paths trigger a debounced Status recompute (minus a pruned-dirs list, below), and under `.git/`
only `index`, `HEAD`, and `refs/**` count.

The pruned-dirs list (`PRUNED_DIRS`: `node_modules`, `.venv`/`venv`, `__pycache__` + Python tool
caches, `target`, `.gradle`, `.terraform`, `.direnv`) is a curated constant, **not** an attempt at
`.gitignore` semantics. Inclusion criterion: the dir is never committed *by design* in its
ecosystem's convention AND churns hard during a normal dev session (installs, cargo/rust-analyzer,
pytest). Names that are conventionally ignored but legitimately committed in some ecosystems —
`vendor` (Go), `Pods` (CocoaPods), `dist`/`build` (GitHub Pages, published libs) — stay watched,
because the two failure modes are asymmetric: watching too much wastes a debounced `git status`
whose identical result TanStack's structural sharing absorbs; ignoring too much silently misses a
live Status update. Honoring the repo's actual `.gitignore` was rejected: git's real semantics
(nested files, `!` negations, `info/exclude`, global `core.excludesFile`, cache invalidation when
a `.gitignore` itself changes) make "ignore too much" bugs likely, and the only exact oracle is
git itself — calling git to decide whether to call git costs what it saves.

## Considered options

- **chokidar (v4)** — the first implementation; rejected after it EMFILE-crashed on real repos.
  Since v4 chokidar has no fsevents backend and opens **one fd per directory**, so any large tree
  (every `node_modules` in a monorepo, a Rust `target/`, a Python `.venv/`) exhausts the process's
  file-handle limit. Blocklisting `node_modules` in its `ignored` predicate only shrinks the blast
  radius — the next big ignored directory brings the crash back. And the value chokidar adds over
  raw `fs.watch` (stat tracking, ready/add/unlink event taxonomy, polling fallbacks) is value this
  consumer doesn't use: `RepoWatcher` only needs "something changed at *path*" to debounce one
  `git status` call.
- **Watch only `.git/`** — rejected: `.git` changes on git *operations* (`add` → index,
  commit/checkout → `HEAD`/`refs`), but a plain editor save in the working tree touches nothing
  under `.git`. That's the single most common event a git UI must react to, so a `.git`-only
  watcher misses live "dirty" status entirely.
- **`@parcel/watcher`** — native recursive backend on all three platforms, but a native module in
  Electron means rebuild toolchain and ABI coupling for capability we get from `node:fs` for free
  on the platforms we ship today.

## Consequences

- Zero dependencies for watching; `entry.watcher.close()` is synchronous.
- `filename` can be `null` when the OS can't attribute an event — treated as relevant
  (conservative recompute; the debounce absorbs it).
- Watching `.git/index` makes gitoui's own `git status` a feedback loop: `status` opportunistically
  rewrites the index (stat-cache refresh), which the watcher sees as a change and recomputes from
  its own recompute. Fixed at the source: `runGit` invokes `git --no-optional-locks …` (as a binary
  arg, not `GIT_OPTIONAL_LOCKS` via simple-git's `.env()`, which replaces the whole child env and
  then rejects the user's own `GIT_SSH_COMMAND`/`GIT_ASKPASS`). This is what git recommends for
  background GUI invocations; it also stops gitoui contending for `index.lock` with the user's
  terminal git.
- **Linux caveat:** Node's recursive `fs.watch` on Linux walks and watches directories
  individually under the hood, so the EMFILE risk class returns there. If Linux becomes a shipping
  target, swap the backend to `@parcel/watcher` behind this same seam — the service API
  (`watchStatus`, ref-counted `entries`) doesn't change.
- Gitignored dirs outside `PRUNED_DIRS` (`dist/`, `.turbo/`, …) still trigger recomputes; with one
  OS handle that costs a debounced `git status` per churn burst, not fds. A repo that *commits* a
  `PRUNED_DIRS` name (vendored `node_modules`, a folder literally named `target`) gets no live
  Status for edits inside it — accepted; a user-configurable list is the escape hatch if it ever
  bites.
