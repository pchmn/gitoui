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
  parseNumstat,
  parseOverwriteError,
  parsePorcelainV2,
  parseRefDecoration,
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

// --- parseRefDecoration unit tests (pure, pinned output) ---

describe('parseRefDecoration', () => {
  // Pinned cases from the issue spec — `%D` output under `--decorate=full` (full ref paths).

  it('parses a full decoration: current Branch + remote-tracking Branch + Tag', () => {
    const refs = parseRefDecoration(
      'HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v2.3.0',
    );
    expect(refs).toEqual([
      { _tag: 'Branch', name: 'main', current: true },
      { _tag: 'RemoteBranch', name: 'origin/main' },
      { _tag: 'Tag', name: 'v2.3.0' },
    ]);
  });

  it('classifies a slash-bearing local Branch as Branch, not RemoteBranch', () => {
    expect(parseRefDecoration('refs/heads/feature/pay-fallback')).toEqual([
      { _tag: 'Branch', name: 'feature/pay-fallback', current: false },
    ]);
  });

  it('parses a bare HEAD (Detached HEAD) as Head', () => {
    expect(parseRefDecoration('HEAD')).toEqual([{ _tag: 'Head' }]);
  });

  it('returns [] for an empty decoration', () => {
    expect(parseRefDecoration('')).toEqual([]);
  });

  it('skips refs the graph does not draw (e.g. refs/stash)', () => {
    expect(parseRefDecoration('refs/stash, refs/heads/main')).toEqual([
      { _tag: 'Branch', name: 'main', current: false },
    ]);
  });
});

// --- parseCommitLog unit tests (pure, pinned output) ---

