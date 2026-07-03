import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import {
  GitClient,
  parseCommitLog,
  parseForEachRef,
  parseOverwriteError,
  parseRemoteTrackingRefs,
  parseStashList,
} from './GitClient.ts';

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

// --- parseOverwriteError unit tests (pure, pinned output) ---

describe('parseOverwriteError', () => {
  // Pinned stderr from the issue spec (literal TAB before path).
  const PINNED =
    'error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\nPlease commit your changes or stash them before you switch branches.\nAborting\n';

  it('returns the conflicting paths for the overwrite refusal', () => {
    const paths = parseOverwriteError(PINNED);
    expect(paths).toEqual(['a.txt']);
  });

  it('returns null for a non-overwrite failure message', () => {
    const paths = parseOverwriteError('fatal: not a git repository');
    expect(paths).toBeNull();
  });

  it('handles the untracked variant (same substring)', () => {
    const untracked =
      'error: The following untracked working tree files would be overwritten by checkout:\n\tx\nPlease move or remove them before you switch branches.\nAborting\n';
    const paths = parseOverwriteError(untracked);
    expect(paths).toEqual(['x']);
  });
});

// --- GitClient.switchBranch integration tests ---

describe('GitClient.switchBranch', () => {
  let base: string;
  let repo: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-switch-')));
    repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    // Initial commit on main
    writeFileSync(join(repo, 'a.txt'), 'original');
    g(repo, 'add', 'a.txt');
    g(repo, 'commit', '-m', 'init');
    // Create a feature branch
    g(repo, 'branch', 'feature');
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('switches to a different branch successfully', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      yield* client.switchBranch(repo, 'feature');
      const currentBranch = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
      expect(currentBranch).toBe('feature');
      // Switch back to main for subsequent tests
      g(repo, 'checkout', 'main');
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with UncommittedChangesError when checkout would overwrite local changes', () =>
    Effect.gen(function* () {
      // Modify a.txt (tracked) to create a conflict — git refuses because feature branch
      // has the same file and switching would overwrite this unstaged change.
      // We need feature to have a different version of a.txt so checkout would overwrite.
      // Set up: commit a different a.txt on feature, come back to main, edit a.txt without staging.
      g(repo, 'checkout', 'feature');
      writeFileSync(join(repo, 'a.txt'), 'feature-version');
      g(repo, 'add', 'a.txt');
      g(repo, 'commit', '-m', 'feature change');
      g(repo, 'checkout', 'main');
      // Now write local (unstaged) changes to a.txt — this would be overwritten by checkout feature
      writeFileSync(join(repo, 'a.txt'), 'dirty-local');

      const client = yield* GitClient;
      const error = yield* Effect.flip(client.switchBranch(repo, 'feature'));
      expect(error._tag).toBe('UncommittedChangesError');
      if (error._tag === 'UncommittedChangesError') {
        expect(error.paths).toContain('a.txt');
      }

      // Restore clean state for other tests
      g(repo, 'checkout', '--', 'a.txt');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});

// --- GitClient.createBranch integration tests ---

describe('GitClient.createBranch', () => {
  let base: string;
  let repo: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-create-branch-')));
    repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    // Initial commit so HEAD is valid and branching is possible
    writeFileSync(join(repo, 'a.txt'), 'a');
    g(repo, 'add', 'a.txt');
    g(repo, 'commit', '-m', 'init');
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('creates a branch from HEAD and switches onto it', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      yield* client.createBranch(repo, 'feature');
      const current = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
      expect(current).toBe('feature');
      // Restore for subsequent tests
      g(repo, 'checkout', 'main');
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with BranchExistsError when the branch name is already taken', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.createBranch(repo, 'feature'));
      expect(error._tag).toBe('BranchExistsError');
      if (error._tag === 'BranchExistsError') {
        expect(error.name).toBe('feature');
      }
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with InvalidBranchNameError for a name git rejects', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      // Double dots are universally rejected by git as an invalid refname.
      const error = yield* Effect.flip(client.createBranch(repo, 'bad..name'));
      expect(error._tag).toBe('InvalidBranchNameError');
      if (error._tag === 'InvalidBranchNameError') {
        expect(error.name).toBe('bad..name');
      }
    }).pipe(Effect.provide(GitClient.Default)),
  );
});

// --- parseRemoteTrackingRefs unit tests (pure, pinned output) ---

describe('parseRemoteTrackingRefs', () => {
  // Pinned output per issue spec: `for-each-ref refs/remotes` yields one line per tracking ref.
  const PINNED = ['origin/HEAD', 'origin/feat/x', 'origin/main'].join('\n');

  it('drops origin/HEAD and returns feat/x and main under origin', () => {
    const result = parseRemoteTrackingRefs(PINNED);
    const originBranches = result.get('origin') ?? [];
    expect(originBranches).not.toContain('HEAD');
    expect(originBranches).toContain('feat/x');
    expect(originBranches).toContain('main');
    expect(originBranches).toHaveLength(2);
  });

  it('groups branches under their remote prefix', () => {
    const MULTI = ['origin/main', 'upstream/main', 'upstream/dev'].join('\n');
    const result = parseRemoteTrackingRefs(MULTI);
    expect(result.get('origin')).toEqual(['main']);
    expect(result.get('upstream')).toEqual(['main', 'dev']);
  });

  it('handles nested branch names (e.g. feat/x) — only splits on the first slash', () => {
    const result = parseRemoteTrackingRefs('origin/feat/nested/deep');
    expect(result.get('origin')).toEqual(['feat/nested/deep']);
  });

  it('returns an empty map for empty input', () => {
    expect(parseRemoteTrackingRefs('').size).toBe(0);
    expect(parseRemoteTrackingRefs('   ').size).toBe(0);
  });
});

// --- GitClient.listRemotes integration tests ---

describe('GitClient.listRemotes', () => {
  let base: string;
  /** Local working repo */
  let local: string;
  /** A bare "origin" remote */
  let originRemote: string;
  /** A bare "upstream" remote (no fetched branches — only configured, not fetched) */
  let upstreamRemote: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-remotes-')));
    originRemote = join(base, 'origin.git');
    upstreamRemote = join(base, 'upstream.git');
    local = join(base, 'local');

    // Set up bare remotes.
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', originRemote], { cwd: base });
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', upstreamRemote], { cwd: base });

    // Clone origin into local.
    execFileSync('git', ['clone', '-q', originRemote, local], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: local });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: local });

    // Make an initial commit and push to origin/main.
    writeFileSync(join(local, 'a.txt'), 'a');
    g(local, 'add', 'a.txt');
    g(local, 'commit', '-m', 'init');
    g(local, 'push', '-u', 'origin', 'main');

    // Create a feat/x branch and push it to origin.
    g(local, 'checkout', '-b', 'feat/x');
    writeFileSync(join(local, 'b.txt'), 'b');
    g(local, 'add', 'b.txt');
    g(local, 'commit', '-m', 'feat');
    g(local, 'push', '-u', 'origin', 'feat/x');
    g(local, 'checkout', 'main');

    // Add upstream as a remote but do NOT fetch (zero tracking branches).
    g(local, 'remote', 'add', 'upstream', upstreamRemote);
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('returns origin with main and feat/x; HEAD excluded', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { remotes } = yield* client.listRemotes(local);

      const origin = remotes.find((r) => r.name === 'origin');
      expect(origin).toBeDefined();
      const branchNames = origin?.branches.map((b) => b.name) ?? [];
      expect(branchNames).toContain('main');
      expect(branchNames).toContain('feat/x');
      expect(branchNames).not.toContain('HEAD');
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('returns upstream with zero tracking branches (not fetched)', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { remotes } = yield* client.listRemotes(local);

      const upstream = remotes.find((r) => r.name === 'upstream');
      expect(upstream).toBeDefined();
      expect(upstream?.branches).toHaveLength(0);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with RepoNotFoundError for a bad path', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.listRemotes(join(base, 'does-not-exist')));
      expect(error._tag).toBe('RepoNotFoundError');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});

