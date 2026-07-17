import type {
  Branch,
  BranchList,
  Change,
  ChangeKind,
  Commit,
  CommitDetail,
  Ref,
  Remote,
  RemoteList,
  ResolvedRepository,
  Stash,
  StashList,
  Status,
  StatusChange,
  StatusEntry,
  TagList,
} from '@gitoui/contracts/git';
import {
  BranchExistsError,
  GitCommandError,
  InvalidBranchNameError,
  NotARepositoryError,
  RepoNotFoundError,
  UncommittedChangesError,
} from '@gitoui/contracts/git';
import { Effect } from 'effect';
import { withGit } from './runGit.ts';

/**
 * Parse the output of `git for-each-ref --format=... refs/heads` into a branch list and the name
 * of the current branch (or null when in Detached HEAD). Pure function — no IO — so it can be
 * unit-tested against pinned output without spawning git.
 *
 * Format: `%(refname:short)\t%(upstream:short)\t%(upstream:track)\t%(HEAD)`
 * Each field is separated by a literal TAB. Refnames forbid TAB; the track field only contains
 * `[ahead N]`, `[behind N]`, `[ahead N, behind N]`, `[gone]`, or empty — so TAB-splitting is
 * unambiguous (space-splitting is not).
 */
export function parseForEachRef(stdout: string): {
  branches: Branch[];
  currentBranchName: string | null;
} {
  const branches: Branch[] = [];
  let currentBranchName: string | null = null;

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    const name = fields[0] ?? '';
    const upstream = fields[1] ?? '';
    const track = fields[2] ?? '';
    const head = fields[3] ?? '';

    const ahead = Number(track.match(/ahead (\d+)/)?.[1] ?? 0);
    const behind = Number(track.match(/behind (\d+)/)?.[1] ?? 0);
    const isCurrent = head.trim() === '*';

    if (isCurrent) currentBranchName = name;

    branches.push({
      name,
      isCurrent,
      upstream: upstream.length > 0 ? upstream : undefined,
      ahead,
      behind,
    });
  }

  return { branches, currentBranchName };
}

/**
 * Parse the output of `git for-each-ref --format=%(refname:lstrip=2) refs/remotes` into a map
 * of remote name → tracking branch names (WITHOUT the remote prefix), dropping `origin/HEAD`
 * symbolic refs.
 *
 * Each line is `remote/branch` (e.g. `origin/main`). Split on the first `/` to extract the
 * remote name and branch segment. Lines with no `/` (malformed) are skipped.
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parseRemoteTrackingRefs(stdout: string): Map<string, string[]> {
  const remoteMap = new Map<string, string[]>();

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const slashIdx = trimmed.indexOf('/');
    if (slashIdx === -1) continue;

    const remoteName = trimmed.slice(0, slashIdx);
    const branchName = trimmed.slice(slashIdx + 1);

    // Drop symbolic refs like origin/HEAD.
    if (branchName === 'HEAD') continue;

    const existing = remoteMap.get(remoteName);
    if (existing) {
      existing.push(branchName);
    } else {
      remoteMap.set(remoteName, [branchName]);
    }
  }

  return remoteMap;
}

/**
 * From a failed checkout's stderr: the conflicting paths if it's the "would be overwritten"
 * refusal, else null (the caller maps null → RepoNotFoundError). git TAB-indents each path.
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parseOverwriteError(message: string): string[] | null {
  if (!message.includes('would be overwritten by checkout')) return null;
  return message
    .split('\n')
    .filter((line) => line.startsWith('\t'))
    .map((line) => line.trim());
}

/**
 * Extract a concise, human-facing message from a failed git command's cause (simple-git's
 * `GitError.message` is git's raw stderr). Returns the first non-empty line, trimmed — enough to
 * name the failure (`fatal: pathspec '…' did not match any files`) without dumping git's multi-line
 * hint blocks into a Toast. Falls back to a generic phrase when there's nothing usable.
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function extractGitMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const firstLine = raw
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? 'git command failed';
}

/**
 * True when a `git restore --staged` failure is the unborn-HEAD case: a Repository with no commits,
 * where `restore` can't resolve HEAD (git prints `fatal: could not resolve HEAD`). The caller then
 * falls back to `git rm --cached`, which unstages the (necessarily-added) path without a HEAD.
 * `rm --cached` would be WRONG on a normal HEAD — it stages a deletion instead of unstaging a
 * modification — so this guard keeps the fallback to the unborn case only.
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function isUnbornHeadError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.includes('could not resolve HEAD');
}

/**
 * Parse the output of `git stash list --format=%gd%x00%gs%x00%H` into a list of stashes.
 * Each stash entry is NUL-delimited on a single line, lines are LF-separated.
 *
 * Subject prefixes:
 *   `WIP on <branch>: <rest>` — auto-stash message
 *   `On <branch>: <rest>`    — named stash
 *   `<anything else>`        — custom note, branch is undefined
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parseStashList(stdout: string): Stash[] {
  const stashes: Stash[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\0');
    const id = parts[0] ?? '';
    const subject = parts[1] ?? '';

    // Try "WIP on <branch>: <rest>"
    const wipMatch = subject.match(/^WIP on ([^:]+): (.*)$/);
    if (wipMatch) {
      stashes.push({ id, message: wipMatch[2] ?? '', branch: wipMatch[1] ?? undefined });
      continue;
    }
    // Try "On <branch>: <rest>"
    const onMatch = subject.match(/^On ([^:]+): (.*)$/);
    if (onMatch) {
      stashes.push({ id, message: onMatch[2] ?? '', branch: onMatch[1] ?? undefined });
      continue;
    }
    // No prefix — custom note
    stashes.push({ id, message: subject });
  }
  return stashes;
}

/**
 * Parse one `%D` ref decoration (emitted under `--decorate=full`) into the Refs sitting on that
 * Commit. Pure function — no IO — so it can be unit-tested against pinned output without
 * spawning git.
 *
 * `--decorate=full` is load-bearing: it emits FULL ref paths, so a local Branch
 * `feature/pay-fallback` and a remote-tracking `origin/main` — both slash-bearing short names —
 * stay distinguishable by prefix. Entries are `, `-separated and classified as:
 *
 * - `HEAD -> refs/heads/<name>` → `Branch { name, current: true }` (a single Branch; no separate `Head`)
 * - `refs/heads/<name>`         → `Branch { name, current: false }`
 * - `refs/remotes/<name>`       → `RemoteBranch { name }` (name keeps the remote prefix, e.g. `origin/main`)
 * - `tag: refs/tags/<name>`     → `Tag { name }`
 * - `HEAD` (alone — Detached HEAD) → `Head {}`
 *
 * Anything else (e.g. `refs/stash`) is not a Ref the graph draws — skipped.
 */
