import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from '@effect/vitest';
import type { Status } from '@gitoui/contracts/git';
import { Effect, Fiber, Ref, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { RepoWatcher, watchedRepos } from './RepoWatcher.ts';

/** Poll a synchronous predicate until it's true (or time out) — no fixed sleeps racing the fs watcher. */
const waitUntil = (predicate: () => boolean, timeoutMs = 5000): Effect.Effect<void> =>
  Effect.gen(function* () {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('waitUntil timed out');
      yield* Effect.sleep(10);
    }
  });

/**
 * Subscribe and accumulate every emitted Status into a Ref, forked in the background. Used instead
 * of a fixed sleep before mutating the fs: waiting for `Ref.get(received).length >= 1` proves the
 * subscription (PubSub.subscribe + the initial `status()` fetch) has actually completed — not just
 * that the `watchedRepos` map entry exists, which happens earlier and would otherwise race a
 * same-tick external edit against `PubSub.subscribe`.
 */
const subscribeCounting = (watcher: RepoWatcher, repoPath: string) =>
  Effect.gen(function* () {
    const received = yield* Ref.make<readonly Status[]>([]);
    const fiber = yield* watcher.watchStatus(repoPath).pipe(
      Stream.runForEach((status) => Ref.update(received, (all) => [...all, status])),
      Effect.fork,
    );
    return { fiber, received };
  });

describe('RepoWatcher.watchStatus', () => {
  let base: string;
  let repo: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-watcher-')));
    repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    writeFileSync(join(repo, 'a.txt'), 'original');
    g(repo, 'add', 'a.txt');
    g(repo, 'commit', '-m', 'init');
    // For the pruned-dirs test: `sub/` must predate any watcher — creating it mid-test races
    // FSEvents' "since now" start marker, which can replay an event from just before the stream.
    mkdirSync(join(repo, 'sub'));
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.live(
    'emits the current Status immediately on subscribe',
    () =>
      Effect.gen(function* () {
        const watcher = yield* RepoWatcher;
        const [first] = yield* watcher.watchStatus(repo).pipe(Stream.take(1), Stream.runCollect);
        expect(first?.entries).toEqual([]);
      }).pipe(Effect.provide(RepoWatcher.Default)),
    10_000,
  );

  it.live(
    'converges after an external edit (editor save / terminal git add)',
    () =>
      Effect.gen(function* () {
        const watcher = yield* RepoWatcher;
        const { fiber, received } = yield* subscribeCounting(watcher, repo);

        yield* waitUntil(() => Effect.runSync(Ref.get(received)).length >= 1);
        writeFileSync(join(repo, 'a.txt'), 'edited externally');
        yield* waitUntil(() => Effect.runSync(Ref.get(received)).length >= 2);
        yield* Fiber.interrupt(fiber);

        const all = yield* Ref.get(received);
        expect(all.at(-1)?.entries.some((e) => e.path === 'a.txt')).toBe(true);
      }).pipe(Effect.provide(RepoWatcher.Default)),
    10_000,
  );

  it.live(
    'two subscribers on one repo share one fs watcher; closing both closes it',
    () =>
      Effect.gen(function* () {
        const watcher = yield* RepoWatcher;

        const { fiber: fiber1, received } = yield* subscribeCounting(watcher, repo);
        yield* waitUntil(() => Effect.runSync(Ref.get(received)).length >= 1);
        expect(watchedRepos.get(repo)?.refCount).toBe(1);

        // Second subscriber takes only the immediate snapshot, then releases.
        yield* watcher.watchStatus(repo).pipe(Stream.take(1), Stream.runCollect);
        // Momentarily shared: refcount went 1 -> 2 -> back to 1 once the second subscriber closed.
        expect(watchedRepos.get(repo)?.refCount).toBe(1);
        expect(watchedRepos.has(repo)).toBe(true);

        // Give fiber1 its second (post-edit) item, then stop it.
        writeFileSync(join(repo, 'a.txt'), 'edited again');
        yield* waitUntil(() => Effect.runSync(Ref.get(received)).length >= 2);
        yield* Fiber.interrupt(fiber1);

        yield* waitUntil(() => !watchedRepos.has(repo));
      }).pipe(Effect.provide(RepoWatcher.Default)),
    10_000,
  );

  it.live(
    'a 500-file branch switch produces one recompute burst, not hundreds',
    () =>
      Effect.gen(function* () {
        const watcher = yield* RepoWatcher;
        const { fiber, received } = yield* subscribeCounting(watcher, repo);

        yield* waitUntil(() => Effect.runSync(Ref.get(received)).length >= 1);

        // Simulate a large burst of near-simultaneous fs events.
        for (let i = 0; i < 100; i += 1) {
          writeFileSync(join(repo, `burst-${i}.txt`), String(i));
        }

        // Debounce is ~200ms; wait well past it, then stop.
        yield* Effect.sleep(600);
        yield* Fiber.interrupt(fiber);

        const all = yield* Ref.get(received);
        // 1 immediate snapshot + at most one debounced recompute for the whole burst.
        expect(all.length).toBeLessThanOrEqual(2);
      }).pipe(Effect.provide(RepoWatcher.Default)),
    10_000,
  );

  it.live(
    'ignores churn in pruned dirs (node_modules, target, __pycache__ — never-committed, high-churn)',
    () =>
      Effect.gen(function* () {
        const pruned = ['node_modules/pkg', 'target/debug', 'sub/__pycache__'];
        const watcher = yield* RepoWatcher;
        const { fiber, received } = yield* subscribeCounting(watcher, repo);
        yield* waitUntil(() => Effect.runSync(Ref.get(received)).length >= 1);

        for (const dir of pruned) {
          mkdirSync(join(repo, dir), { recursive: true });
          writeFileSync(join(repo, dir, 'noise'), 'noise');
        }

        // Well past the debounce: a watched path would have produced a second emission by now.
        yield* Effect.sleep(600);
        yield* Fiber.interrupt(fiber);

        expect(yield* Ref.get(received)).toHaveLength(1);
      }).pipe(Effect.provide(RepoWatcher.Default)),
    10_000,
  );
});
