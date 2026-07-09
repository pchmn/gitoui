# Repository identity is the common `.git`; the active unit is one working tree

A Repository is identified by its **common git dir** (`git rev-parse --git-common-dir`), not by a
checked-out folder. It owns one or more working trees — the main working tree plus any linked
Worktrees (`git worktree add`) — which share branches, tags, stashes, remotes, and history. What
the shell activates, addresses, and persists is **one working tree at a time**: every `GitClient`
call and IPC contract keeps taking a plain working-tree root path (the core stays stateless), and
`resolveRepository` additionally reports the common dir so the app can tell that two roots belong
to the same Repository (selector grouping, "checked out in another worktree" indicators, the
Worktrees rail section).

## Considered options

- **Each root is its own Repository, with an optional "linked" grouping bolted on** — rejected:
  it forces N identical branch/tag/stash lists to be fetched and kept in sync per worktree while
  pretending they are unrelated repos, and makes "add a worktree" (an operation *on* a Repository)
  conceptually homeless. The grouping key ends up being the common dir anyway.
- **Merged view: the Repository is active and all its working trees render at once (multi-WIP
  graph, GitButler-style)** — rejected: multi-Status/multi-HEAD is a paradigm change that fights
  "the graph is the protagonist, chrome recedes", and requires watching every working tree
  permanently. Cross-worktree awareness is expressed with indicators instead.

## Consequences

- Worktree membership is **never persisted** — `git worktree list --porcelain` is the SSOT,
  discovered live (terminals and agents create/remove worktrees outside gitoui constantly).
  Recents stay flat working-tree paths; grouping by common dir is computed at display time.
- The "one fs-watcher per repo" invariant reads *per Repository (per common dir)*: one watcher
  covering (a) the active working tree's files → Status, and (b) the shared `.git` — per-worktree
  `HEAD`s, `refs/`, `worktrees/` — → branch list, worktree list, checked-out-elsewhere indicators.
  Inactive working trees' files are not watched.
- Switching onto a branch checked out in another worktree is not an error to parse and regret: the
  gesture becomes "Go to Worktree" (behind a one-line confirmation), and the race is covered by a
  typed `BranchCheckedOutElsewhereError` instead of today's misleading catch-all.
- Bare repositories stay unopenable themselves, but their linked worktrees resolve normally, so
  the bare-clone + all-worktrees pattern works end to end (a Repository may have no main working
  tree).