// --- GitClient.listTags integration tests ---

describe('GitClient.listTags', () => {
  let base: string;
  let repo: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-tags-')));
    repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    // Initial commit so tagging is possible.
    writeFileSync(join(repo, 'a.txt'), 'a');
    g(repo, 'add', 'a.txt');
    g(repo, 'commit', '-m', 'init');
    // Create lightweight and annotated tags.
    g(repo, 'tag', 'v1.0.0');
    g(repo, 'tag', 'v2.0.0');
    g(repo, 'tag', '-a', 'v1.1.0', '-m', 'annotated tag');
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('returns all tag names', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { tags } = yield* client.listTags(repo);
      const names = tags.map((t) => t.name);
      expect(names).toContain('v1.0.0');
      expect(names).toContain('v1.1.0');
      expect(names).toContain('v2.0.0');
      expect(tags).toHaveLength(3);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('returns an empty tag list when the repo has no tags', () =>
    Effect.gen(function* () {
      // Create a fresh repo with no tags.
      const emptyRepo = join(base, 'empty');
      mkdirSync(emptyRepo, { recursive: true });
      execFileSync('git', ['init', '-q', '-b', 'main', emptyRepo], { cwd: base });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: emptyRepo });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: emptyRepo });
      writeFileSync(join(emptyRepo, 'x.txt'), 'x');
      execFileSync('git', ['add', 'x.txt'], { cwd: emptyRepo });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: emptyRepo });

      const client = yield* GitClient;
      const { tags } = yield* client.listTags(emptyRepo);
      expect(tags).toHaveLength(0);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with RepoNotFoundError for a bad path', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.listTags(join(base, 'does-not-exist')));
      expect(error._tag).toBe('RepoNotFoundError');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});

