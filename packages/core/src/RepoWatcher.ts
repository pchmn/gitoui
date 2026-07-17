import { type FSWatcher, watch } from 'node:fs';
import path from 'node:path';
import type { RepoNotFoundError, Status } from '@gitoui/contracts/git';
import { Effect, PubSub, Stream } from 'effect';
import { GitClient } from './GitClient.ts';

const DEBOUNCE_MS = 200;

type RepoEntry = {
  readonly pubsub: PubSub.PubSub<Status>;
  readonly watcher: FSWatcher;
  refCount: number;
  timer: NodeJS.Timeout | undefined;
};

/**
 * `repoPath` → shared watcher state (decision #7's `Map<repoPath, { pubsub, refCount, watcher }>`).
 * Exported read-only so tests can assert the refcount/close invariant at this seam, mirroring how
 * `GitClient.test.ts` unit-tests its pure parse functions directly.
 */
const entries = new Map<string, RepoEntry>();
export const watchedRepos: ReadonlyMap<string, Readonly<RepoEntry>> = entries;

/**
 * Everything under `.git/` matters for Status EXCEPT the object store/logs/hooks/etc — reacting to
 * `objects/` would recompute once per loose object on every commit. `index`, `HEAD`, and `refs/**`
 * are the only git-metadata paths that can change what `git status` reports.
 */
function isTrackedGitPath(relativeToGitDir: string): boolean {
  return (
    relativeToGitDir === 'index' ||
    relativeToGitDir === 'HEAD' ||
    relativeToGitDir === 'refs' ||
    relativeToGitDir.startsWith(`refs${path.sep}`)
  );
}

/**
 * Working-tree dirs whose churn never triggers a recompute. Inclusion criterion (ADR 0015): never
 * committed BY DESIGN in the ecosystem's convention AND high-churn during a normal dev session
 * (installs, cargo/rust-analyzer, pytest). Conventionally-ignored names that are legitimately
 * committed in some ecosystems (`vendor` in Go, `Pods` in CocoaPods, `dist`/`build`) stay watched:
 * a wasted debounced recompute is recoverable, a missed live Status update is not.
 */
const PRUNED_DIRS = new Set([
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  'target',
  '.gradle',
  '.terraform',
  '.direnv',
]);

/** Should a change at this path (relative to the repo root) trigger a Status recompute? */
function isRelevant(relativeToRepo: string): boolean {
  const segments = relativeToRepo.split(path.sep);
  if (segments[0] !== '.git') {
    return !segments.some((segment) => PRUNED_DIRS.has(segment));
  }
  return segments.length === 1 || isTrackedGitPath(segments.slice(1).join(path.sep));
}

function recompute(repoPath: string, entry: RepoEntry): void {
  Effect.runFork(
    GitClient.pipe(
      Effect.flatMap((git) => git.status(repoPath)),
      Effect.provide(GitClient.Default),
      Effect.matchEffect({
        // Transient failure (mid-op repo state) — the next fs event retries; nothing to publish.
        onFailure: () => Effect.void,
        onSuccess: (status) => PubSub.publish(entry.pubsub, status),
      }),
    ),
  );
}

/** Debounce trailing ~200ms so a burst (e.g. a 500-file branch switch) recomputes once. */
function scheduleRecompute(repoPath: string, entry: RepoEntry): void {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => recompute(repoPath, entry), DEBOUNCE_MS);
}

const createEntry = (repoPath: string): Effect.Effect<RepoEntry> =>
  PubSub.unbounded<Status>().pipe(
    Effect.map((pubsub) => {
      // One recursive OS subscription (FSEvents / ReadDirectoryChangesW) for the whole tree.
      // Not chokidar: since v4 it opens one fd PER DIRECTORY, which EMFILEs on any real repo —
      // and our consumer only needs "something changed at <path>", nothing chokidar adds (ADR 0015).
      const watcher = watch(repoPath, { recursive: true });
      const entry: RepoEntry = { pubsub, watcher, refCount: 0, timer: undefined };
      watcher.on('change', (_event, filename) => {
        // filename is null when the OS can't attribute the event — recompute conservatively.
        if (filename === null || isRelevant(String(filename))) scheduleRecompute(repoPath, entry);
      });
      // A dying watcher must not crash main; live status degrades to the mutations' fast-path
      // invalidation until the last subscriber releases and a new subscribe recreates it.
      watcher.on('error', () => {});
      return entry;
    }),
  );

/** ++refCount, creating the shared watcher on the first subscriber for this `repoPath`. */
const acquire = (repoPath: string): Effect.Effect<RepoEntry> =>
  Effect.suspend(() => {
    const existing = entries.get(repoPath);
    if (existing !== undefined) {
      existing.refCount += 1;
      return Effect.succeed(existing);
    }
    return createEntry(repoPath).pipe(
      Effect.map((entry) => {
        entry.refCount = 1;
        entries.set(repoPath, entry);
        return entry;
      }),
    );
  });

/** --refCount; at 0, close the fs watcher and drop the entry — no zombie watchers. */
const release = (repoPath: string): Effect.Effect<void> =>
  Effect.suspend(() => {
    const entry = entries.get(repoPath);
    if (entry === undefined) return Effect.void;
    entry.refCount -= 1;
    if (entry.refCount > 0) return Effect.void;
    entries.delete(repoPath);
    clearTimeout(entry.timer);
    return Effect.sync(() => entry.watcher.close());
  });

/**
 * Shared, ref-counted fs-watcher per Repository (decision #7).
 *
 * One watcher per `repoPath`, fanned out via `PubSub`; `watchStatus` subscribes (++refCount) and
 * its finalizer closes the watcher at 0 — so N components watching one repo = 1 watcher, 1 recompute
 * per change. Lives in `core` (not `main`) because "one watcher per repo" is a git-domain rule;
 * keeping it here leaves `core` Electron-free and testable.
 *
 * `succeed` (not a factory) is intentional: the returned object — and its module-level `entries`
 * map (exported read-only as `watchedRepos`) — is constructed once at import time and stays shared
 * across every `Effect.provide` of this service, which is what lets independent IPC subscriptions
 * on the same `repoPath` converge on one watcher instance.
 */
export class RepoWatcher extends Effect.Service<RepoWatcher>()('@gitoui/core/RepoWatcher', {
  succeed: {
    /**
     * Live Status for one Repository. Emits the current Status immediately on subscribe (a late
     * subscriber isn't blank until the first edit), then again on every debounced recompute.
     * Subscribing to the PubSub before computing the initial snapshot means a recompute that races
     * the initial fetch is queued, not lost — an extra emission, never a missed one.
     */
    watchStatus: (repoPath: string): Stream.Stream<Status, RepoNotFoundError> =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const entry = yield* acquire(repoPath);
          yield* Effect.addFinalizer(() => release(repoPath));
          const subscription = yield* PubSub.subscribe(entry.pubsub);
          const initial = yield* GitClient.pipe(
            Effect.flatMap((git) => git.status(repoPath)),
            Effect.provide(GitClient.Default),
          );
          return Stream.concat(Stream.make(initial), Stream.fromQueue(subscription));
        }),
      ),
  },
}) {}