export function parseRefDecoration(decoration: string): Ref[] {
  const refs: Ref[] = [];

  for (const entry of decoration.split(', ')) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.includes(' -> ')) {
      // `HEAD -> refs/heads/<name>` — the checked-out Branch. One Branch, not a Branch + a Head.
      const target = trimmed.split(' -> ')[1] ?? '';
      if (target.startsWith('refs/heads/')) {
        refs.push({ _tag: 'Branch', name: target.slice('refs/heads/'.length), current: true });
      }
    } else if (trimmed.startsWith('tag: refs/tags/')) {
      refs.push({ _tag: 'Tag', name: trimmed.slice('tag: refs/tags/'.length) });
    } else if (trimmed.startsWith('refs/heads/')) {
      refs.push({ _tag: 'Branch', name: trimmed.slice('refs/heads/'.length), current: false });
    } else if (trimmed.startsWith('refs/remotes/')) {
      refs.push({ _tag: 'RemoteBranch', name: trimmed.slice('refs/remotes/'.length) });
    } else if (trimmed === 'HEAD') {
      refs.push({ _tag: 'Head' });
    }
  }

  return refs;
}

/**
 * Parse the output of `git log --decorate=full` formatted with
 * `--format=%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%at%x1f%ct%x1f%s%x1f%b%x1f%D%x1e`
 * into a `Commit[]`. Each record is RS (`\x1e`)-terminated; fields within a record are US
 * (`\x1f`)-separated. `refs` comes from the `%D` decoration via `parseRefDecoration`.
 *
 * - `%P` is space-separated parent SHAs (`[]` for a root commit; `length >= 2` is a merge).
 * - `%at` / `%ct` are epoch SECONDS — multiplied by 1000 for the MS fields.
 * - `%b` may itself contain newlines (it's the last field before the RS terminator); only a single
 *   trailing newline is trimmed.
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parseCommitLog(raw: string): Commit[] {
  const commits: Commit[] = [];

  // Drop the trailing record left by the final RS terminator — git appends a '\n' after it, so
  // the leftover is "\n", not "" (hence trim, not a bare length check).
  const records = raw.split('\x1e').filter((record) => record.trim().length > 0);

  for (const record of records) {
    // git emits a '\n' after each record's RS terminator, which becomes a leading '\n' on every
    // record but the first once split on '\x1e' — strip it before field-splitting.
    const fields = record.replace(/^\n/, '').split('\x1f');
    const sha = fields[0] ?? '';
    const parentsRaw = fields[1] ?? '';
    const authorName = fields[2] ?? '';
    const authorEmail = fields[3] ?? '';
    const committerName = fields[4] ?? '';
    const committerEmail = fields[5] ?? '';
    const authoredAtRaw = fields[6] ?? '';
    const committedAtRaw = fields[7] ?? '';
    const subject = fields[8] ?? '';
    // %b may itself contain newlines; git appends one trailing newline before the %x1f
    // separator — trim a single trailing newline only.
    const body = (fields[9] ?? '').replace(/\n$/, '');
    const decoration = fields[10] ?? '';

    commits.push({
      sha,
      parents: parentsRaw.split(' ').filter(Boolean),
      author: { name: authorName, email: authorEmail },
      committer: { name: committerName, email: committerEmail },
      authoredAt: Number(authoredAtRaw) * 1000,
      committedAt: Number(committedAtRaw) * 1000,
      subject,
      body,
      refs: parseRefDecoration(decoration),
    });
  }

  return commits;
}

/**
 * Map a single porcelain=v2 status letter (the X or Y of an `<XY>` field) to a `ChangeKind`.
 * `T` (type change, e.g. file → symlink) and `U` (unmerged) both fold into `modified` — the domain
 * has no dedicated kind for them yet, and Conflicted (`u` records) is out of scope for this epic
 * (see issue #60 / CONTEXT.md). `C` (copy) surfaces the new path as `added`.
 */