// --- parseStashList unit tests (pure, pinned output) ---

describe('parseStashList', () => {
  it('parses "WIP on <branch>: <rest>" (auto-stash)', () => {
    const result = parseStashList('stash@{0}\0WIP on main: 9c2f1ab fix retry\0abc1234');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'stash@{0}', message: '9c2f1ab fix retry', branch: 'main' });
  });

  it('parses "On <branch>: <rest>" (named stash)', () => {
    const result = parseStashList('stash@{0}\0On feature/x: quick save\0abc1234');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'stash@{0}', message: 'quick save', branch: 'feature/x' });
  });

  it('parses a custom note with no prefix (branch is undefined)', () => {
    const result = parseStashList('stash@{0}\0custom note, no prefix\0abc1234');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'stash@{0}', message: 'custom note, no prefix' });
    expect(result[0]?.branch).toBeUndefined();
  });

  it('returns [] for empty output', () => {
    expect(parseStashList('')).toEqual([]);
    expect(parseStashList('   \n  ')).toEqual([]);
  });
});

// --- parseCommitLog unit tests (pure, pinned output) ---

describe('parseCommitLog', () => {
  // Pinned output captured from a real `git log --format=%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%at%x1f%ct%x1f%s%x1f%b%x1e`:
  // two commits, newest first — "second" (a plain commit, root parent) and "first" (the root
  // commit, %P empty, multi-line %b). Each record is RS (\x1e)-terminated and git appends its own
  // trailing '\n' after each terminator, which becomes a leading '\n' on every record but the first.
  const TWO_COMMITS =
    'f4af4ba733604e395f19ffc8fca5dc1724ea8af7\x1ff6d02d5f547be62a327e6d129d0c010f167329e9\x1fT\x1ft@t.com\x1fT\x1ft@t.com\x1f1782846820\x1f1782846820\x1fsecond\x1f\x1e\n' +
    'f6d02d5f547be62a327e6d129d0c010f167329e9\x1f\x1fT\x1ft@t.com\x1fT\x1ft@t.com\x1f1782846820\x1f1782846820\x1ffirst\x1fbody line1\nbody line2\n\x1e\n';

  it('parses both commits', () => {
    const commits = parseCommitLog(TWO_COMMITS);
    expect(commits).toHaveLength(2);
  });

  it('parses a normal commit with one parent and an empty body', () => {
    const commits = parseCommitLog(TWO_COMMITS);
    const second = commits[0];
    expect(second).toEqual({
      sha: 'f4af4ba733604e395f19ffc8fca5dc1724ea8af7',
      parents: ['f6d02d5f547be62a327e6d129d0c010f167329e9'],
      author: { name: 'T', email: 't@t.com' },
      committer: { name: 'T', email: 't@t.com' },
      authoredAt: 1782846820000,
      committedAt: 1782846820000,
      subject: 'second',
      body: '',
      refs: [],
    });
  });

  it('parses a root commit (%P empty -> parents: []) with a multi-line body', () => {
    const commits = parseCommitLog(TWO_COMMITS);
    const first = commits[1];
    expect(first).toEqual({
      sha: 'f6d02d5f547be62a327e6d129d0c010f167329e9',
      parents: [],
      author: { name: 'T', email: 't@t.com' },
      committer: { name: 'T', email: 't@t.com' },
      authoredAt: 1782846820000,
      committedAt: 1782846820000,
      subject: 'first',
      body: 'body line1\nbody line2',
      refs: [],
    });
  });

  it('parses a merge commit (%P = two SHAs -> parents.length === 2)', () => {
    const merge =
      '9f8e1a2000000000000000000000000000000000\x1f3a2b000000000000000000000000000000000000 4c5d000000000000000000000000000000000000\x1fA\x1fa@a.com\x1fA\x1fa@a.com\x1f1700000000\x1f1700000005\x1fmerge: combine branches\x1f\x1e\n';
    const commits = parseCommitLog(merge);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.parents).toHaveLength(2);
    expect(commits[0]?.parents).toEqual([
      '3a2b000000000000000000000000000000000000',
      '4c5d000000000000000000000000000000000000',
    ]);
  });

  it('converts epoch seconds to epoch MS', () => {
    const record =
      '9f8e1a2000000000000000000000000000000000\x1f3a2b000000000000000000000000000000000000\x1fA\x1fa@a.com\x1fA\x1fa@a.com\x1f1700000000\x1f1700000005\x1ffeat: add engine\x1fbody line\x1e\n';
    const [commit] = parseCommitLog(record);
    expect(commit?.authoredAt).toBe(1700000000000);
    expect(commit?.committedAt).toBe(1700000005000);
    expect(commit?.subject).toBe('feat: add engine');
    expect(commit?.body).toBe('body line');
  });

  it('returns [] for empty output', () => {
    expect(parseCommitLog('')).toEqual([]);
  });
});