describe('parseCommitLog', () => {
  // Pinned output captured from a real `git log --decorate=full --format=%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%at%x1f%ct%x1f%s%x1f%b%x1f%D%x1e`:
  // two commits, newest first — "second" (a plain commit, root parent, decorated as the tip of the
  // checked-out `main`) and "first" (the root commit, %P empty, multi-line %b, no decoration).
  // Each record is RS (\x1e)-terminated and git appends its own trailing '\n' after each
  // terminator, which becomes a leading '\n' on every record but the first.
  const TWO_COMMITS =
    'f4af4ba733604e395f19ffc8fca5dc1724ea8af7\x1ff6d02d5f547be62a327e6d129d0c010f167329e9\x1fT\x1ft@t.com\x1fT\x1ft@t.com\x1f1782846820\x1f1782846820\x1fsecond\x1f\x1fHEAD -> refs/heads/main\x1e\n' +
    'f6d02d5f547be62a327e6d129d0c010f167329e9\x1f\x1fT\x1ft@t.com\x1fT\x1ft@t.com\x1f1782846820\x1f1782846820\x1ffirst\x1fbody line1\nbody line2\n\x1f\x1e\n';

  it('parses both commits', () => {
    const commits = parseCommitLog(TWO_COMMITS);
    expect(commits).toHaveLength(2);
  });

  it('parses a normal commit with one parent, an empty body, and the HEAD decoration', () => {
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
      refs: [{ _tag: 'Branch', name: 'main', current: true }],
    });
  });

  it('parses a root commit (%P empty -> parents: [], no decoration -> refs: []) with a multi-line body', () => {
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
      '9f8e1a2000000000000000000000000000000000\x1f3a2b000000000000000000000000000000000000 4c5d000000000000000000000000000000000000\x1fA\x1fa@a.com\x1fA\x1fa@a.com\x1f1700000000\x1f1700000005\x1fmerge: combine branches\x1f\x1f\x1e\n';
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
      '9f8e1a2000000000000000000000000000000000\x1f3a2b000000000000000000000000000000000000\x1fA\x1fa@a.com\x1fA\x1fa@a.com\x1f1700000000\x1f1700000005\x1ffeat: add engine\x1fbody line\x1ftag: refs/tags/v1.0\x1e\n';
    const [commit] = parseCommitLog(record);
    expect(commit?.authoredAt).toBe(1700000000000);
    expect(commit?.committedAt).toBe(1700000005000);
    expect(commit?.subject).toBe('feat: add engine');
    expect(commit?.body).toBe('body line');
    expect(commit?.refs).toEqual([{ _tag: 'Tag', name: 'v1.0' }]);
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

    // A sibling branch diverged from `init`, unreachable from HEAD (`main`) — exercises the
    // `allRefs` scope (issue #54).
    g(repo, 'checkout', '-b', 'sibling', 'HEAD~1');
    writeFileSync(join(repo, 'c.txt'), 'c');
    g(repo, 'add', 'c.txt');
    g(repo, 'commit', '-m', 'sibling commit');
    g(repo, 'checkout', 'main');

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
      // --decorate=full end-to-end: the tip carries the checked-out `main`; older commits carry nothing.
      expect(commits[0]?.refs).toEqual([{ _tag: 'Branch', name: 'main', current: true }]);
      expect(commits[1]?.refs).toEqual([]);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect("default scope (head) does not include a sibling branch's commits", () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const commits = yield* client.listCommits(repo);
      expect(commits.some((c) => c.subject === 'sibling commit')).toBe(false);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('scope: allRefs includes commits unreachable from HEAD', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const commits = yield* client.listCommits(repo, undefined, undefined, 'allRefs');
      const subjects = commits.map((c) => c.subject);
      expect(subjects).toContain('sibling commit');
      expect(subjects).toContain('second commit');
      expect(subjects).toContain('init');
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('scope: allRefs orders every commit before its parents (topo invariant)', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const commits = yield* client.listCommits(repo, undefined, undefined, 'allRefs');
      const indexBySha = new Map(commits.map((c, i) => [c.sha, i]));
      for (const commit of commits) {
        for (const parentSha of commit.parents) {
          const parentIndex = indexBySha.get(parentSha);
          if (parentIndex !== undefined) {
            expect(indexBySha.get(commit.sha)).toBeLessThan(parentIndex);
          }
        }
      }
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

// --- parsePorcelainV2 unit tests (pure, pinned output) ---

describe('parsePorcelainV2', () => {
  // Pinned `git status --porcelain=v2 --branch -z` output: NUL-terminated records. Covers the
  // header block, both-axes (MM), staged-only add (A.) with a spaced path, unstaged delete (.D),
  // a rename (type-2, oldPath in the following token), and an untracked entry.
  const PINNED =
    [
      '# branch.oid 1111111111111111111111111111111111111111',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +1 -2',
      '1 MM N... 100644 100644 100644 aaaaaaa bbbbbbb a.txt',
      '1 A. N... 000000 100644 100644 0000000 ccccccc added file.txt',
      '1 .D N... 100644 100644 000000 ddddddd ddddddd gone.txt',
      '2 R. N... 100644 100644 100644 eeeeeee eeeeeee R100 new name.txt',
      'old name.txt',
      '? untracked.txt',
    ].join('\0') + '\0';

  it('parses the branch header and ahead/behind', () => {
    const { branch, ahead, behind } = parsePorcelainV2(PINNED);
    expect(branch).toBe('main');
    expect(ahead).toBe(1);
    expect(behind).toBe(2);
  });

  it('parses a both-axes (MM) entry onto staged AND unstaged', () => {
    const { entries } = parsePorcelainV2(PINNED);
    const a = entries.find((e) => e.path === 'a.txt');
    expect(a?.staged).toEqual({ kind: 'modified' });
    expect(a?.unstaged).toEqual({ kind: 'modified' });
  });

  it('parses a staged-only add and preserves a path with spaces', () => {
    const { entries } = parsePorcelainV2(PINNED);
    const added = entries.find((e) => e.path === 'added file.txt');
    expect(added?.staged).toEqual({ kind: 'added' });
    expect(added?.unstaged).toBeUndefined();
  });

  it('parses an unstaged-only delete', () => {
    const { entries } = parsePorcelainV2(PINNED);
    const gone = entries.find((e) => e.path === 'gone.txt');
    expect(gone?.staged).toBeUndefined();
    expect(gone?.unstaged).toEqual({ kind: 'deleted' });
  });

  it('parses a rename (type 2) with oldPath from the following token', () => {
    const { entries } = parsePorcelainV2(PINNED);
    const renamed = entries.find((e) => e.path === 'new name.txt');
    expect(renamed?.staged).toEqual({ kind: 'renamed' });
    expect(renamed?.oldPath).toBe('old name.txt');
  });

  it('parses an untracked entry onto the unstaged axis', () => {
    const { entries } = parsePorcelainV2(PINNED);
    const untracked = entries.find((e) => e.path === 'untracked.txt');
    expect(untracked?.staged).toBeUndefined();
    expect(untracked?.unstaged).toEqual({ kind: 'untracked' });
  });

  it('keeps the HEAD placeholder for a detached head (no ahead/behind)', () => {
    const detached = ['# branch.oid abc', '# branch.head (detached)'].join('\0') + '\0';
    const { branch, ahead, behind, entries } = parsePorcelainV2(detached);
    expect(branch).toBe('HEAD');
    expect(ahead).toBe(0);
    expect(behind).toBe(0);
    expect(entries).toEqual([]);
  });

  it('maps a conflicted (u) record to modified on both axes (out of scope for now)', () => {
    const conflicted = 'u UU N... 100644 100644 100644 100644 h1 h2 h3 conflict.txt\0';
    const { entries } = parsePorcelainV2(conflicted);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      path: 'conflict.txt',
      staged: { kind: 'modified' },
      unstaged: { kind: 'modified' },
    });
  });

  it('returns an empty entry list for a clean repo', () => {
    const clean = ['# branch.oid abc', '# branch.head main'].join('\0') + '\0';
    expect(parsePorcelainV2(clean).entries).toEqual([]);
  });
});

// --- parseNumstat unit tests (pure, pinned output) ---

describe('parseNumstat', () => {
  it('parses normal add/delete counts keyed by path', () => {
    const stats = parseNumstat('5\t3\tsrc/a.txt\0');
    expect(stats.get('src/a.txt')).toEqual({ additions: 5, deletions: 3 });
  });

  it('omits both counts for a binary file (`- -`)', () => {
    const stats = parseNumstat('-\t-\timage.png\0');
    expect(stats.get('image.png')).toEqual({});
  });

  it('keys a rename on the NEW path (old path absent)', () => {
    const stats = parseNumstat('2\t1\t\0old.txt\0new.txt\0');
    expect(stats.has('old.txt')).toBe(false);
    expect(stats.get('new.txt')).toEqual({ additions: 2, deletions: 1 });
  });

  it('handles a path containing spaces', () => {
    const stats = parseNumstat('1\t0\tmy file.txt\0');
    expect(stats.get('my file.txt')).toEqual({ additions: 1, deletions: 0 });
  });

  it('parses multiple mixed records', () => {
    const stats = parseNumstat('1\t2\ta.txt\0-\t-\tb.bin\0');
    expect(stats.get('a.txt')).toEqual({ additions: 1, deletions: 2 });
    expect(stats.get('b.bin')).toEqual({});
  });

  it('returns an empty map for empty output', () => {
    expect(parseNumstat('').size).toBe(0);
  });
});

// --- GitClient.status integration tests ---

describe('GitClient.status', () => {
  let base: string;
  /** A repo with a dirty working tree exercising every axis/kind. */
  let dirty: string;
  /** A repo with a clean working tree. */
  let clean: string;

  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'gitoui-status-')));
    dirty = join(base, 'dirty');
    clean = join(base, 'clean');
    mkdirSync(dirty, { recursive: true });
    mkdirSync(clean, { recursive: true });

    for (const repo of [dirty, clean]) {
      execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
      // Make rename detection deterministic regardless of the host git's global config.
      execFileSync('git', ['config', 'status.renames', 'true'], { cwd: repo });
    }

    // clean: a single committed file, no working-tree changes.
    writeFileSync(join(clean, 'a.txt'), 'a\n');
    g(clean, 'add', 'a.txt');
    g(clean, 'commit', '-m', 'init');

    // dirty: commit a text file, a to-be-renamed file, and a binary file.
    writeFileSync(join(dirty, 'a.txt'), 'line1\n');
    writeFileSync(join(dirty, 'rename-me.txt'), 'content\n');
    writeFileSync(join(dirty, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    g(dirty, 'add', '-A');
    g(dirty, 'commit', '-m', 'init');

    // Ground-truth two-axis case: stage a +2-line edit, then re-edit the work tree by +1 line.
    writeFileSync(join(dirty, 'a.txt'), 'line1\ns1\ns2\n');
    g(dirty, 'add', 'a.txt');
    writeFileSync(join(dirty, 'a.txt'), 'line1\ns1\ns2\nu1\n');

    // Staged rename (git mv stages it).
    g(dirty, 'mv', 'rename-me.txt', 'renamed.txt');

    // Staged binary modification — appears in numstat as `- -`, so no line stats.
    writeFileSync(join(dirty, 'binary.bin'), Buffer.from([0, 1, 2, 3, 4, 5]));
    g(dirty, 'add', 'binary.bin');

    // Untracked file — never staged.
    writeFileSync(join(dirty, 'untracked.txt'), 'new\n');

    // Untracked directory with nested files — `--untracked-files=all` must expand it to one entry
    // per file (git's default folds it to a single `new-dir/` row).
    mkdirSync(join(dirty, 'new-dir'), { recursive: true });
    writeFileSync(join(dirty, 'new-dir', 'one.txt'), 'one\n');
    writeFileSync(join(dirty, 'new-dir', 'two.txt'), 'two\n');
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it.effect('reports a staged-then-re-edited path on both axes with distinct per-axis stats', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { entries } = yield* client.status(dirty);
      const a = entries.find((e) => e.path === 'a.txt');
      expect(a).toBeDefined();
      // Staged stats reflect the first edit (+2); unstaged stats the second (+1) — different diffs.
      expect(a?.staged).toEqual({ kind: 'modified', additions: 2, deletions: 0 });
      expect(a?.unstaged).toEqual({ kind: 'modified', additions: 1, deletions: 0 });
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('reports an untracked file on the unstaged axis with no stats', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { entries } = yield* client.status(dirty);
      const untracked = entries.find((e) => e.path === 'untracked.txt');
      expect(untracked?.staged).toBeUndefined();
      expect(untracked?.unstaged).toEqual({ kind: 'untracked' });
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('expands an untracked directory to one entry per file (--untracked-files=all)', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { entries } = yield* client.status(dirty);
      // Not folded to a single `new-dir/` row — each nested file is its own untracked entry.
      expect(entries.some((e) => e.path === 'new-dir/')).toBe(false);
      expect(entries.find((e) => e.path === 'new-dir/one.txt')?.unstaged).toEqual({
        kind: 'untracked',
      });
      expect(entries.find((e) => e.path === 'new-dir/two.txt')?.unstaged).toEqual({
        kind: 'untracked',
      });
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('reports a binary modification with a kind but no line stats', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { entries } = yield* client.status(dirty);
      const binary = entries.find((e) => e.path === 'binary.bin');
      expect(binary?.staged?.kind).toBe('modified');
      expect(binary?.staged?.additions).toBeUndefined();
      expect(binary?.staged?.deletions).toBeUndefined();
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('reports a rename with oldPath set to the pre-rename path', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const { entries } = yield* client.status(dirty);
      const renamed = entries.find((e) => e.path === 'renamed.txt');
      expect(renamed).toBeDefined();
      expect(renamed?.oldPath).toBe('rename-me.txt');
      expect(renamed?.staged?.kind).toBe('renamed');
      // The old path is folded into the rename entry, not surfaced as its own entry.
      expect(entries.some((e) => e.path === 'rename-me.txt')).toBe(false);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('reports a clean repo as no entries with the current branch', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const status = yield* client.status(clean);
      expect(status.entries).toEqual([]);
      expect(status.branch).toBe('main');
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    }).pipe(Effect.provide(GitClient.Default)),
  );

  it.effect('fails with RepoNotFoundError for a bad path', () =>
    Effect.gen(function* () {
      const client = yield* GitClient;
      const error = yield* Effect.flip(client.status(join(base, 'does-not-exist')));
      expect(error._tag).toBe('RepoNotFoundError');
    }).pipe(Effect.provide(GitClient.Default)),
  );
});
