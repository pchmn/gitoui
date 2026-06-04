import type { Status } from '@gitoui/contracts/git';
import { RepoNotFoundError } from '@gitoui/contracts/git';
import { Effect } from 'effect';
import { withGit } from './runGit.ts';

/**
 * The git engine, as an Effect service (DI via Layer). Methods return Effects with typed errors.
 * Skeleton: `status` proves the shape (simple-git → contracts `Status`). Real mapping — including
 * the two-axis staged/unstaged model — lands with the business logic.
 */
export class GitClient extends Effect.Service<GitClient>()('@gitoui/core/GitClient', {
  succeed: {
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
