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

**Branch**:
A movable named pointer to a Commit. A *local branch* vs a *remote-tracking branch* (e.g. `origin/main`).
_Avoid_: using "ref" when you specifically mean a branch.

**Ref**:
Any named pointer — a Branch, a tag, or a remote-tracking branch. **HEAD** is the pointer to the currently checked-out Commit/Branch.

**Stash** (stash entry):
A saved bundle of Working-tree + Staged changes set aside on the stash stack.
_Avoid_: shelve.

## Example dialogue

> **Dev:** When the user stages `a.txt`, it leaves the Unstaged list, right?
> **Domain:** Not necessarily. If they `git add a.txt` then edit `a.txt` again, the *same path* now has a **Staged** Change (the first edit) **and** an **Unstaged** Change (the second). One path, two entries.
> **Dev:** So the Status isn't a partition of paths into staged-or-unstaged.
> **Domain:** Right — model it like `git status` does (separate staged vs unstaged axes per path), not as a single bucket per file.
