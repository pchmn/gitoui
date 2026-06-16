import type { Branch, BranchList, ResolvedRepository, Status } from '@gitoui/contracts/git';
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
  },
}) {}
