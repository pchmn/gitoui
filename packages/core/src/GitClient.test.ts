import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { GitClient, parseForEachRef } from './GitClient.ts';

// --- parseForEachRef unit tests (pure, pinned output) ---

describe('parseForEachRef', () => {
  // Pinned output from the issue spec. Each ⇥ is a real TAB; HEAD column is `*` or ` `.
  const PINNED = [
    'main\torigin/main\t\t*',
    'feature\torigin/feature\t[ahead 2]\t ',
    'release\torigin/release\t[ahead 1, behind 3]\t ',
    'wip\t\t\t ',
    'orphaned\torigin/orphaned\t[gone]\t ',
  ].join('\n');

  it('parses all five branches correctly', () => {
    const { branches, currentBranchName } = parseForEachRef(PINNED);
    expect(branches).toHaveLength(5);
    expect(currentBranchName).toBe('main');
  });

  it('marks main as current with in-sync counts', () => {
    const { branches } = parseForEachRef(PINNED);
    const main = branches.find((b) => b.name === 'main');
    expect(main).toBeDefined();
    expect(main?.isCurrent).toBe(true);
    expect(main?.upstream).toBe('origin/main');
    expect(main?.ahead).toBe(0);
    expect(main?.behind).toBe(0);
  });

  it('parses ahead-only branch', () => {
    const { branches } = parseForEachRef(PINNED);
    const feature = branches.find((b) => b.name === 'feature');
    expect(feature).toBeDefined();
    expect(feature?.isCurrent).toBe(false);
    expect(feature?.upstream).toBe('origin/feature');
    expect(feature?.ahead).toBe(2);
    expect(feature?.behind).toBe(0);
  });

  it('parses diverged branch (ahead + behind)', () => {
    const { branches } = parseForEachRef(PINNED);
    const release = branches.find((b) => b.name === 'release');
    expect(release).toBeDefined();
    expect(release?.ahead).toBe(1);
    expect(release?.behind).toBe(3);
  });

  it('parses branch with no upstream (omits upstream field)', () => {
    const { branches } = parseForEachRef(PINNED);
    const wip = branches.find((b) => b.name === 'wip');
    expect(wip).toBeDefined();
    expect(wip?.upstream).toBeUndefined();
    expect(wip?.ahead).toBe(0);
    expect(wip?.behind).toBe(0);
  });

  it('parses [gone] upstream as 0/0 with upstream name kept', () => {
    const { branches } = parseForEachRef(PINNED);
    const orphaned = branches.find((b) => b.name === 'orphaned');
    expect(orphaned).toBeDefined();
    expect(orphaned?.upstream).toBe('origin/orphaned');
    expect(orphaned?.ahead).toBe(0);
    expect(orphaned?.behind).toBe(0);
  });

  it('returns currentBranchName = null when no branch is current', () => {
    const noCurrentLines = ['main\torigin/main\t\t ', 'feature\torigin/feature\t[ahead 2]\t '].join(
      '\n',
    );
    const { currentBranchName } = parseForEachRef(noCurrentLines);
    expect(currentBranchName).toBeNull();
  });
});

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

// --- GitClient.listBranches integration tests ---

describe('GitClient.listBranches', () => {
  let base: string;
  /** The local working repository under test */
  let local: string;
  /** A bare "remote" repository */
  let remote: string;
  /** SHA of a commit to detach HEAD onto */
  let commitSha: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-branches-')));
    remote = join(base, 'remote.git');
    local = join(base, 'local');

    // Set up a bare "remote" with main as the default branch
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { cwd: base });

    // Clone the remote into local
    execFileSync('git', ['clone', '-q', remote, local], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: local });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: local });

    // Make an initial commit on main and push
    writeFileSync(join(local, 'a.txt'), 'a');
    g(local, 'add', 'a.txt');
    g(local, 'commit', '-m', 'init');
    g(local, 'push', '-u', 'origin', 'main');

    commitSha = g(local, 'rev-parse', '--short', 'HEAD');

    // Make a local commit (ahead 1)
    writeFileSync(join(local, 'b.txt'), 'b');
    g(local, 'add', 'b.txt');
    g(local, 'commit', '-m', 'local commit');

    // Make a remote commit (behind 1): push to remote directly via another clone, then fetch
    const remote2 = join(base, 'pusher');
    execFileSync('git', ['clone', '-q', remote, remote2], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: remote2 });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: remote2 });
    writeFileSync(join(remote2, 'c.txt'), 'c');
    g(remote2, 'add', 'c.txt');
    g(remote2, 'commit', '-m', 'remote commit');
    g(remote2, 'push');
    g(local, 'fetch');

    // Create a branch with no upstream
    g(local, 'branch', 'no-upstream');
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('lists branches with correct ahead/behind and isCurrent', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { branches, head } = yield* client.listBranches(local);

      expect(head._tag).toBe('OnBranch');
      if (head._tag === 'OnBranch') expect(head.branch).toBe('main');

      const main = branches.find((b) => b.name === 'main');
      expect(main).toBeDefined();
      expect(main?.isCurrent).toBe(true);
      expect(main?.upstream).toBe('origin/main');
      expect(main?.ahead).toBe(1);
      expect(main?.behind).toBe(1);

      const noUpstream = branches.find((b) => b.name === 'no-upstream');
      expect(noUpstream).toBeDefined();
      expect(noUpstream?.upstream).toBeUndefined();
      expect(noUpstream?.ahead).toBe(0);
      expect(noUpstream?.behind).toBe(0);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('returns Detached head with short SHA when HEAD is detached', () =>
    Effect.gen(function* () {
      // Detach HEAD to the initial commit
      execFileSync('git', ['checkout', '--detach', commitSha], { cwd: local, stdio: 'ignore' });

      const client = yield* GitClient;
      const { branches, head } = yield* client.listBranches(local);

      expect(head._tag).toBe('Detached');
      if (head._tag === 'Detached') expect(head.sha).toBe(commitSha);
      expect(branches.every((b) => !b.isCurrent)).toBe(true);

      // Restore HEAD to main for subsequent tests (if any)
      execFileSync('git', ['checkout', 'main'], { cwd: local, stdio: 'ignore' });
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with RepoNotFoundError for a bad path', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.listBranches(join(base, 'does-not-exist')));
      expect(error._tag).toBe('RepoNotFoundError');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});
