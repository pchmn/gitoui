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
    try: (signal) => use(simpleGit({ baseDir: cwd, abort: signal })),
    catch: (cause) => new GitProcessError({ cwd, cause }),
  });
