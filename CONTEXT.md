# gitoui

gitoui is a desktop git client (GitKraken-style). This glossary fixes the **canonical vocabulary** its UI, contracts, and code use for git concepts. Git's own terminology is full of synonyms (index/staging/cache for one notion, "working tree" vs "worktree", an overloaded "checkout"), so we pick **one** term per concept and list the aliases to avoid.

## Language

**Repository**:
The git project itself — identified by its common `.git` — owning one or more working trees: the **main working tree** (created with the clone) plus any linked **Worktrees**. Branches, Tags, Stashes, Remotes, and history belong to the Repository and are shared across all its working trees. What the user opens and operates in is one working tree *of* a Repository.
_Avoid_: project, workspace (overloaded with monorepo/editor workspaces); equating the Repository with one checked-out folder (that's a working tree). "repo" is fine casually.

**Remote**:
A named connection to a remote repository (e.g. `origin`).
_Avoid_: server. ("origin" is *one* remote, not the concept.)

**Working tree**:
One checked-out tree of a Repository — the files the user edits, with its own HEAD and its own Status. A Repository always has a **main working tree** and may have linked **Worktrees**. Unqualified, "the Working tree" means the one currently active.
_Avoid_: working directory, workdir.

**Worktree** (linked worktree):
An *additional* working tree attached to the same Repository via `git worktree add`, with its own checked-out branch. A Branch can be checked out in at most one working tree at a time.
_Avoid_: using "worktree" for the main working tree or for the general concept (that's **Working tree**).

**Status**:
The computed snapshot of a Repository's current state: Staged / Unstaged / Untracked / Conflicted entries, plus the current Branch, its ahead/behind counts, and the Operation in progress (if any). The entity the watcher pushes live.
_Avoid_: "changes" (too vague), "the diff" (that's the rendering).

**Operation** (in progress):
A multi-step git process underway in the Repository that has started but not concluded — a merge, rebase, or cherry-pick. Part of the Status, detected regardless of who started it (gitoui or the terminal). While an Operation is in progress, Switch is refused and Commit concludes the Operation; it ends by concluding or aborting.
_Avoid_: "merge state" (an Operation is not necessarily a merge), "sequencer" (git plumbing).

**Conflicted** (entry):
A path git could not auto-merge during an Operation — it holds unmerged index entries and needs the user to resolve it. Mutually exclusive with Staged/Unstaged for that path: **resolving is staging** — staging the resolved file turns the Conflicted entry into a Staged one. Commit is refused while any Conflicted entry remains.
_Avoid_: "unmerged" (git plumbing), "conflict file".

**Staged** / **Unstaged**:
A change is **Staged** when added for the next commit; **Unstaged** when it is a Working-tree modification not yet added.
_Avoid_: index, cache (git plumbing — kept out of UI and domain code).

**Change**:
A single added / modified / deleted / renamed path within the Status, composed of **Hunks** (contiguous blocks stageable individually).
_Avoid_: using "diff" for a Change (reserve **diff** for the textual rendering of a Change).

**Hunk**:
One contiguous block of modified lines within a Change's diff, delimited by a `@@ -a,b +c,d @@` header and padded with context lines. The unit of fine-grained staging: a Hunk can be Staged or Unstaged independently of the rest of its file.
_Avoid_: "chunk", "block".

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

**Lane**:
A vertical column of the Commit graph occupied by one line of history at a time — each Commit sits in a lane, and the edges to its parents run down lanes. A lane whose line has ended (merged away or bottomed out) can be reused further down by a different line; lanes are told apart by **position + lightness + ref label**, never hue alone.
_Avoid_: "column" (the geometric slot; a lane is the occupancy), "track", "swimlane".

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
The state where HEAD points directly at a Commit instead of a local Branch — no Branch is current. Entered either from outside (terminal, bisect…) or deliberately, by Switching onto a Commit or Tag (a warned gesture). The branch selector surfaces it read-only as `detached @ <sha>` and highlights nothing.
_Avoid_: "no branch", "headless".

**Switch** (verb):
Move HEAD, updating the Working tree to match: onto a local Branch; onto a Remote-tracking branch (which creates the local Branch tracking it); or onto a Commit or Tag (which lands in Detached HEAD, behind a warning).
_Avoid_: checkout (overloaded — git uses it for branches, files, and detached HEAD alike), "change branch".

**Fetch** (verb):
Update the Remote-tracking branches from their Remotes. Never touches the Working tree, local Branches, or HEAD.
_Avoid_: sync, refresh.

**Pull** (verb):
Fetch, then integrate the current Branch with its upstream. How it integrates (merge, rebase, fast-forward) is the user's git config's call, never gitoui's.
_Avoid_: sync, update.

**Push** (verb):
Publish the current Branch's Commits to its upstream. The first Push of an unpublished Branch sets the upstream — publishing *is* the first Push, not a separate concept.
_Avoid_: upload, "publish" (as a distinct action).

**Force push**:
A Push that overwrites the upstream's history after a local rewrite (e.g. a Rebase). gitoui only ever offers the lease-guarded form, behind an explicit confirmation.
_Avoid_: "force update", bare "force".

**Stash** (stash entry):
A saved bundle of Working-tree + Staged changes set aside on the stash stack.
_Avoid_: shelve.

**Inspector**:
The right column of the shell — a tabbed `Changes` ⇄ `Tree` panel that follows the graph selection: nothing or the WIP row selected shows the Working tree's Status (staging + commit); a Commit selected shows that Commit's **Commit detail**. The Tree tab always browses the Working tree.
_Avoid_: "sidebar" (ambiguous with the left rail), "right panel".

**Commit detail**:
The Inspector's rendering of one selected Commit — its metadata (SHA, author, date, full message) and the list of Changes it introduced. Read-only; no staging affordances.
_Avoid_: "commit view", "commit info".

**WIP row**:
The top row of the Commit graph representing the uncommitted state of the Working tree (shown only when the Working tree is dirty). Selecting it — or selecting nothing — puts the Inspector in Changes mode.
_Avoid_: "virtual commit", "uncommitted row".

**Code & Diff view**:
The center view that replaces the Commit graph when a Change or file is opened — a diff rendering or raw file content. Closing it (Esc / ×) returns the graph.
_Avoid_: "editor" (nothing is editable), "diff panel" (it is the center, not the Inspector).

**Conflict mode**:
The Code & Diff view's state while a Conflicted entry is open — each conflicting section offers current / incoming / both, and **Mark resolved** materialises the choices (resolving is staging). Choices are picks, not free-text edits; hand-editing still happens in an external editor.
_Avoid_: "merge tool", "conflict editor" (nothing is free-text editable).

**Review**:
An ephemeral session requested from outside gitoui (typically by an agent's skill) to inspect the diff from an explicit base Commit to the current state of the Working tree. It moves `pending → submitted | dismissed` and is forgotten once resolved — gitoui persists nothing.
_Avoid_: "code review session", "agent review" (nothing in the concept is agent-specific).

**Review mode**:
The center's state while a Review is open — the base → current diff rendered for annotating, ending in Submit or Dismiss.
_Avoid_: "review panel", "review screen".

**Annotation**:
A comment attached to a Review, anchored to a file plus an optional line range and diff side (old/new — needed to point at a deleted line). Without a line range it is file-level. Distinct from `@pierre/diffs`'s rendering "annotations" (a display mechanism) and from *annotated* Tags.
_Avoid_: "comment" (collides with commit messages and code comments), "note".

**Verdict**:
The overall outcome of a submitted Review: **approve** or **request changes**, alongside an optional summary and the Annotations.
_Avoid_: "status" (that is the Review's lifecycle state), "outcome".

**Settings**:
gitoui's own app-scoped preferences (appearance: theme mode + source color; later more), owned and persisted by gitoui. Git configuration is **not** a Setting — it lives in git's own config files, which gitoui reads and edits in place but never mirrors.
_Avoid_: preferences, options.

**Effective identity**:
The `user.name` + `user.email` git resolves for a given Repository after applying every config layer (global file, conditional includes, repo-local config) — the author identity the next commit will actually carry. There is no single "global identity" once conditional includes are in play; identity is always effective *somewhere*.
_Avoid_: "global identity" (misleading under `includeIf`), "git profile".

## Example dialogue

> **Dev:** When the user stages `a.txt`, it leaves the Unstaged list, right?
> **Domain:** Not necessarily. If they `git add a.txt` then edit `a.txt` again, the *same path* now has a **Staged** Change (the first edit) **and** an **Unstaged** Change (the second). One path, two entries.
> **Dev:** So the Status isn't a partition of paths into staged-or-unstaged.
> **Domain:** Right — model it like `git status` does (separate staged vs unstaged axes per path), not as a single bucket per file.
