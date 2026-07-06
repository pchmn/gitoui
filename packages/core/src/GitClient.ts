import type {
  Branch,
  BranchList,
  Commit,
  Ref,
  Remote,
  RemoteList,
  ResolvedRepository,
  Stash,
  StashList,
  Status,
  TagList,
} from '@gitoui/contracts/git';
import {
  BranchExistsError,
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
 * The git engine, as an Effect service (DI via Layer). Methods return Effects with typed errors.
 * Skeleton: `status` proves the shape (simple-git → contracts `Status`). Real mapping — including
 * the two-axis staged/unstaged model — lands with the business logic.
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

    status: (repoPath: string): Effect.Effect<Status, RepoNotFoundError> =>
      withGit(repoPath, async (git) => {
        const s = await git.status();
        return {
          branch: s.current ?? 'HEAD',
          ahead: s.ahead,
          behind: s.behind,
          entries: [],
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
  },
}) {}
