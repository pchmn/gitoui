/**
 * @vitest-environment happy-dom
 */

import type { Commit } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { commitsKey, PAGE_LIMIT } from '../hooks/useCommits';
import { CommitGraph } from './CommitGraph';

// TanStack Virtual reads the scroll container's `offsetHeight`/`offsetWidth` to size its viewport
// (`@tanstack/virtual-core`'s `getRect`). happy-dom has no real layout engine, so both are 0 by
// default and every row would fall outside the "visible" range. A fixed viewport is enough — rows
// are a fixed height (`estimateSize`), no dynamic per-row measurement is in play.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 });
});

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

/** A run of `count` commits, newest (`committedAt`) first, with `sha`/`subject` derived from `startAt`. */
function makeCommitPage(count: number, startAt: number): Commit[] {
  return Array.from({ length: count }, (_, i) => {
    const n = startAt + i;
    return makeCommit({
      sha: `sha-${n}`,
      subject: `commit #${n}`,
      committedAt: 1_000_000 - n, // descending — commit #0 is newest.
    });
  });
}

type ListCommitsArgs = { repoPath: string; skip?: number; limit?: number };

function Wrapper({
  root = '/repo',
  listCommitsMock,
}: {
  root?: string;
  listCommitsMock: (args: ListCommitsArgs) => Promise<readonly Commit[]>;
}) {
  vi.stubGlobal('git', { listCommits: vi.fn(listCommitsMock) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <CommitGraph root={root} />
    </QueryClientProvider>
  );
}

/** Scroll the virtualized scroller to `top` and flush the resulting scroll event. */
async function scrollTo(top: number) {
  const list = await screen.findByRole('list', { name: 'Commits' });
  const scroller = list.parentElement;
  if (!scroller) throw new Error('CommitGraph scroll container not found');
  await act(async () => {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new Event('scroll'));
  });
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
    expect(screen.getAllByText('2h')).toHaveLength(2);
    // A short first page (2 < PAGE_LIMIT) is the whole history — the quiet terminus row joins the
    // two commit rows.
    await screen.findByText(/end of history/i);
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
    // Only assert the relative order of the commit rows — a terminus row also renders (3 < PAGE_LIMIT).
    const rows = screen
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
      .filter((text) => text.includes('the '));
    expect(rows[0]).toContain('the newest one');
    expect(rows[1]).toContain('the middle one');
    expect(rows[2]).toContain('the oldest one');
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

  // A page-1 refetch (branch switch) resets the loaded window, so a Repository that was previously
  // fully loaded (terminus shown) but whose new HEAD has a full page must go back to "may have more".
  it('resets hasNextPage on invalidation, re-arming the load-more path for the new HEAD', async () => {
    let head: Commit[] = [makeCommit({ sha: 'short-branch', subject: 'short branch tip' })];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const listCommitsMock = vi.fn(({ skip }: ListCommitsArgs) => {
      if ((skip ?? 0) === 0) return Promise.resolve(head);
      return Promise.resolve(makeCommitPage(10, 1_000)); // the second page of the new (full) HEAD.
    });
    vi.stubGlobal('git', { listCommits: listCommitsMock });

    render(
      <QueryClientProvider client={queryClient}>
        <CommitGraph root='/repo' />
      </QueryClientProvider>,
    );
    await screen.findByText('short branch tip');
    await screen.findByText(/end of history/i);

    head = makeCommitPage(PAGE_LIMIT, 0); // switching to a HEAD with a full first page.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: commitsKey('/repo') });
    });

    await screen.findByText('commit #0');
    // The full first page means "maybe more" again — the terminus should be gone until the next
    // page comes back short.
    expect(screen.queryByText(/end of history/i)).toBeNull();
  });

  // A page-1 reset replaces the loaded window, so a scroll offset deep into the previous history
  // must not survive it — the graph snaps back to the top of the new HEAD's history.
  it('snaps the scroll offset back to the top when the commits query is invalidated', async () => {
    let head: Commit[] = makeCommitPage(PAGE_LIMIT, 0);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('git', {
      listCommits: vi.fn(({ skip }: ListCommitsArgs) =>
        Promise.resolve((skip ?? 0) === 0 ? head : []),
      ),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CommitGraph root='/repo' />
      </QueryClientProvider>,
    );
    await screen.findByText('commit #0');

    // Deep into the loaded window (but shy of the load-more threshold).
    await scrollTo(100 * 32);
    const scroller = screen.getByRole('list', { name: 'Commits' }).parentElement;
    expect(scroller?.scrollTop).toBe(100 * 32);

    head = makeCommitPage(5, 10_000); // the new branch's (much shorter) history.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: commitsKey('/repo') });
    });

    await screen.findByText('commit #10000');
    expect(scroller?.scrollTop).toBe(0);
  });
});

describe('CommitGraph virtualization', () => {
  it('only mounts the visible rows for a large history, not every commit', async () => {
    const commits = makeCommitPage(PAGE_LIMIT, 0);
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('commit #0');
    // 600px viewport / 32px rows ≈ 19 visible + overscan on both sides — nowhere near all 300.
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(commits.length);
  });
});

describe('CommitGraph pagination', () => {
  it('requests the first page with skip 0 and the default limit', async () => {
    const listCommitsMock = vi.fn(() => Promise.resolve([makeCommit()]));
    render(<Wrapper listCommitsMock={listCommitsMock} />);

    await screen.findByText('feat: add engine');
    expect(listCommitsMock).toHaveBeenCalledWith({ repoPath: '/repo', skip: 0, limit: PAGE_LIMIT });
  });

  it('loads the next page (skip = loaded count) when scrolling nears the end, appends + dedups by sha, and halts once a short page arrives', async () => {
    const page1 = makeCommitPage(PAGE_LIMIT, 0); // full page — "there may be more".
    // Page 2 re-sends the last row of page 1 (`sha-299`) to prove dedup, then adds new rows, and is
    // itself short — the real end of history.
    const page2 = [page1[page1.length - 1] as Commit, ...makeCommitPage(20, 300)];
    const listCommitsMock = vi.fn(({ skip }: ListCommitsArgs) =>
      Promise.resolve((skip ?? 0) === 0 ? page1 : page2),
    );
    render(<Wrapper listCommitsMock={listCommitsMock} />);
    await screen.findByText('commit #0');

    // Near (not at) the loaded end of page 1 — within `LOAD_MORE_THRESHOLD` rows of row 299.
    await scrollTo((PAGE_LIMIT - 10) * 32);

    expect(await screen.findByText('commit #300')).toBeTruthy();
    expect(listCommitsMock).toHaveBeenCalledWith({
      repoPath: '/repo',
      skip: PAGE_LIMIT,
      limit: PAGE_LIMIT,
    });
    // `sha-299` was re-sent by page 2 — dedup by sha means it renders once, not twice.
    expect(screen.getAllByText('commit #299')).toHaveLength(1);

    // Scroll to the real end (320 total rows) to reveal the terminus row.
    await scrollTo(320 * 32);
    await screen.findByText(/end of history/i);

    listCommitsMock.mockClear();
    await scrollTo(320 * 32);
    // The end of history: no further requests once a page came back shorter than the limit.
    expect(listCommitsMock).not.toHaveBeenCalled();
  });
});
