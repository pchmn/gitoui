import type { ResolvedRepository, Status } from '@gitoui/contracts/git';
import { NotARepositoryError, RepoNotFoundError } from '@gitoui/contracts/git';
import { Effect } from 'effect';
import { withGit } from './runGit.ts';

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
  },
}) {}
