/**
 * @vitest-environment happy-dom
 */

import type { Commit, Status } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommitSelectionProvider } from '#renderer/modules/commits/CommitSelectionContext';
import { ActiveRepositoryProvider } from '#renderer/modules/repository/ActiveRepositoryContext';
import { commitsKey, PAGE_LIMIT } from '../hooks/useCommits';
import { CommitGraph } from './CommitGraph';

/**
 * `CommitSelectionContext` resets on active-repo change (mirroring `SelectionContext`), so it
 * reads `useActiveRepository` and needs an `ActiveRepositoryProvider` ancestor in every test —
 * independent from the `root` prop `CommitGraph` itself takes for querying commits.
 */
function TestProviders({ children }: { children: ReactNode }) {
  return (
    <ActiveRepositoryProvider>
      <CommitSelectionProvider>{children}</CommitSelectionProvider>
    </ActiveRepositoryProvider>
  );
}

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

/** A clean Working tree — the default so `useStatus` finds no WIP row unless a test asks for one. */
const CLEAN_STATUS: Status = { branch: 'main', ahead: 0, behind: 0, entries: [] };

function Wrapper({
  root = '/repo',
  listCommitsMock,
  statusMock,
}: {
  root?: string;
  listCommitsMock: (args: ListCommitsArgs) => Promise<readonly Commit[]>;
  statusMock?: () => Promise<Status>;
}) {
  vi.stubGlobal('git', {
    listCommits: vi.fn(listCommitsMock),
    status: vi.fn(statusMock ?? (() => Promise.resolve(CLEAN_STATUS))),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <TestProviders>
        <CommitGraph root={root} />
      </TestProviders>
    </QueryClientProvider>
  );
}

/** Scroll the virtualized scroller to `top` and flush the resulting scroll event. */
async function scrollTo(top: number) {
  const list = await screen.findByRole('listbox', { name: 'Commits' });
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

  it('tints branch pills with their lane color so a name reads as belonging to its line', async () => {
    const commits = [
      makeCommit({
        sha: 'tip',
        subject: 'the decorated tip',
        refs: [
          { _tag: 'Branch', name: 'main', current: true },
          { _tag: 'Tag', name: 'v2.3.0' },
        ],
      }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('the decorated tip');
    // The current branch rides HEAD's lane (column 0 → --lane-1); its pill wears that lane color.
    expect(screen.getByText('main').getAttribute('data-tint')).toBe('var(--lane-1)');
    // A tag marks a point, not a line — it keeps the neutral pill (no lane tint).
    expect(screen.getByText('v2.3.0').getAttribute('data-tint')).toBeNull();
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
  // sha order, not `listCommits`'s order. The lane sweep (ADR 0007) requires strict
  // children-before-parents order, which `listCommits`'s `scope: 'allRefs'` walk already
  // guarantees (`--date-order`) — so the graph must render in the order the array came back in, not
  // re-sort by `committedAt` (which that walk needn't match, e.g. across clock skew).
  it('renders commits in listCommits order (the git walk), not by commit date', async () => {
    const commits = [
      makeCommit({ sha: 'mid', subject: 'the middle one', committedAt: 2_000 }),
      makeCommit({ sha: 'old', subject: 'the oldest one', committedAt: 1_000 }),
      makeCommit({ sha: 'new', subject: 'the newest one', committedAt: 3_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('the middle one');
    // Only assert the relative order of the commit rows — a terminus row also renders (3 < PAGE_LIMIT).
    const rows = screen
      .getAllByRole('option')
      .map((row) => row.textContent ?? '')
      .filter((text) => text.includes('the '));
    expect(rows[0]).toContain('the middle one');
    expect(rows[1]).toContain('the oldest one');
    expect(rows[2]).toContain('the newest one');
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

  it('shows an inline error phrased via matchError when the query rejects, with no toast', async () => {
    // When a subset query errors, @tanstack/db's on-demand sync layer leaks *derived* promise
    // rejections (`.finally()` / argless `.catch()` chained off the subset's ready promise, in
    // `collection/subscription.js` and `query/subset-dedupe.js` as of 0.6.x). The error itself IS
    // handled — `utils.isError` flips and the alert renders, asserted below — so detach Vitest's
    // unhandled-rejection accounting for this test only, and restore it after the leaked
    // rejections have flushed.
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      render(
        <Wrapper
          listCommitsMock={() => Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' })}
        />,
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      // `matchError` picks the `RepoNotFoundError` arm, not the generic fallback.
      expect(screen.getByRole('alert').textContent).toMatch(/repository not found: \/bad\/path/i);
      // Inline, not a toast — no toast region renders alongside the error.
      expect(screen.queryByRole('status')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const listener of rejectionListeners) {
        process.on('unhandledRejection', listener);
      }
    }
  });

  it('retries and shows the commits once the retried query succeeds', async () => {
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      let hasFailed = false;
      const listCommitsMock = vi.fn(() => {
        if (!hasFailed) {
          hasFailed = true;
          return Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' });
        }
        return Promise.resolve([makeCommit({ subject: 'recovered commit' })]);
      });
      render(<Wrapper listCommitsMock={listCommitsMock} />);

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      await act(async () => {
        retryButton.click();
      });

      await screen.findByText('recovered commit');
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const listener of rejectionListeners) {
        process.on('unhandledRejection', listener);
      }
    }
  });

  // The regression: a retry that succeeds against an *empty* history writes no rows, so no
  // live-query change re-renders the component — only the hook's explicit post-retry re-read can
  // swap the stale error UI for the empty state.
  it('retries into an empty history and swaps the error for the empty state', async () => {
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      let hasFailed = false;
      const listCommitsMock = vi.fn(() => {
        if (!hasFailed) {
          hasFailed = true;
          return Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' });
        }
        return Promise.resolve([]);
      });
      render(<Wrapper listCommitsMock={listCommitsMock} />);

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      await act(async () => {
        retryButton.click();
      });

      expect(await screen.findByText(/no commits yet/i)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const listener of rejectionListeners) {
        process.on('unhandledRejection', listener);
      }
    }
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
      status: vi.fn(() => Promise.resolve(CLEAN_STATUS)),
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TestProviders>
          <CommitGraph root='/repoA' />
        </TestProviders>
      </QueryClientProvider>,
    );
    await screen.findByText('commit in repo A');

    rerender(
      <QueryClientProvider client={queryClient}>
        <TestProviders>
          <CommitGraph root='/repoB' />
        </TestProviders>
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
    vi.stubGlobal('git', {
      listCommits: vi.fn(() => Promise.resolve(head)),
      status: vi.fn(() => Promise.resolve(CLEAN_STATUS)),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TestProviders>
          <CommitGraph root='/repo' />
        </TestProviders>
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
    vi.stubGlobal('git', {
      listCommits: listCommitsMock,
      status: vi.fn(() => Promise.resolve(CLEAN_STATUS)),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TestProviders>
          <CommitGraph root='/repo' />
        </TestProviders>
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
      status: vi.fn(() => Promise.resolve(CLEAN_STATUS)),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TestProviders>
          <CommitGraph root='/repo' />
        </TestProviders>
      </QueryClientProvider>,
    );
    await screen.findByText('commit #0');

    // Deep into the loaded window (but shy of the load-more threshold).
    await scrollTo(100 * 32);
    const scroller = screen.getByRole('listbox', { name: 'Commits' }).parentElement;
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
    const rows = screen.getAllByRole('option');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(commits.length);
  });
});

describe('CommitGraph pagination', () => {
  it('requests the first page with skip 0 and the default limit', async () => {
    const listCommitsMock = vi.fn(() => Promise.resolve([makeCommit()]));
    render(<Wrapper listCommitsMock={listCommitsMock} />);

    await screen.findByText('feat: add engine');
    expect(listCommitsMock).toHaveBeenCalledWith({
      repoPath: '/repo',
      skip: 0,
      limit: PAGE_LIMIT,
      scope: 'allRefs',
    });
  });

  it('grows the loaded window when scrolling nears the end, dedups overlaps by sha, and halts once the window comes back short', async () => {
    // 320 commits total: one full page, then a short remainder — the real end of history. The mock
    // slices by `skip`/`limit` because the on-demand sync layer re-requests the *whole grown
    // window* (`skip: 0, limit: 2 × PAGE_LIMIT`), not a delta page; overlapping rows reconcile by
    // key.
    const history = makeCommitPage(PAGE_LIMIT + 20, 0);
    const listCommitsMock = vi.fn(({ skip = 0, limit }: ListCommitsArgs) =>
      Promise.resolve(history.slice(skip, limit === undefined ? undefined : skip + limit)),
    );
    render(<Wrapper listCommitsMock={listCommitsMock} />);
    await screen.findByText('commit #0');

    // Near (not at) the loaded end of the first page — within `LOAD_MORE_THRESHOLD` rows of row 299.
    await scrollTo((PAGE_LIMIT - 10) * 32);

    expect(await screen.findByText('commit #300')).toBeTruthy();
    expect(listCommitsMock).toHaveBeenCalledWith({
      repoPath: '/repo',
      skip: 0,
      limit: 2 * PAGE_LIMIT,
      scope: 'allRefs',
    });
    // Loading more must keep the list mounted and the scroll offset intact — the live-query
    // recompile used to flash empty, remounting the scroller at scrollTop 0.
    const scroller = screen.getByRole('listbox', { name: 'Commits' }).parentElement;
    expect(scroller?.scrollTop).toBe((PAGE_LIMIT - 10) * 32);
    // Row 299 sat in both the first window and the grown one — reconciliation by sha renders it once.
    expect(screen.getAllByText('commit #299')).toHaveLength(1);

    // Scroll to the real end (320 total rows) to reveal the terminus row.
    await scrollTo(320 * 32);
    await screen.findByText(/end of history/i);

    listCommitsMock.mockClear();
    await scrollTo(320 * 32);
    // The end of history: no further requests once the window came back shorter than requested.
    expect(listCommitsMock).not.toHaveBeenCalled();
  });
});

describe('CommitGraph selection', () => {
  it('clicking a row selects its commit, and clicking another row moves the selection', async () => {
    const commits = [
      makeCommit({ sha: 'a1', subject: 'feat: add engine' }),
      makeCommit({ sha: 'a2', subject: 'fix: leak' }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const firstRow = (await screen.findByText('feat: add engine')).closest('[role="option"]');
    const secondRow = screen.getByText('fix: leak').closest('[role="option"]');
    if (!firstRow || !secondRow) throw new Error('commit rows not found');

    // Neither row starts selected.
    expect(firstRow.getAttribute('data-selected')).toBe('false');
    expect(secondRow.getAttribute('data-selected')).toBe('false');

    await act(async () => {
      firstRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(firstRow.getAttribute('data-selected')).toBe('true');
    expect(secondRow.getAttribute('data-selected')).toBe('false');

    // Selecting the other row moves the selection — the first is no longer selected.
    await act(async () => {
      secondRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(firstRow.getAttribute('data-selected')).toBe('false');
    expect(secondRow.getAttribute('data-selected')).toBe('true');
  });
});

describe('CommitGraph lanes', () => {
  // The fork+merge DAG from laneLayout's fixture 2 (issue #55): M (the current tip, a merge) forks
  // into B/F, both converging back into A. Rendered through the component (issue #56) — one
  // per-row `<svg>`, one hollow-ring node on the merge row, and edges/nodes referencing the
  // `--lane-*` tokens. Attributes only, never pixels.
  it('renders per-row SVG lanes, nodes, and edges over the fork+merge DAG', async () => {
    const commits = [
      makeCommit({
        sha: 'M',
        parents: ['B', 'F'],
        subject: 'Merge branch F into main',
        refs: [{ _tag: 'Branch', name: 'main', current: true }],
        committedAt: 4_000,
      }),
      makeCommit({ sha: 'B', parents: ['A'], subject: 'on the main line', committedAt: 3_000 }),
      makeCommit({ sha: 'F', parents: ['A'], subject: 'on the forked branch', committedAt: 2_000 }),
      makeCommit({ sha: 'A', parents: [], subject: 'the common ancestor', committedAt: 1_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    await screen.findByText('Merge branch F into main');

    // Every commit row carries its own per-row SVG — composition with virtualization is free.
    const rows = screen
      .getAllByRole('option')
      .filter((row) => row.querySelector('svg[data-slot="lane-graph"]'));
    expect(rows).toHaveLength(4);

    // M is the merge commit: a hollow ring (no fill, a stroked --lane-* token), not a filled dot.
    const mergeRow = (await screen.findByText('Merge branch F into main')).closest(
      '[role="option"]',
    );
    const mergeNode = mergeRow?.querySelector('circle[data-slot="lane-node"]');
    expect(mergeNode?.getAttribute('data-merge')).toBe('true');
    expect(mergeNode?.getAttribute('fill')).toBe('none');
    expect(mergeNode?.getAttribute('stroke')).toMatch(/^var\(--lane-[1-5]\)$/);

    // An ordinary commit's node is a filled dot referencing a --lane-* token.
    const ancestorRow = screen.getByText('the common ancestor').closest('[role="option"]');
    const ancestorNode = ancestorRow?.querySelector('circle[data-slot="lane-node"]');
    expect(ancestorNode?.getAttribute('data-merge')).toBe('false');
    expect(ancestorNode?.getAttribute('fill')).toMatch(/^var\(--lane-[1-5]\)$/);

    // The fork (M diverging to F) and the merge (F's lane converging back into its fork point A)
    // both render as elbow edges (ADR 0007 amendment), each stroked with a --lane-* token: the
    // diverge bends in M's row (`below`), the converge bends in A's row (`above`).
    const mergeEdge = mergeRow?.querySelector('path[data-slot="lane-transition"]');
    expect(mergeEdge?.getAttribute('data-direction')).toBe('below');
    const forkEdge = ancestorRow?.querySelector('path[data-slot="lane-transition"]');
    expect(forkEdge?.getAttribute('data-direction')).toBe('above');
    const edges = rows.flatMap((row) =>
      Array.from(row.querySelectorAll('path[data-slot="lane-transition"]')),
    );
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge.getAttribute('stroke')).toMatch(/^var\(--lane-[1-5]\)$/);
    }

    // No dangling stubs: M is a tip (fresh lane — nothing above its node) and A is a root
    // (nothing below its node); own-column half-verticals are gated by lineAbove/lineBelow.
    expect(mergeRow?.querySelector('line[data-half="top"]')).toBeNull();
    expect(mergeRow?.querySelector('line[data-half="bottom"]')).not.toBeNull();
    expect(ancestorRow?.querySelector('line[data-half="top"]')).not.toBeNull();
    expect(ancestorRow?.querySelector('line[data-half="bottom"]')).toBeNull();

    // A narrow graph needs no horizontal scroll — no scrollbar proxy.
    expect(document.querySelector('[data-slot="lanes-scrollbar"]')).toBeNull();
  });

  // Hovering a Commit row highlights its Branch's whole lane run (GitKraken-familiar): the run's
  // Commit rows read as a set (stronger tint), the line goes fully opaque across its range while
  // everything else recedes. The name reveals are CSS-driven and instant, independent of the
  // arming: an undecorated row carries its run's Branch name as a ghost pill shown on the row's
  // hover, and a decorated row's pills ellipsize at rest and extend on the REFS zone's hover.
  it('hovering a row highlights its branch run; undecorated rows carry a ghost Branch pill', async () => {
    const commits = [
      makeCommit({
        sha: 'M',
        parents: ['B', 'F'],
        subject: 'the merge',
        refs: [{ _tag: 'Branch', name: 'main', current: true }],
        committedAt: 4_000,
      }),
      makeCommit({ sha: 'B', parents: ['A'], subject: 'on the main line', committedAt: 3_000 }),
      makeCommit({
        sha: 'F',
        parents: ['A'],
        subject: 'forked work',
        refs: [{ _tag: 'Branch', name: 'feat/forked-branch-name', current: false }],
        committedAt: 2_000,
      }),
      makeCommit({ sha: 'A', parents: [], subject: 'the ancestor', committedAt: 1_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const mainRow = (await screen.findByText('on the main line')).closest(
      '[role="option"]',
    ) as HTMLElement | null;
    const forkedRow = screen
      .getByText('forked work')
      .closest('[role="option"]') as HTMLElement | null;
    if (!mainRow || !forkedRow) throw new Error('rows not found');

    // At rest, lines sit at the light translucency; nodes (the Commits) stay fully opaque.
    expect(mainRow.querySelector('line[data-col="1"]')?.getAttribute('opacity')).toBe('0.8');
    expect(mainRow.querySelector('[data-slot="lane-node"]')?.getAttribute('opacity')).toBe('1');

    // The highlight is armed on hover *intent* (a short rest), so transitions go through fake
    // timers: a sweep that doesn't rest never fires.
    vi.useFakeTimers();
    try {
      // Hovering F's row: nothing happens instantly (intent not yet armed)...
      fireEvent.mouseOver(forkedRow);
      expect(forkedRow.getAttribute('data-run-member')).toBe('false');

      // ...then the forked branch's run lifts: F is a member, B is not, the run's line (column
      // 1) goes fully opaque on every row it crosses while every other line recedes — the opacity
      // spread alone carries the highlight; stroke weight never changes.
      act(() => vi.advanceTimersByTime(600));
      expect(forkedRow.getAttribute('data-run-member')).toBe('true');
      expect(mainRow.getAttribute('data-run-member')).toBe('false');
      expect(mainRow.querySelector('line[data-col="1"]')?.getAttribute('stroke-width')).toBe('2');
      expect(mainRow.querySelector('line[data-col="1"]')?.getAttribute('opacity')).toBe('1');
      expect(forkedRow.querySelector('line[data-col="0"]')?.getAttribute('stroke-width')).toBe('2');
      expect(forkedRow.querySelector('line[data-col="0"]')?.getAttribute('opacity')).toBe('0.35');
      // Other lanes' nodes recede more gently than their lines; the hovered run's stays full.
      expect(mainRow.querySelector('[data-slot="lane-node"]')?.getAttribute('opacity')).toBe('0.5');
      expect(forkedRow.querySelector('[data-slot="lane-node"]')?.getAttribute('opacity')).toBe('1');
      // Only the run's own Commits stay fully legible: the other rows' subject/author recede.
      expect(screen.getByText('on the main line').className).toContain('opacity-50');
      expect(screen.getByText('forked work').className).not.toContain('opacity-50');

      // Moving straight to a row of a DIFFERENT run is a single native mouseout whose leave +
      // enter React dispatches in the same batch: the old highlight must reset instantly AND the
      // new row must re-arm with intent — no instant handover across runs.
      fireEvent.mouseOut(forkedRow, { relatedTarget: mainRow });
      expect(forkedRow.getAttribute('data-run-member')).toBe('false');
      expect(mainRow.getAttribute('data-run-member')).toBe('false');
      expect(mainRow.querySelector('line[data-col="1"]')?.getAttribute('opacity')).toBe('0.8');

      // ...then, after the rest, the undecorated B row highlights main's run.
      act(() => vi.advanceTimersByTime(600));
      expect(mainRow.getAttribute('data-run-member')).toBe('true');
      expect(forkedRow.getAttribute('data-run-member')).toBe('false');

      // Moving along the highlighted run's OWN rows hands the highlight over seamlessly — no
      // reset, no re-arm delay: the branch stays lit while the pointer walks it.
      const ancestorRow = screen
        .getByText('the ancestor')
        .closest('[role="option"]') as HTMLElement | null;
      if (!ancestorRow) throw new Error('ancestor row not found');
      fireEvent.mouseOut(mainRow, { relatedTarget: ancestorRow });
      expect(mainRow.getAttribute('data-run-member')).toBe('true');
      expect(ancestorRow.getAttribute('data-run-member')).toBe('true');
      expect(mainRow.querySelector('line[data-half="top"]')?.getAttribute('opacity')).toBe('1');

      // Leaving the rows clears everything instantly.
      fireEvent.mouseLeave(ancestorRow);
      expect(mainRow.getAttribute('data-run-member')).toBe('false');
      expect(ancestorRow.getAttribute('data-run-member')).toBe('false');

      // The reveals are CSS-driven, no arming involved: every undecorated row of a named run
      // carries the run's Branch name as a hidden ghost pill (shown the moment the row is
      // hovered), and a decorated row's pill carries its full name regardless of hover — the
      // REFS zone ellipsizes at rest and releases it on the zone's own hover.
      for (const row of [mainRow, ancestorRow]) {
        const ghost = within(row).getByText('main');
        expect(ghost.className).toContain('hidden');
        expect(ghost.className).toContain('group-hover:inline-block');
      }
      expect(within(forkedRow).queryByText('main')).toBeNull();
      expect(within(forkedRow).getByText('feat/forked-branch-name')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  // Lanes hold their columns down to their fork point (ADR 0007 amendment), so a busy repo is
  // honestly wide — the lanes zone caps at a max width and scrolls horizontally behind a shared
  // scrollbar proxy instead of pushing the COMMIT column away.
  it('caps the lanes viewport and mounts the shared horizontal scrollbar when lanes overflow', async () => {
    // 14 unrelated tips → 14 concurrent lanes, each riding its own column to the page end.
    const commits = Array.from({ length: 14 }, (_, i) =>
      makeCommit({
        sha: `T${i}`,
        parents: [`P${i}`],
        subject: `tip ${i}`,
        committedAt: 20_000 - i,
      }),
    );
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const firstRow = (await screen.findByText('tip 0')).closest('[role="option"]');
    const viewport = firstRow?.querySelector('[data-slot="lanes-viewport"]') as HTMLElement | null;
    const svg = viewport?.querySelector('svg[data-slot="lane-graph"]');
    if (!viewport || !svg) throw new Error('lanes viewport not found');

    // The SVG carries the full lane width; the viewport clips it to the cap.
    const viewportWidth = Number.parseInt(viewport.style.width, 10);
    const svgWidth = Number(svg.getAttribute('width'));
    expect(svgWidth).toBeGreaterThan(viewportWidth);

    // The shared scrollbar proxy spans the same full lane width, aligned under the viewport.
    const proxy = document.querySelector('[data-slot="lanes-scrollbar"]') as HTMLElement | null;
    expect(proxy).not.toBeNull();
    const spacer = proxy?.firstElementChild as HTMLElement | null;
    expect(Number.parseInt(spacer?.style.width ?? '0', 10)).toBe(svgWidth);
    expect(Number.parseInt(proxy?.style.width ?? '0', 10)).toBe(viewportWidth);
  });
});

describe('CommitGraph WIP row', () => {
  // A dirty Working tree: one Staged (+3 −1) and one Unstaged (+1 −1) axis — the WIP row's
  // aggregate sums BOTH axes, so +4 −2 (issue #66). Entries without stats would add 0.
  const dirtyStatus: Status = {
    branch: 'main',
    ahead: 0,
    behind: 0,
    entries: [
      { path: 'src/a.ts', staged: { kind: 'modified', additions: 3, deletions: 1 } },
      { path: 'src/b.ts', unstaged: { kind: 'added', additions: 1, deletions: 1 } },
    ],
  };

  it('renders a WIP row with a dashed node and both-axes aggregate stats when dirty', async () => {
    render(
      <Wrapper
        listCommitsMock={() =>
          Promise.resolve([makeCommit({ sha: 'a1', subject: 'feat: add engine' })])
        }
        statusMock={() => Promise.resolve(dirtyStatus)}
      />,
    );

    const subject = await screen.findByText('Uncommitted changes');
    const wipRow = subject.closest('[data-slot="wip-row"]') as HTMLElement | null;
    expect(wipRow).not.toBeNull();
    if (!wipRow) throw new Error('WIP row not found');

    // No "WIP" pill (the node + tint carry it) and no "now" timestamp (the row is always now).
    expect(within(wipRow).queryByText('WIP')).toBeNull();
    expect(within(wipRow).queryByText('now')).toBeNull();
    // Change summary: file counts by type (1 modified staged, 1 added unstaged) AND aggregate lines.
    const modifiedCount = wipRow.querySelector('[data-slot="wip-filecount"][data-kind="modified"]');
    const addedCount = wipRow.querySelector('[data-slot="wip-filecount"][data-kind="added"]');
    expect(modifiedCount?.textContent).toContain('1');
    expect(addedCount?.textContent).toContain('1');
    expect(wipRow.querySelector('[data-slot="wip-filecount"][data-kind="deleted"]')).toBeNull();
    expect(within(wipRow).getByText('+4')).toBeTruthy();
    expect(within(wipRow).getByText('−2')).toBeTruthy();

    // A hollow, dashed node in the HEAD Commit's lane column — distinct from a Commit's filled dot
    // and a merge's solid ring — with a short dashed connector dropping toward row 0.
    const node = wipRow.querySelector('circle[data-slot="wip-node"]');
    expect(node?.getAttribute('fill')).toBe('none');
    expect(node?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(node?.getAttribute('stroke')).toMatch(/^var\(--lane-[1-5]\)$/);
    expect(
      wipRow.querySelector('line[data-slot="wip-connector"]')?.getAttribute('stroke-dasharray'),
    ).toBeTruthy();
  });

  it('renders no WIP row when the Working tree is clean', async () => {
    render(
      <Wrapper
        listCommitsMock={() => Promise.resolve([makeCommit({ subject: 'feat: add engine' })])}
        statusMock={() => Promise.resolve(CLEAN_STATUS)}
      />,
    );

    await screen.findByText('feat: add engine');
    expect(document.querySelector('[data-slot="wip-row"]')).toBeNull();
    expect(screen.queryByText('Uncommitted changes')).toBeNull();
  });

  it('selects the Working tree on click, moves to a Commit, and clears on Esc', async () => {
    render(
      <Wrapper
        listCommitsMock={() =>
          Promise.resolve([makeCommit({ sha: 'a1', subject: 'feat: add engine' })])
        }
        statusMock={() => Promise.resolve(dirtyStatus)}
      />,
    );

    const wipRow = (await screen.findByText('Uncommitted changes')).closest(
      '[data-slot="wip-row"]',
    ) as HTMLElement;
    const commitRow = screen
      .getByText('feat: add engine')
      .closest('[role="option"]') as HTMLElement;
    expect(wipRow.getAttribute('data-selected')).toBe('false');
    expect(commitRow.getAttribute('data-selected')).toBe('false');

    // Click the WIP row → it selects (Changes-mode anchor).
    await act(async () => {
      wipRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(wipRow.getAttribute('data-selected')).toBe('true');
    expect(commitRow.getAttribute('data-selected')).toBe('false');

    // Selecting a Commit moves the selection off the WIP row.
    await act(async () => {
      commitRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(wipRow.getAttribute('data-selected')).toBe('false');
    expect(commitRow.getAttribute('data-selected')).toBe('true');

    // Esc clears the selection entirely (graph-level).
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(wipRow.getAttribute('data-selected')).toBe('false');
    expect(commitRow.getAttribute('data-selected')).toBe('false');
  });
});

describe('CommitGraph keyboard navigation', () => {
  const dirtyStatus: Status = {
    branch: 'main',
    ahead: 0,
    behind: 0,
    entries: [{ path: 'a.ts', unstaged: { kind: 'modified', additions: 1, deletions: 0 } }],
  };

  const isSelected = (subject: string) =>
    screen.getByText(subject).closest('[role="option"]')?.getAttribute('data-selected') === 'true';

  it('moves the selection to the next/previous commit with ArrowDown/ArrowUp', async () => {
    const commits = [
      makeCommit({ sha: 'c0', subject: 'newest' }),
      makeCommit({ sha: 'c1', subject: 'middle', committedAt: 2_000 }),
      makeCommit({ sha: 'c2', subject: 'oldest', committedAt: 1_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const row0 = (await screen.findByText('newest')).closest('[role="option"]') as HTMLElement;
    fireEvent.click(row0);
    expect(isSelected('newest')).toBe(true);

    fireEvent.keyDown(row0, { key: 'ArrowDown' });
    expect(isSelected('middle')).toBe(true);
    expect(isSelected('newest')).toBe(false);

    fireEvent.keyDown(screen.getByText('middle'), { key: 'ArrowDown' });
    expect(isSelected('oldest')).toBe(true);

    fireEvent.keyDown(screen.getByText('oldest'), { key: 'ArrowUp' });
    expect(isSelected('middle')).toBe(true);
  });

  it('clamps at the last loaded commit on ArrowDown (no wrap)', async () => {
    const commits = [
      makeCommit({ sha: 'c0', subject: 'newest' }),
      makeCommit({ sha: 'c1', subject: 'oldest', committedAt: 1_000 }),
    ];
    render(<Wrapper listCommitsMock={() => Promise.resolve(commits)} />);

    const last = (await screen.findByText('oldest')).closest('[role="option"]') as HTMLElement;
    fireEvent.click(last);
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(isSelected('oldest')).toBe(true);
  });

  it('steps onto the WIP row from the first commit and clamps there', async () => {
    render(
      <Wrapper
        listCommitsMock={() => Promise.resolve([makeCommit({ sha: 'c0', subject: 'newest' })])}
        statusMock={() => Promise.resolve(dirtyStatus)}
      />,
    );

    const row0 = (await screen.findByText('newest')).closest('[role="option"]') as HTMLElement;
    const wipRow = screen
      .getByText('Uncommitted changes')
      .closest('[data-slot="wip-row"]') as HTMLElement;
    fireEvent.click(row0);
    expect(row0.getAttribute('data-selected')).toBe('true');

    // Up from the first commit lands on the WIP row...
    fireEvent.keyDown(row0, { key: 'ArrowUp' });
    expect(wipRow.getAttribute('data-selected')).toBe('true');
    expect(row0.getAttribute('data-selected')).toBe('false');

    // ...and Up again clamps there (no wrap past the top).
    fireEvent.keyDown(wipRow, { key: 'ArrowUp' });
    expect(wipRow.getAttribute('data-selected')).toBe('true');

    // Down returns to the first commit.
    fireEvent.keyDown(wipRow, { key: 'ArrowDown' });
    expect(row0.getAttribute('data-selected')).toBe('true');
  });

  it('focuses the WIP row on click so arrow keys step from it (macOS button-focus quirk)', async () => {
    render(
      <Wrapper
        listCommitsMock={() => Promise.resolve([makeCommit({ sha: 'c0', subject: 'newest' })])}
        statusMock={() => Promise.resolve(dirtyStatus)}
      />,
    );

    const wipRow = (await screen.findByText('Uncommitted changes')).closest(
      '[data-slot="wip-row"]',
    ) as HTMLElement;
    fireEvent.click(wipRow);
    // Clicking a <button> doesn't focus it on macOS — the row pulls focus itself so ↓ reaches its
    // key handler instead of scrolling.
    expect(document.activeElement).toBe(wipRow);

    fireEvent.keyDown(wipRow, { key: 'ArrowDown' });
    const row0 = screen.getByText('newest').closest('[role="option"]') as HTMLElement;
    expect(row0.getAttribute('data-selected')).toBe('true');
  });
});

describe('CommitGraph selection vs hover', () => {
  const twoRunCommits = () => [
    makeCommit({
      sha: 'M',
      parents: ['B', 'F'],
      subject: 'the merge',
      refs: [{ _tag: 'Branch', name: 'main', current: true }],
      committedAt: 4_000,
    }),
    makeCommit({ sha: 'B', parents: ['A'], subject: 'on the main line', committedAt: 3_000 }),
    makeCommit({
      sha: 'F',
      parents: ['A'],
      subject: 'forked work',
      refs: [{ _tag: 'Branch', name: 'feat/forked-branch-name', current: false }],
      committedAt: 2_000,
    }),
    makeCommit({ sha: 'A', parents: [], subject: 'the ancestor', committedAt: 1_000 }),
  ];

  it('keeps the selected row fully legible while another run is hover-highlighted', async () => {
    render(<Wrapper listCommitsMock={() => Promise.resolve(twoRunCommits())} />);

    const mainRow = (await screen.findByText('on the main line')).closest(
      '[role="option"]',
    ) as HTMLElement;
    const forkedRow = screen.getByText('forked work').closest('[role="option"]') as HTMLElement;

    // Select the commit on the main run, then hover-highlight the forked run.
    fireEvent.click(mainRow);

    vi.useFakeTimers();
    try {
      fireEvent.mouseOver(forkedRow);
      act(() => vi.advanceTimersByTime(600));

      // The selected main-run row is NOT a member of the forked run, but selection outranks hover:
      // its subject stays full while an unselected non-member row (the merge) recedes to 50%.
      expect(screen.getByText('on the main line').className).not.toContain('opacity-50');
      expect(screen.getByText('the merge').className).toContain('opacity-50');
    } finally {
      vi.useRealTimers();
    }
  });
});
