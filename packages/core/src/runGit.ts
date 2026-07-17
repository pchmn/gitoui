import { Data, Effect } from 'effect';
import { type SimpleGit, simpleGit } from 'simple-git';

/** Low-level, core-internal failure. Mapped to a domain error (or a Defect) at the boundary. */
export class GitProcessError extends Data.TaggedError('GitProcessError')<{
  readonly cwd: string;
  readonly cause: unknown;
}> {}

/**
 * Interruption-aware git execution primitive (decision #7, ADR-0001).
 *
 * `Effect.tryPromise` hands `use` an `AbortSignal` that is aborted when the fiber is interrupted;
 * we forward it to `simple-git`'s `abort` option, which kills the underlying child `git` process.
 * So cancelling a long op (clone/fetch/pull/push) actually stops it instead of leaving a zombie.
 */
export const withGit = <A>(
  cwd: string,
  use: (git: SimpleGit) => Promise<A>,
): Effect.Effect<A, GitProcessError> =>
  Effect.tryPromise({
    // --no-optional-locks: gitoui's git calls run in the background on the user's behalf, so they
    // must skip optional sub-operations that take a lock — most importantly `status` must not
    // refresh `.git/index` as a side effect, which RepoWatcher would see as a repo change and
    // recompute from its own recompute (ADR 0015). Mandatory locks (add/commit) are unaffected.
    // As a binary arg (not GIT_OPTIONAL_LOCKS via `.env()`) because `.env()` replaces the child's
    // whole environment and simple-git then rejects the user's own GIT_SSH_COMMAND/GIT_ASKPASS.
    try: (signal) =>
      use(simpleGit({ baseDir: cwd, abort: signal, binary: ['git', '--no-optional-locks'] })),
    catch: (cause) => new GitProcessError({ cwd, cause }),
  });
