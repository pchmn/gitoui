/**
 * @vitest-environment happy-dom
 */

import type { Commit } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitsKey } from '../hooks/useCommits';
import { CommitGraph } from './CommitGraph';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.stubGlobal('desktop', { platform: 'linux' });

function makeCommit(partial: Partial<Commit> = {}): Commit {
  return {
    sha: 'abc1234',
    parents: [],
    author: { name: 'Ada Lovelace', email: 'ada@example.com' },
    committer: { name: 'Ada Lovelace', email: 'ada@example.com' },
    authoredAt: Date.now() - 2 * 60 * 60 * 1000,
    committedAt: Date.now() - 2 * 60 * 60 * 1000,
    subject: 'feat: add engine',
    body: '',
    refs: [],
    ...partial,
  };
}

function Wrapper({
  root = '/repo',
  listCommitsMock,
}: {
  root?: string;
  listCommitsMock: () => Promise<readonly Commit[]>;
}) {
  vi.stubGlobal('git', { listCommits: vi.fn(listCommitsMock) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <CommitGraph root={root} />
    </QueryClientProvider>
  );
}

describe('CommitGraph rows', () => {
  it('renders subject, author name, avatar, and a relative date per commit', async () => {
    const commits = [
      makeCommit({ sha: 'a1', subject: 'feat: add engine' }),
      makeCommit({ sha: 'a2', subject: 'fix: leak', author: { name: 'Bob', email: 'bob@x.com' } }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('feat: add engine');
    expect(screen.getByText('fix: leak')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    // Two circular author avatars, one per commit.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getAllByText('2h')).toHaveLength(2);
  });
});

describe('CommitGraph refs', () => {
  it('renders a pill per ref, with the current branch emphasized and remote/tag quieter', async () => {
    const commits = [
      makeCommit({
        sha: 'tip',
        subject: 'the decorated tip',
        refs: [
          { _tag: 'Branch', name: 'main', current: true },
          { _tag: 'RemoteBranch', name: 'origin/main' },
          { _tag: 'Tag', name: 'v2.3.0' },
        ],
      }),
      makeCommit({ sha: 'plain', subject: 'an undecorated commit', committedAt: 1_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('the decorated tip');
    expect(screen.getByText('main').getAttribute('data-emphasis')).toBe('strong');
    expect(screen.getByText('origin/main').getAttribute('data-emphasis')).toBe('quiet');
    expect(screen.getByText('v2.3.0').getAttribute('data-emphasis')).toBe('quiet');
  });

  it('renders a non-current branch pill at default emphasis', async () => {
    const commits = [
      makeCommit({ refs: [{ _tag: 'Branch', name: 'feature/pay-fallback', current: false }] }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const pill = await screen.findByText('feature/pay-fallback');
    expect(pill.getAttribute('data-emphasis')).toBe('default');
  });

  it('renders a strong HEAD marker for a detached HEAD', async () => {
    const commits = [makeCommit({ refs: [{ _tag: 'Head' }] })];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const pill = await screen.findByText('HEAD');
    expect(pill.getAttribute('data-emphasis')).toBe('strong');
  });

  it('renders no pills for a commit with no refs', async () => {
    const { container } = render(
      <Wrapper listCommitsMock={() => Promise.resolve([makeCommit({ refs: [] })])} />,
    );

    await screen.findByText('feat: add engine');
    expect(container.querySelector('[data-slot="ref-pill"]')).toBeNull();
  });
});

describe('CommitGraph ordering', () => {
  // The TanStack DB collection is keyed by `sha`, so without an explicit `orderBy` rows come out in
  // sha order, not chronological. Feed them out of order and assert newest-commit-date-first.
  it('renders commits newest-first by commit date, regardless of input order', async () => {
    const commits = [
      makeCommit({ sha: 'mid', subject: 'the middle one', committedAt: 2_000 }),
      makeCommit({ sha: 'old', subject: 'the oldest one', committedAt: 1_000 }),
      makeCommit({ sha: 'new', subject: 'the newest one', committedAt: 3_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('the newest one');
    const rendered = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rendered[0]).toContain('the newest one');
    expect(rendered[1]).toContain('the middle one');
    expect(rendered[2]).toContain('the oldest one');
  });
});

describe('CommitGraph states', () => {
  it('shows skeleton rows while loading', () => {
    render(<Wrapper listCommitsMock={() => new Promise(() => {})} />);
    expect(screen.getByRole('list', { name: /loading commits/i, hidden: false })).toBeTruthy();
  });

  it('shows an empty hint when the repo has no commits', async () => {
    render(<Wrapper listCommitsMock={() => Promise.resolve([])} />);
    expect(await screen.findByText(/no commits yet/i)).toBeTruthy();
  });

  it('shows an error message when the query rejects', async () => {
    render(
      <Wrapper
        listCommitsMock={() => Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' })}
      />,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/failed to load commits/i);
  });
});

describe('CommitGraph freshness', () => {
  // Repo switch: the `root` prop changes, `useCommits` mints a new collection scoped to the new
  // path. Without `[collection]` on `useLiveQuery` the graph would stay frozen on the old repo.
  it('swaps the list when the active repo (root) changes', async () => {
    const byRepo: Record<string, Commit[]> = {
      '/repoA': [makeCommit({ sha: 'A1', subject: 'commit in repo A' })],
      '/repoB': [makeCommit({ sha: 'B1', subject: 'commit in repo B' })],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('git', {
      listCommits: vi.fn(({ repoPath }: { repoPath: string }) => Promise.resolve(byRepo[repoPath])),
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <CommitGraph root='/repoA' />
      </QueryClientProvider>,
    );
    await screen.findByText('commit in repo A');

    rerender(
      <QueryClientProvider client={queryClient}>
        <CommitGraph root='/repoB' />
      </QueryClientProvider>,
    );
    await screen.findByText('commit in repo B');
    expect(screen.queryByText('commit in repo A')).toBeNull();
  });

  // Branch switch: same `root` (same collection), refreshed via the `invalidateQueries(commitsKey)`
  // call that `useSwitchBranch`/`useCreateBranch` run on success. Drives the collection's own
  // QueryObserver → refetch → reconcile (commits gone from the new HEAD are dropped).
  it('refreshes the list when the commits query is invalidated', async () => {
    let head: Commit[] = [makeCommit({ sha: 'before', subject: 'on the old branch' })];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('git', { listCommits: vi.fn(() => Promise.resolve(head)) });

    render(
      <QueryClientProvider client={queryClient}>
        <CommitGraph root='/repo' />
      </QueryClientProvider>,
    );
    await screen.findByText('on the old branch');

    head = [makeCommit({ sha: 'after', subject: 'on the new branch' })];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: commitsKey('/repo') });
    });

    await screen.findByText('on the new branch');
    expect(screen.queryByText('on the old branch')).toBeNull();
  });
});
