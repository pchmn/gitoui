# gitoui

gitoui is a desktop git client (GitKraken-style). This glossary fixes the **canonical vocabulary** its UI, contracts, and code use for git concepts. Git's own terminology is full of synonyms (index/staging/cache for one notion, "working tree" vs "worktree", an overloaded "checkout"), so we pick **one** term per concept and list the aliases to avoid.

## Language

**Repository**:
A local working copy of a git project — a directory containing a `.git`. The top-level thing the user opens and operates on.
_Avoid_: project, workspace (overloaded with monorepo/editor workspaces). "repo" is fine casually.

**Remote**:
A named connection to a remote repository (e.g. `origin`).
_Avoid_: server. ("origin" is *one* remote, not the concept.)

**Working tree**:
The checked-out files the user edits — everything in the Repository except `.git`.
_Avoid_: working directory, workdir, and especially **worktree** (a different feature, below).

**Worktree** (linked worktree):
An *additional* working tree attached to the same Repository via `git worktree add`, each with its own checked-out branch. Distinct from the **Working tree**.
_Avoid_: conflating with "working tree".

**Status**:
The computed snapshot of a Repository's current state: Staged / Unstaged / Untracked / Conflicted entries, plus the current Branch and its ahead/behind counts. The entity the watcher pushes live.
_Avoid_: "changes" (too vague), "the diff" (that's the rendering).

**Staged** / **Unstaged**:
A change is **Staged** when added for the next commit; **Unstaged** when it is a Working-tree modification not yet added.
_Avoid_: index, cache (git plumbing — kept out of UI and domain code).

**Change**:
A single added / modified / deleted / renamed path within the Status, composed of **Hunks** (contiguous blocks stageable individually).
_Avoid_: using "diff" for a Change (reserve **diff** for the textual rendering of a Change).

**Commit**:
A recorded snapshot in history — one object, identified by its SHA. (Noun.)
_Avoid_: revision, changeset.

**Commit graph** (the graph):
The center view and the product's protagonist — the repository's Commits walked from a
scope of Refs (HEAD first, all Refs later), laid out top-to-bottom with colored **lanes**
drawing branches and merges. The visual rendering *of* the Commits, the way a diff is the
rendering of a Change. "The graph" casually.
_Avoid_: "log" (git plumbing — kept out of UI and domain code, like index/cache);
"revision history". The per-file commit list shown in the Code & Diff view is **File
history** (always qualified) — never bare "History", which would collide with the graph.

**Branch**:
A movable named pointer to a Commit. A *local branch* vs a *remote-tracking branch* (e.g. `origin/main`).
_Avoid_: using "ref" when you specifically mean a branch.

**Remote-tracking branch**:
A read-only local pointer recording where a Branch stood on a Remote at the last fetch (e.g. `origin/main`), under `refs/remotes/`. Distinct from a local Branch: it has no upstream of its own, so ahead/behind don't apply to it.
_Avoid_: "remote branch" (ambiguous with the actual branch living on the server).

**Ref**:
Any named pointer — a Branch, a Tag, or a remote-tracking branch. **HEAD** is the pointer to the currently checked-out Commit/Branch.

**Tag**:
A Ref that names a specific Commit permanently — *lightweight* (a bare pointer) or *annotated* (a tag object carrying a tagger and message). Unlike a Branch, it does not move as new commits land.
_Avoid_: "release" (a Tag is not necessarily a release), "version".

**Detached HEAD**:
The state where HEAD points directly at a Commit instead of a local Branch — no Branch is current. The branch selector surfaces it read-only as `detached @ <sha>` and highlights nothing.
_Avoid_: "no branch", "headless".

**Switch** (verb):
Move HEAD to another local Branch, updating the Working tree to match (`git switch`). The branch-selector action.
_Avoid_: checkout (overloaded — git uses it for branches, files, and detached HEAD alike), "change branch".

**Stash** (stash entry):
A saved bundle of Working-tree + Staged changes set aside on the stash stack.
_Avoid_: shelve.

## Example dialogue

> **Dev:** When the user stages `a.txt`, it leaves the Unstaged list, right?
> **Domain:** Not necessarily. If they `git add a.txt` then edit `a.txt` again, the *same path* now has a **Staged** Change (the first edit) **and** an **Unstaged** Change (the second). One path, two entries.
> **Dev:** So the Status isn't a partition of paths into staged-or-unstaged.
> **Domain:** Right — model it like `git status` does (separate staged vs unstaged axes per path), not as a single bucket per file.
