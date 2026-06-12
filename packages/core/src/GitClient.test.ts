import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { GitClient } from './GitClient.ts';

it.effect('GitClient exposes a status method', () =>
  Effect.gen(function* () {
    const git = yield* GitClient;
    expect(typeof git.status).toBe('function');
  }).pipe(Effect.provide(GitClient.Default)),
);

describe('GitClient.resolveRepository', () => {
  // `--show-toplevel` returns a symlink-resolved absolute path, so the expected root is the
  // realpath of what we create (macOS tmpdir lives under a /var → /private/var symlink).
  let base: string;
  let repoRoot: string;
  let nonRepo: string;
  let bareRepo: string;

  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd });

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-resolve-')));
    repoRoot = join(base, 'repo');
    nonRepo = join(base, 'plain');
    bareRepo = join(base, 'bare.git');
    mkdirSync(join(repoRoot, 'sub'), { recursive: true });
    mkdirSync(nonRepo, { recursive: true });
    git(repoRoot, 'init', '-q');
    git(base, 'init', '-q', '--bare', 'bare.git');
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('resolves a repo root path to itself', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { root } = yield* client.resolveRepository(repoRoot);
      expect(root).toBe(repoRoot);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('resolves a path inside a repo to the work-tree root', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { root } = yield* client.resolveRepository(join(repoRoot, 'sub'));
      expect(root).toBe(repoRoot);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with NotARepositoryError for a non-repository folder', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.resolveRepository(nonRepo));
      expect(error._tag).toBe('NotARepositoryError');
      expect(error.path).toBe(nonRepo);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with NotARepositoryError for a bare repository', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.resolveRepository(bareRepo));
      expect(error._tag).toBe('NotARepositoryError');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});
