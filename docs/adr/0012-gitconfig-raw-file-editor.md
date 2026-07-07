# Git config in Settings: raw file editor, not a structured per-key UI

The Settings Git section edits git config as **raw file text**: `~/.gitconfig` plus every file
discovered through `[include]` / `[includeIf]` paths (recursively), each in its own monospace
textarea, with each include's condition (e.g. `gitdir:~/Dev/perso/`) surfaced next to it and
missing include targets shown greyed out. A read-only **Effective identity** banner
(`git config --show-origin` in the active repository) sits above the files, bridging "here are the
files" and "here is what git will actually do".

The deciding constraint is conditional includes. Under `includeIf "gitdir:"`, a per-key form lies
twice over: reads are unstable (the "global" value of `user.email` depends on which directory it is
resolved from), and writes are traps (`git config --global user.name` edits a `[user]` block that
the user's own includes deliberately override — the edit silently does nothing, or worse, breaks an
ordering the file's comments call load-bearing). A raw editor imposes zero interpretation, which is
the literal form of the project's standing rule (ADR 0001, CONTEXT.md): gitoui inherits the user's
git config and never reimplements its policy.

Raw text can break git entirely (an unparseable config fails *every* git command), so saves are
guarded by git's own parser: write to a temp file, validate with `git config --file <tmp> --list`,
then replace atomically. A parse error surfaces inline and nothing is written. This lives in `core`
behind `window.git.*` — config files are git domain, not shell capability.

## Considered options

- **Structured identity form writing `--global`** — rejected: broken on day one for any
  includeIf-based multi-identity setup (including the author's own).
- **Effective view + `--local` overrides only** — honest but weaker: it can't answer "show me and
  fix my actual config", and repo-local writes in an app-global Settings surface are the odd scope.
- **Per-key editor over the resolved config** — rejected: resolution flattens exactly the structure
  (includes, conditions, ordering, comments) the user needs to see to understand their setup.

## Consequences

- The IPC contract is file-shaped (`read files + include graph` / `validate & write file`), not
  key-shaped; a future structured affordance (e.g. an identity quick-edit) must be layered on top
  as a file edit, not a parallel write path.
- gitoui edits the user's real dotfiles; the parser-validation + atomic-replace guard is
  non-negotiable on every write path.
- `includeIf` conditions are displayed, never evaluated by gitoui — only git resolves them (via the
  effective-identity banner).