// --- GitClient.listCommits integration tests ---

describe('GitClient.listCommits', () => {
  let base: string;
  let repo: string;
  let emptyRepo: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-commits-')));
    repo = join(base, 'repo');
    emptyRepo = join(base, 'empty');
    mkdirSync(repo, { recursive: true });
    mkdirSync(emptyRepo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    writeFileSync(join(repo, 'a.txt'), 'a');
    g(repo, 'add', 'a.txt');
    g(repo, 'commit', '-m', 'init');
    writeFileSync(join(repo, 'b.txt'), 'b');
    g(repo, 'add', 'b.txt');
    g(repo, 'commit', '-m', 'second commit');

    execFileSync('git', ['init', '-q', '-b', 'main', emptyRepo], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: emptyRepo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: emptyRepo });
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('returns commits from HEAD, newest first', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const commits = yield* client.listCommits(repo);
      expect(commits).toHaveLength(2);
      expect(commits[0]?.subject).toBe('second commit');
      expect(commits[1]?.subject).toBe('init');
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('honors skip and limit', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const commits = yield* client.listCommits(repo, 1, 1);
      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe('init');
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('returns [] for an empty repository (unborn HEAD)', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const commits = yield* client.listCommits(emptyRepo);
      expect(commits).toEqual([]);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with RepoNotFoundError for a bad path', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.listCommits(join(base, 'does-not-exist')));
      expect(error._tag).toBe('RepoNotFoundError');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});