function mapStatusCode(code: string): ChangeKind {
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'added';
    default:
      // M, T, U, and any unexpected letter — treat as a modification.
      return 'modified';
  }
}

/**
 * Parse `git status --porcelain=v2 --branch -z` into the current branch, ahead/behind counts, and
 * the two-axis `StatusEntry` list (WITHOUT numstat stats — those are merged in by the caller).
 *
 * Records are NUL-terminated (`-z`); split on `\0` and scan, because a rename record (`2 …`) spans
 * TWO tokens — the record itself, then a second NUL-terminated token holding the original path
 * (`-z` swaps the usual TAB path-separator for a NUL). Header records (`# …`) carry the branch /
 * ahead-behind. Per-file records:
 *
 * - `1 <XY> …  <path>`                — ordinary change. X ≠ `.` → staged axis; Y ≠ `.` → unstaged.
 * - `2 <XY> … <Xscore> <path>` + path — rename/copy. Same XY axes; the next token is `oldPath`.
 * - `? <path>`                        — untracked → `unstaged: { kind: 'untracked' }`.
 * - `u <XY> … <path>`                 — unmerged/Conflicted. Out of scope: both axes → `modified`.
 * - `! <path>`                        — ignored; skipped (only emitted with `--ignored`).
 *
 * With `-z` git does NOT quote paths, so a path may contain spaces — everything after the fixed
 * leading fields is the path (`slice(n).join(' ')`), never a naive `split(' ')[n]`.
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parsePorcelainV2(stdout: string): {
  branch: string;
  ahead: number;
  behind: number;
  entries: StatusEntry[];
} {
  let branch = 'HEAD';
  let ahead = 0;
  let behind = 0;
  const entries: StatusEntry[] = [];

  const tokens = stdout.split('\0');
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    if (token.length === 0) {
      i += 1;
      continue;
    }

    if (token.startsWith('# ')) {
      if (token.startsWith('# branch.head ')) {
        const head = token.slice('# branch.head '.length);
        // `(detached)` isn't a branch — keep the prior `HEAD` placeholder (branch isn't the point
        // of this method; the graph owns Detached-HEAD rendering).
        if (head !== '(detached)') branch = head;
      } else if (token.startsWith('# branch.ab ')) {
        // `+<ahead> -<behind>` — only present when an upstream is configured.
        const match = token.match(/\+(\d+) -(\d+)/);
        ahead = Number(match?.[1] ?? 0);
        behind = Number(match?.[2] ?? 0);
      }
      i += 1;
      continue;
    }

    const type = token[0];
    const fields = token.split(' ');

    if (type === '1' || type === '2') {
      const xy = fields[1] ?? '..';
      const x = xy[0] ?? '.';
      const y = xy[1] ?? '.';
      // Ordinary records carry the path from field 8; rename/copy records add an `<Xscore>` field,
      // pushing the path to field 9.
      const path = fields.slice(type === '1' ? 8 : 9).join(' ');
      // Mutable while we fill the axes; `StatusEntry`'s own fields are readonly (schema-derived).
      const entry: {
        path: string;
        oldPath?: string;
        staged?: StatusChange;
        unstaged?: StatusChange;
      } = { path };
      if (x !== '.') entry.staged = { kind: mapStatusCode(x) };
      if (y !== '.') entry.unstaged = { kind: mapStatusCode(y) };
      if (type === '2') {
        // The original path is the following NUL-terminated token.
        entry.oldPath = tokens[i + 1] ?? '';
        i += 2;
      } else {
        i += 1;
      }
      entries.push(entry);
      continue;
    }

    if (type === '?') {
      entries.push({ path: token.slice(2), unstaged: { kind: 'untracked' } });
      i += 1;
      continue;
    }

    if (type === 'u') {
      // Conflicted — out of scope for this epic (issue #60). Surface it as a change on both axes so
      // the count is honest, mapping both to `modified` until real conflict handling lands.
      const path = fields.slice(10).join(' ');
      entries.push({ path, staged: { kind: 'modified' }, unstaged: { kind: 'modified' } });
      i += 1;
      continue;
    }

    // `!` ignored records (only with --ignored) and anything unexpected — skip.
    i += 1;
  }

  return { branch, ahead, behind, entries };
}

/**
 * Parse `git diff --numstat -z` (or `--cached`) into a `path → { additions?, deletions? }` map.
 *
 * Each record is `additions\tdeletions\t<path>\0`. Two seams: binary files print `-\t-` → both
 * counts OMITTED (kept optional in the schema); renames print `additions\tdeletions\t\0old\0new\0`,
 * i.e. an empty path slot followed by two extra NUL tokens — keyed on the NEW path (`git status`
 * reports the entry under its new path, so this merges cleanly).
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parseNumstat(
  stdout: string,
): Map<string, { additions?: number; deletions?: number }> {
  const stats = new Map<string, { additions?: number; deletions?: number }>();

  const tokens = stdout.split('\0');
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    if (token.length === 0) {
      i += 1;
      continue;
    }

    const firstTab = token.indexOf('\t');
    const secondTab = token.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      // Malformed — skip defensively.
      i += 1;
      continue;
    }

    const addStr = token.slice(0, firstTab);
    const delStr = token.slice(firstTab + 1, secondTab);
    const rest = token.slice(secondTab + 1);

    let path: string;
    if (rest.length === 0) {
      // Rename/copy: the two following NUL tokens are old, then new. Key on the new path.
      path = tokens[i + 2] ?? '';
      i += 3;
    } else {
      path = rest;
      i += 1;
    }

    const entry: { additions?: number; deletions?: number } = {};
    if (addStr !== '-') entry.additions = Number(addStr);
    if (delStr !== '-') entry.deletions = Number(delStr);
    stats.set(path, entry);
  }

  return stats;
}

/**
 * The canonical empty-tree SHA (`git hash-object -t tree /dev/null`) — every git repository shares
 * this constant object. Diffing a root Commit against it is the standard way to see its full tree
 * as added, since a root Commit has no parent to diff against (issue #65).
 */
