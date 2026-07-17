/**
 * @vitest-environment happy-dom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommitSelectionProvider,
  useCommitSelection,
} from '#renderer/modules/commits/CommitSelectionContext';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { AppShell } from './AppShell';
import { Inspector } from './Inspector';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

vi.stubGlobal('desktop', { platform: 'linux' });

/** Re-stub window.git before each test, mirroring RepoRail.test.tsx's `stubGit`. */
function stubGit() {
  vi.stubGlobal('git', {
    status: vi.fn().mockResolvedValue({ branch: 'main', ahead: 0, behind: 0, entries: [] }),
    // AppShell now subscribes via useLiveStatus (issue #64) — stub the unsubscribe function.
    watchStatus: vi.fn().mockReturnValue(() => {}),
    listBranches: vi
      .fn()
      .mockResolvedValue({ branches: [], head: { _tag: 'OnBranch', branch: 'main' } }),
    createBranch: vi.fn().mockResolvedValue(undefined),
    switchBranch: vi.fn().mockResolvedValue(undefined),
    listCommits: vi.fn().mockResolvedValue([]),
    commitDetail: vi.fn().mockResolvedValue({
      sha: 'deadbeef123',
      author: { name: 'Test', email: 'test@test.com' },
      date: Date.now(),
      message: 'test commit',
      changes: [],
    }),
    openRepository: vi.fn().mockResolvedValue('/repo'),
    listRecentRepositories: vi.fn().mockResolvedValue([]),
    removeRecentRepository: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => stubGit());

vi.mock('#renderer/modules/repository/hooks/useReopenLastRepository', () => ({
  useReopenLastRepository: () => ({ isRestoring: false }),
}));

function RootSetter({ root }: { root: string | null }) {
  const { setActiveRepository } = useActiveRepository();
  useEffect(() => {
    setActiveRepository(root);
  }, [root, setActiveRepository]);
  return null;
}

function Wrapper({ root }: { root: string | null }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveRepositoryProvider>
        <RootSetter root={root} />
        <AppShell />
      </ActiveRepositoryProvider>
    </QueryClientProvider>
  );
}

describe('Inspector visibility', () => {
  it('renders the Changes tab and Clean working tree when a Repository is open', async () => {
    render(<Wrapper root='/repo/my-project' />);
    const changesTab = await screen.findByText('Changes');
    // The StatusBar and the Changes panel both surface "Clean working tree" (both read the shared
    // `status` collection now), so scope this to the Inspector's own panel.
    const inspector = changesTab.closest('aside') as HTMLElement;
    expect(await within(inspector).findByText('Clean working tree')).toBeTruthy();
  });

  it('does not render on EmptyState (no repo open)', () => {
    render(<Wrapper root={null} />);
    expect(screen.queryByText('Changes')).toBeNull();
  });

  it('renders a disabled Tree tab', async () => {
    render(<Wrapper root='/repo/my-project' />);
    const treeTab = await screen.findByRole('tab', { name: 'Tree' });
    // Base UI's Tab keeps a disabled tab focusable-but-inert (`focusableWhenDisabled`), so it
    // marks `aria-disabled`/`data-disabled` rather than the native `disabled` attribute.
    expect(treeTab.getAttribute('aria-disabled')).toBe('true');
  });

  // Regression: staging from the Changes panel invalidates `['status', root]`, and the StatusBar
  // reads that SAME collection. If a consumer ever re-introduces a competing plain
  // `useQuery(['status', …])` (different result shape), the collection's refetch throws
  // "queryFn must return an array of objects" and the panel never refreshes. This drives the whole
  // shell (StatusBar + Changes panel) to catch that.
  it('stages a file from the Changes panel and refreshes without a status query collision', async () => {
    let staged = false;
    vi.stubGlobal('git', {
      status: vi.fn(() =>
        Promise.resolve({
          branch: 'main',
          ahead: 0,
          behind: 0,
          entries: staged
            ? [{ path: 'a.txt', staged: { kind: 'modified' } }]
            : [{ path: 'a.txt', unstaged: { kind: 'modified' } }],
        }),
      ),
      watchStatus: vi.fn().mockReturnValue(() => {}),
      stageFile: vi.fn(() => {
        staged = true;
        return Promise.resolve();
      }),
      unstageFile: vi.fn(() => Promise.resolve()),
      stageAll: vi.fn(() => Promise.resolve()),
      unstageAll: vi.fn(() => Promise.resolve()),
      listBranches: vi
        .fn()
        .mockResolvedValue({ branches: [], head: { _tag: 'OnBranch', branch: 'main' } }),
      listCommits: vi.fn().mockResolvedValue([]),
    });

    render(<Wrapper root='/repo/my-project' />);

    const checkbox = await screen.findByRole('button', { name: 'Stage a.txt' });
    fireEvent.click(checkbox);

    // The invalidation-driven refetch must succeed: the row moves to Staged, so its toggle now reads
    // "Unstage a.txt". Under the old query-key collision the collection would throw on refetch and
    // this checkbox would never appear (the panel would show its error state instead).
    expect(await screen.findByRole('button', { name: 'Unstage a.txt' })).toBeTruthy();
  });
});

/**
 * Drives the graph selection directly so the Inspector's Changes ⇄ Commit-detail split can be
 * tested without clicking through the virtualized graph. Mounts `<Inspector/>` beside the buttons,
 * under the same provider tree the app uses.
 */
function ModeHarness() {
  const { select } = useCommitSelection();
  return (
    <div>
      <button type='button' onClick={() => select({ kind: 'commit', sha: 'deadbeef123' })}>
        pick-commit
      </button>
      <button type='button' onClick={() => select({ kind: 'workingTree' })}>
        pick-working-tree
      </button>
      <button type='button' onClick={() => select(null)}>
        clear
      </button>
      <Inspector />
    </div>
  );
}

function ModeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveRepositoryProvider>
        <RootSetter root='/repo' />
        <CommitSelectionProvider>
          <ModeHarness />
        </CommitSelectionProvider>
      </ActiveRepositoryProvider>
    </QueryClientProvider>
  );
}

