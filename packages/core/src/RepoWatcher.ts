import type { RepoNotFoundError, Status } from '@gitoui/contracts/git';
import { Effect, Stream } from 'effect';

/**
 * Shared, ref-counted fs-watcher per Repository (decision #7).
 *
 * One watcher per `repoPath`, fanned out via `PubSub`; `watchStatus` subscribes (++refCount) and
 * its finalizer closes the watcher at 0 — so N components watching one repo = 1 watcher, 1 recompute
 * per change. Lives in `core` (not `main`) because "one watcher per repo" is a git-domain rule;
 * keeping it here leaves `core` Electron-free and testable.
 *
 * Skeleton: returns an empty stream. Real fs-watching (chokidar/`fs.watch`) + debounce + status
 * recompute + the PubSub fan-out land with the business logic.
 */
export class RepoWatcher extends Effect.Service<RepoWatcher>()('@gitoui/core/RepoWatcher', {
  succeed: {
    watchStatus: (_repoPath: string): Stream.Stream<Status, RepoNotFoundError> => Stream.empty,
  },
}) {}