export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * Parse `git diff-tree -r -M -z --name-status <base> <sha>` into a `{ path, oldPath?, kind }[]`
 * (issue #65). With `-z`, name-status is fully NUL-token-delimited (unlike `git status`'s TAB-then-
 * NUL mix): an ordinary record is `<status>\0<path>\0`; a rename/copy record (`-M` detects renames)
 * is `<R|C><score>\0<oldPath>\0<newPath>\0` — three tokens, `path` keyed on the NEW path. Reuses
 * `mapStatusCode` on the status token's first letter (`R100` → `R`).
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function parseDiffTreeNameStatus(
  stdout: string,
): { path: string; oldPath?: string; kind: ChangeKind }[] {
  const changes: { path: string; oldPath?: string; kind: ChangeKind }[] = [];
  const tokens = stdout.split('\0').filter((token) => token.length > 0);

  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i] ?? '';
    const letter = status[0] ?? '';
    const kind = mapStatusCode(letter);

    if (letter === 'R' || letter === 'C') {
      const oldPath = tokens[i + 1] ?? '';
      const path = tokens[i + 2] ?? '';
      changes.push({ path, oldPath, kind });
      i += 3;
    } else {
      const path = tokens[i + 1] ?? '';
      changes.push({ path, kind });
      i += 2;
    }
  }

  return changes;
}

/**
 * Enrich one axis's `StatusChange` with its numstat line counts. A missing change stays missing; a
 * missing/empty (binary) stats lookup leaves `additions`/`deletions` off.
 */
function withStats(
  change: StatusChange | undefined,
  stats: { additions?: number; deletions?: number } | undefined,
): StatusChange | undefined {
  if (change === undefined) return undefined;
  if (stats === undefined) return change;
  return { ...change, ...stats };
}

/**
 * Extract the human-facing reason from a failed `git commit`'s STDOUT (issue #63). simple-git's
 * `raw()` does NOT reject when `git commit` exits non-zero for its own "nothing to commit"-style
 * refusal — unlike `add`/`restore`, there's no dedicated error path, so the resolved value IS
 * that stdout text (see the `commit` method, which detects the failure itself via HEAD not
 * moving and hands this that text). git always leads with `On branch <name>` — the actual reason
 * (`nothing to commit, working tree clean` / `no changes added to commit (…)`) sits on the LAST
 * non-empty line, unlike a real stderr `fatal:` failure where it's the FIRST (`extractGitMessage`).
 *
 * Pure function — no IO — so it can be unit-tested against pinned output without spawning git.
 */