describe('Inspector mode switch', () => {
  it('shows Changes for no selection / Working tree, and Commit detail for a Commit', async () => {
    render(<ModeWrapper />);

    // No selection → Changes mode (tabs + the clean-tree state from the stubbed status).
    expect(await screen.findByText('Changes')).toBeTruthy();
    expect(await screen.findByText('Clean working tree')).toBeTruthy();

    // Commit selected → Commit detail (the short SHA), and the tabs are gone.
    fireEvent.click(screen.getByText('pick-commit'));
    expect(await screen.findByText('deadbee')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull();

    // Working-tree selection is equivalent to no selection for the Inspector — back to Changes.
    fireEvent.click(screen.getByText('pick-working-tree'));
    expect(await screen.findByRole('tab', { name: 'Changes' })).toBeTruthy();
    expect(screen.queryByText('deadbee')).toBeNull();

    // Clearing the selection stays in Changes mode.
    fireEvent.click(screen.getByText('clear'));
    expect(await screen.findByRole('tab', { name: 'Changes' })).toBeTruthy();
  });
});

describe('Inspector resize', () => {
  it('resizes the panel via the separator and persists the width', async () => {
    render(<Wrapper root='/repo/my-project' />);
    const changesTab = await screen.findByText('Changes');
    const inspector = changesTab.closest('aside') as HTMLElement;
    const separator = within(inspector).getByRole('separator');
    expect(inspector.style.width).toBe('288px'); // default

    // ArrowRight on a right-side column shrinks it (dragging left grows it — reversed sign).
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(inspector.style.width).toBe('280px');
    expect(localStorage.getItem('gitoui:inspector-width')).toBe('280');

    fireEvent.doubleClick(separator);
    expect(inspector.style.width).toBe('288px');
  });

  it('restores a previously persisted width on mount', async () => {
    localStorage.setItem('gitoui:inspector-width', '340');
    render(<Wrapper root='/repo/my-project' />);
    const changesTab = await screen.findByText('Changes');
    const inspector = changesTab.closest('aside') as HTMLElement;
    expect(inspector.style.width).toBe('340px');
  });
});