export function extractCommitFailureMessage(stdout: string): string {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[lines.length - 1] ?? 'nothing to commit';
}

/**
 * The git engine, as an Effect service (DI via Layer). Methods return Effects with typed errors.
 */
export class GitClient extends Effect.Service<GitClient>()('@gitoui/core/GitClient', {
  succeed: {
    /**
     * Canonicalize a picked path to its Repository identity (decision #2). `--show-toplevel`
     * resolves any path inside a work tree to its root and follows symlinks; a non-repo / bare
     * repo / gone path makes git exit non-zero → `NotARepositoryError`. An empty result (defensive:
     * some git versions print nothing in odd setups) is treated the same way.
     */
    resolveRepository: (path: string): Effect.Effect<ResolvedRepository, NotARepositoryError> =>
      withGit(path, async (git) => (await git.revparse(['--show-toplevel'])).trim()).pipe(
        Effect.flatMap((root) =>
          root.length > 0
            ? Effect.succeed({ root })
            : Effect.fail(new NotARepositoryError({ path })),
        ),
        Effect.catchTag('GitProcessError', () => new NotARepositoryError({ path })),
      ),

    /**
     * The real two-axis Status (issue #60). Composes three raw git calls, merged by path:
     *
     * 1. `git status --porcelain=v2 --branch --untracked-files=all -z` — the branch/ahead/behind
     *    header and one record per path with its `<XY>` staged/unstaged axes (see
     *    `parsePorcelainV2`). `--untracked-files=all` expands untracked directories to their
     *    individual files (git's default folds them to a single dir entry) so each new file is a
     *    row, matching what users see in other clients.
     * 2. `git diff --numstat -z` — per-path line counts for the UNSTAGED axis (work tree vs index).
     * 3. `git diff --cached --numstat -z` — per-path line counts for the STAGED axis (index vs HEAD).
     *
     * Each axis is enriched from its own numstat, so a path staged then re-edited carries distinct
     * stats per axis. Untracked/binary paths keep `kind` but no stats (they don't appear in numstat,
     * or print `- -`). Maps `GitProcessError` → `RepoNotFoundError`, same as the list* methods.
     */
    status: (repoPath: string): Effect.Effect<Status, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const [porcelain, unstagedNumstat, stagedNumstat] = await Promise.all([
          git.raw(['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z']),
          git.raw(['diff', '--numstat', '-z']),
          git.raw(['diff', '--cached', '--numstat', '-z']),
        ]);

        const { branch, ahead, behind, entries } = parsePorcelainV2(porcelain);
        const unstagedStats = parseNumstat(unstagedNumstat);
        const stagedStats = parseNumstat(stagedNumstat);

        return {
          branch,
          ahead,
          behind,
          entries: entries.map((entry) => ({
            ...entry,
            staged: withStats(entry.staged, stagedStats.get(entry.path)),
            unstaged: withStats(entry.unstaged, unstagedStats.get(entry.path)),
          })),
        } satisfies Status;
      }).pipe(Effect.catchTag('GitProcessError', () => new RepoNotFoundError({ path: repoPath }))),

    /**
     * List all local Branches with their ahead/behind counts and the current HEAD state (issue #15).
     *
     * Single `for-each-ref` over `refs/heads` for the whole list + ahead/behind; HEAD state is
     * derived from the same output. Only when no branch is current (Detached HEAD) is a second
     * `rev-parse --short HEAD` call made (O(1) constant cost, not O(branches)).
     */
    listBranches: (repoPath: string): Effect.Effect<BranchList, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const out = await git.raw([
          'for-each-ref',
          '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)\t%(HEAD)',
          'refs/heads',
        ]);
        const { branches, currentBranchName } = parseForEachRef(out);

        if (currentBranchName !== null) {
          return {
            branches,
            head: { _tag: 'OnBranch' as const, branch: currentBranchName },
          } satisfies BranchList;
        }

        // Detached HEAD — one extra rev-parse to get the short SHA.
        const sha = (await git.revparse(['--short', 'HEAD'])).trim();
        return { branches, head: { _tag: 'Detached' as const, sha } } satisfies BranchList;
      }).pipe(Effect.catchTag('GitProcessError', () => new RepoNotFoundError({ path: repoPath }))),

    /**
     * Switch HEAD to a local Branch (issue #16). Runs `git checkout <branch>` and succeeds with
     * void. Switching to the current Branch is a harmless git no-op (exits 0). On failure, maps
     * the "would be overwritten" refusal to `UncommittedChangesError` (carrying the conflicting
     * paths) and every other failure to `RepoNotFoundError`.
     */
    switchBranch: (
      repoPath: string,
      branch: string,
    ): Effect.Effect<void, RepoNotFoundError | UncommittedChangesError> =>
      withGit(repoPath, (git) => git.checkout(branch))
        .pipe(Effect.asVoid)
        .pipe(
          Effect.catchTag(
            'GitProcessError',
            (e): Effect.Effect<never, RepoNotFoundError | UncommittedChangesError> => {
              const message = e.cause instanceof Error ? e.cause.message : String(e.cause);
              const paths = parseOverwriteError(message);
              return paths !== null
                ? Effect.fail(new UncommittedChangesError({ paths }))
                : Effect.fail(new RepoNotFoundError({ path: repoPath }));
            },
          ),
        ),

    /**
     * Create a new Branch from HEAD and switch onto it in one step (issue #17). Runs
     * `git checkout -b <name>` (`checkoutLocalBranch`). On failure, maps the stderr:
     * "already exists" → `BranchExistsError`, "is not a valid branch name" →
     * `InvalidBranchNameError`, everything else → `RepoNotFoundError`. Name validity is
     * delegated to git — no hand-rolled regex (decision #4).
     */
    createBranch: (
      repoPath: string,
      name: string,
    ): Effect.Effect<void, RepoNotFoundError | BranchExistsError | InvalidBranchNameError> =>
      withGit(repoPath, (git) => git.checkoutLocalBranch(name))
        .pipe(Effect.asVoid)
        .pipe(
          Effect.catchTag(
            'GitProcessError',
            (
              e,
            ): Effect.Effect<
              never,
              RepoNotFoundError | BranchExistsError | InvalidBranchNameError
            > => {
              const message = e.cause instanceof Error ? e.cause.message : String(e.cause);
              if (message.includes('already exists'))
                return Effect.fail(new BranchExistsError({ name }));
              if (message.includes('is not a valid branch name'))
                return Effect.fail(new InvalidBranchNameError({ name }));
              return Effect.fail(new RepoNotFoundError({ path: repoPath }));
            },
          ),
        ),

    /**
     * Stage one path (issue #62). `git add -- <path>` — since git 2.0 this also records deletions,
     * so a deleted file needs no special-casing. A failure (a refused pathspec, an embedded-repo
     * edge case, …) surfaces as `GitCommandError` carrying git's own message — NOT `RepoNotFoundError`
     * (the Repository is open; the operation is what failed).
     */
    stageFile: (repoPath: string, path: string): Effect.Effect<void, GitCommandError> =>
      withGit(repoPath, async (git) => {
        await git.raw(['add', '--', path]);
      }).pipe(
        Effect.catchTag(
          'GitProcessError',
          (e) => new GitCommandError({ message: extractGitMessage(e.cause) }),
        ),
      ),

    /**
     * Unstage one path (issue #62). `git restore --staged -- <path>` on a normal HEAD; on an unborn
     * HEAD that fails to resolve HEAD, so fall back to `git rm --cached -q -- <path>` (see
     * `isUnbornHeadError` for why the fallback is gated to that case). The try/catch keeps both
     * attempts inside one `withGit`, so the fiber's abort signal still reaches whichever git runs.
     * Any other failure surfaces as `GitCommandError` carrying git's message.
     */
    unstageFile: (repoPath: string, path: string): Effect.Effect<void, GitCommandError> =>
      withGit(repoPath, async (git) => {
        try {
          await git.raw(['restore', '--staged', '--', path]);
        } catch (cause) {
          if (!isUnbornHeadError(cause)) throw cause;
          await git.raw(['rm', '--cached', '-q', '--', path]);
        }
      }).pipe(
        Effect.catchTag(
          'GitProcessError',
          (e) => new GitCommandError({ message: extractGitMessage(e.cause) }),
        ),
      ),

    /**
     * Stage every change in the Working tree (issue #62). `git add -A` stages modifications,
     * additions, and deletions across the whole tree. Failure → `GitCommandError` (git's message).
     */
    stageAll: (repoPath: string): Effect.Effect<void, GitCommandError> =>
      withGit(repoPath, async (git) => {
        await git.raw(['add', '-A']);
      }).pipe(
        Effect.catchTag(
          'GitProcessError',
          (e) => new GitCommandError({ message: extractGitMessage(e.cause) }),
        ),
      ),

    /**
     * Unstage everything (issue #62). `git restore --staged .` on a normal HEAD, with the same
     * unborn-HEAD fallback as `unstageFile` (`git rm --cached -r -q -- .`). Failure →
     * `GitCommandError` (git's message).
     */
    unstageAll: (repoPath: string): Effect.Effect<void, GitCommandError> =>
      withGit(repoPath, async (git) => {
        try {
          await git.raw(['restore', '--staged', '.']);
        } catch (cause) {
          if (!isUnbornHeadError(cause)) throw cause;
          await git.raw(['rm', '--cached', '-r', '-q', '--', '.']);
        }
      }).pipe(
        Effect.catchTag(
          'GitProcessError',
          (e) => new GitCommandError({ message: extractGitMessage(e.cause) }),
        ),
      ),

    /**
     * Commit exactly the Staged set (issue #63). Plain `git commit -m <message>` — NEVER `-a`, so
     * only what's already in the index lands in the Commit; the message crosses verbatim (multi-line
     * allowed, no processing). Returns the new Commit's SHA via a follow-up `rev-parse HEAD`.
     *
     * Seam: simple-git's `raw()` does NOT reject when `git commit` exits non-zero for its own
     * "nothing to commit" refusal (verified against simple-git's actual behavior — no dedicated
     * error path for that task, unlike `add`/`restore`) — the promise resolves with git's stdout
     * text instead. So the failure is detected explicitly: HEAD not moving after the call IS the
     * failure (this also covers the unborn-HEAD case, where `before` is null and any successful
     * first commit necessarily differs from it), and `extractCommitFailureMessage` turns that
     * stdout into a `GitCommandError` — this is exactly the race where the Staged set emptied
     * between render and click. Any OTHER commit failure (a repo that's gone, …) still throws for
     * real and is caught by the `GitProcessError` tag below, same taxonomy as the staging methods.
     */
    commit: (repoPath: string, message: string): Effect.Effect<{ sha: string }, GitCommandError> =>
      withGit(repoPath, async (git) => {
        const before = await git
          .revparse(['HEAD'])
          .then((sha) => sha.trim())
          .catch(() => null);
        const output = await git.raw(['commit', '-m', message]);
        const after = (await git.revparse(['HEAD'])).trim();
        if (after === before) throw new Error(extractCommitFailureMessage(output));
        return { sha: after };
      }).pipe(
        Effect.catchTag(
          'GitProcessError',
          (e) => new GitCommandError({ message: extractGitMessage(e.cause) }),
        ),
      ),

    /**
     * List all configured remotes with their remote-tracking branches (issue #34).
     *
     * Two calls:
     * 1. `for-each-ref refs/remotes` — yields every tracking ref as `remote/branch`; `origin/HEAD`
     *    symbolic refs are dropped; split on the first `/` into `{ remote, branchName }`.
     * 2. `getRemotes()` — the authoritative list of configured remotes so that a remote with zero
     *    fetched branches still appears (`branches: []`).
     *
     * Maps `GitProcessError` → `RepoNotFoundError`, same as `listBranches`.
     */
    listRemotes: (repoPath: string): Effect.Effect<RemoteList, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const [refsOut, configuredRemotes] = await Promise.all([
          git.raw(['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/remotes']),
          git.getRemotes(),
        ]);

        const trackingMap = parseRemoteTrackingRefs(refsOut);

        const remotes: Remote[] = configuredRemotes.map((r) => ({
          name: r.name,
          branches: (trackingMap.get(r.name) ?? []).map((name) => ({ name })),
        }));

        return { remotes } satisfies RemoteList;
      }).pipe(Effect.catchTag('GitProcessError', () => new RepoNotFoundError({ path: repoPath }))),

    /**
     * List all tags, newest version first (`--sort=-v:refname`). No annotated/lightweight
     * distinction — returns tag names only. Maps `GitProcessError` → `RepoNotFoundError`, same as
     * `listBranches` and `listRemotes`. Prefer `for-each-ref` over simple-git's `tags()` for
     * consistent sorting and format control (matches the `listBranches` approach).
     */
    listTags: (repoPath: string): Effect.Effect<TagList, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const out = await git.raw([
          'for-each-ref',
          '--sort=-v:refname',
          '--format=%(refname:lstrip=2)',
          'refs/tags',
        ]);
        const tags = out
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((name) => ({ name }));
        return { tags } satisfies TagList;
      }).pipe(Effect.catchTag('GitProcessError', () => new RepoNotFoundError({ path: repoPath }))),

    /**
     * List all stashes, `stash@{0}` first. Empty stash stack returns `{ stashes: [] }`.
     * Uses NUL-delimited `--format=%gd%x00%gs%x00%H` for unambiguous parsing. Maps
     * `GitProcessError` → `RepoNotFoundError`, same as `listTags`.
     */
    listStashes: (repoPath: string): Effect.Effect<StashList, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const out = await git.raw(['stash', 'list', '--format=%gd%x00%gs%x00%H']);
        const stashes = parseStashList(out);
        return { stashes } satisfies StashList;
      }).pipe(Effect.catchTag('GitProcessError', () => new RepoNotFoundError({ path: repoPath }))),

    /**
     * Walk history (issue #42 — the commit graph's walking skeleton; issue #54 — the `allRefs`
     * scope). `skip`/`limit` default to `0`/`300`. `scope` defaults to `'head'`: `git log HEAD`,
     * date order — today's behavior, untouched. `scope: 'allRefs'` walks
     * `HEAD --branches --remotes --tags` instead of `--all` (which would drag in
     * `refs/stash`/`refs/notes` — not Refs in the glossary, CONTEXT.md) and adds `--topo-order`,
     * implied by the scope rather than a separate option: the lane sweep (ADR 0007) requires
     * strict children-before-parents order, which date order doesn't guarantee under clock skew.
     * The walk stays fully local either way — remote-tracking branches are local pointers to
     * already-fetched objects, no network. An empty Repository (unborn HEAD) makes `git log`
     * exit non-zero — git phrases this either as "does not have any commits yet" (bare `git log`)
     * or "unknown revision or path not in the working tree" (an explicit but unborn `HEAD`, which
     * is what we pass) — both caught and mapped to `[]`, NOT an error, for both scopes; every
     * other failure still maps to `RepoNotFoundError`, same as the other list* methods.
     */
    listCommits: (
      repoPath: string,
      skip?: number,
      limit?: number,
      scope?: 'head' | 'allRefs',
    ): Effect.Effect<Commit[], RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const out = await git.raw([
          'log',
          ...(scope === 'allRefs' ? ['HEAD', '--branches', '--remotes', '--tags'] : ['HEAD']),
          `--skip=${skip ?? 0}`,
          `--max-count=${limit ?? 300}`,
          ...(scope === 'allRefs' ? ['--topo-order'] : []),
          // Full ref paths in %D — the only way to tell a local Branch `feature/x` from a
          // remote-tracking `origin/main` (see parseRefDecoration).
          '--decorate=full',
          '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%at%x1f%ct%x1f%s%x1f%b%x1f%D%x1e',
        ]);
        return parseCommitLog(out);
      }).pipe(
        Effect.catchTag('GitProcessError', (e) => {
          const message = e.cause instanceof Error ? e.cause.message : String(e.cause);
          const isUnbornHead =
            message.includes('does not have any commits yet') ||
            message.includes('unknown revision or path not in the working tree');
          return isUnbornHead
            ? Effect.succeed([])
            : Effect.fail(new RepoNotFoundError({ path: repoPath }));
        }),
      ),

    /**
     * The Inspector's Commit-detail mode (issue #65): one Commit's metadata + the Changes it
     * introduced. Metadata reuses `listCommits`'s own format string on a single `sha` (`git log -1`).
     * The Changes composition mirrors `status`'s enriched two-call shape, merged by path:
     *
     * 1. `git diff-tree -r -M -z --name-status <base> <sha>` — the change kinds (`-M` detects
     *    renames, surfaced as `oldPath`).
     * 2. `git diff-tree -r -M -z --numstat <base> <sha>` — per-path line counts, keyed the same way
     *    `parseNumstat` already keys a `git diff --numstat` rename (new path).
     *
     * `<base>` is the seam: `EMPTY_TREE_SHA` for a root Commit (no parent to diff against, so its
     * whole tree reads as added), else `<sha>^1` — a merge Commit is diffed against its FIRST parent
     * only, never git's combined-diff default (which reads as noise for a two-or-more-parent
     * Commit). Maps `GitProcessError` → `RepoNotFoundError`, same as `listCommits`.
     */
    commitDetail: (repoPath: string, sha: string): Effect.Effect<CommitDetail, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const log = await git.raw([
          'log',
          '-1',
          '--decorate=full',
          '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%at%x1f%ct%x1f%s%x1f%b%x1f%D%x1e',
          sha,
        ]);
        const [commit] = parseCommitLog(log);
        if (commit === undefined) throw new Error(`unknown revision: ${sha}`);

        const base = commit.parents.length === 0 ? EMPTY_TREE_SHA : `${sha}^1`;
        const [nameStatus, numstat] = await Promise.all([
          git.raw(['diff-tree', '-r', '-M', '-z', '--name-status', base, sha]),
          git.raw(['diff-tree', '-r', '-M', '-z', '--numstat', base, sha]),
        ]);

        const stats = parseNumstat(numstat);
        const changes: Change[] = parseDiffTreeNameStatus(nameStatus).map((change) => ({
          ...change,
          ...stats.get(change.path),
        }));

        return {
          sha: commit.sha,
          author: commit.author,
          date: commit.authoredAt,
          message: commit.body.length > 0 ? `${commit.subject}\n\n${commit.body}` : commit.subject,
          changes,
        } satisfies CommitDetail;
      }).pipe(Effect.catchTag('GitProcessError', () => new RepoNotFoundError({ path: repoPath }))),
  },
}) {}
