/**
 * @vitest-environment happy-dom
 */

import type { BranchList } from '@gitoui/contracts/git';
import { Toaster, ToastProvider } from '@gitoui/ui/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionProvider } from '#renderer/core/shell/SelectionContext';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { BranchesSection } from './BranchesSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.stubGlobal('desktop', { platform: 'linux' });

function makeBranchList(partial: Partial<BranchList> = {}): BranchList {
  return {
    branches: [],
    head: { _tag: 'OnBranch', branch: 'main' },
    ...partial,
  };
}

function RootSetter({ root }: { root: string }) {
  const { setActiveRepository } = useActiveRepository();
  useEffect(() => {
    setActiveRepository(root);
  }, [root, setActiveRepository]);
  return null;
}

function Wrapper({
  root = '/repo',
  filter = '',
  viewMode,
  listBranchesMock,
  switchBranchMock,
}: {
  root?: string;
  filter?: string;
  viewMode?: 'flat' | 'tree';
  listBranchesMock: () => Promise<BranchList>;
  switchBranchMock?: () => Promise<void>;
}) {
  vi.stubGlobal('git', {
    listBranches: vi.fn(listBranchesMock),
    switchBranch: vi.fn(switchBranchMock ?? (() => Promise.resolve())),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ActiveRepositoryProvider>
          <RootSetter root={root} />
          <SelectionProvider>
            <BranchesSection filter={filter} viewMode={viewMode} />
          </SelectionProvider>
        </ActiveRepositoryProvider>
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>
  );
}

// --- Ground-truth tests (pin) ---

describe('BranchesSection sort', () => {
  it('pins current branch to top and sorts the rest alpha', async () => {
    const branches = [
      { name: 'main', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'redis-cache', isCurrent: true, ahead: 0, behind: 0 },
      { name: 'feature/x', isCurrent: false, ahead: 0, behind: 0 },
    ];
    render(
      <Wrapper
        listBranchesMock={() =>
          Promise.resolve(
            makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'redis-cache' } }),
          )
        }
      />,
    );
    // Wait for data to load (the first row appears once the skeleton is gone).
    await screen.findByText('redis-cache');
    const items = screen.getAllByRole('option');
    expect(items.map((li) => li.textContent?.trim())).toEqual(['redis-cache', 'feature/x', 'main']);
  });
});

describe('BranchesSection filter', () => {
  it('narrows to branches matching the filter substring (case-insensitive)', async () => {
    const branches = [
      { name: 'main', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'redis-cache', isCurrent: true, ahead: 0, behind: 0 },
      { name: 'feature/x', isCurrent: false, ahead: 0, behind: 0 },
    ];
    // The rail owns the filter input; the section receives the term as a prop. Upper-case `FEA`
    // pins the case-insensitive match.
    render(
      <Wrapper
        filter='FEA'
        listBranchesMock={() =>
          Promise.resolve(
            makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'redis-cache' } }),
          )
        }
      />,
    );
    await screen.findByText('feature/x');
    const items = screen.getAllByRole('option');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent?.trim()).toBe('feature/x');
  });
});

describe('BranchesSection tree mode', () => {
  it('filter shows only the matching leaf plus its ancestor folders, auto-expanded', async () => {
    const branches = [
      { name: 'main', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'feature/auth/login', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'feature/auth/logout', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'feature/pay-fallback', isCurrent: false, ahead: 0, behind: 0 },
    ];
    render(
      <Wrapper
        viewMode='tree'
        filter='logout'
        listBranchesMock={() =>
          Promise.resolve(makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'main' } }))
        }
      />,
    );

    // Only the matching branch survives the filter, rendered as one leaf showing its segment.
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent?.trim()).toBe('logout');

    // Its two ancestor folders (feature/ then auth/) are shown and auto-expanded; the non-matching
    // siblings ('main', 'feature/pay-fallback', 'feature/auth/login') are hidden. Scope to the
    // disclosure buttons (they carry aria-expanded) so the per-row Switch buttons don't count.
    const folders = screen.getAllByRole('button', { expanded: true });
    expect(folders).toHaveLength(2);
    for (const folder of folders) {
      expect(folder.getAttribute('aria-expanded')).toBe('true');
    }
    expect(screen.queryByText('login')).toBeNull();
    expect(screen.queryByText('main')).toBeNull();
    expect(screen.queryByText('pay-fallback')).toBeNull();
  });
});

describe('BranchesSection tree mode — current group', () => {
  it('collapses a folder that holds the current branch and marks it so the group stays findable', async () => {
    const branches = [
      { name: 'main', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'feat/8-shell', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'feat/25-tree', isCurrent: true, ahead: 0, behind: 0 },
    ];
    render(
      <Wrapper
        viewMode='tree'
        listBranchesMock={() =>
          Promise.resolve(
            makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'feat/25-tree' } }),
          )
        }
      />,
    );

    // On load the feat/ group is open, the current branch is visible (and floated to the top), and
    // the group is NOT marked (no need — the current row is on screen).
    await screen.findByText('25-tree');
    // The folder disclosure button is the expandable one; per-row Switch buttons carry no
    // aria-expanded, so scope to it.
    const featFolder = screen.getByRole('button', { expanded: true });
    expect(featFolder.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByTitle(/contains the current branch/i)).toBeNull();

    // Collapsing is allowed even though the group holds the current branch.
    fireEvent.click(featFolder);
    expect(featFolder.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('25-tree')).toBeNull();
    expect(screen.queryByText('8-shell')).toBeNull();

    // The collapsed folder is now marked as the current group.
    expect(screen.getByTitle(/contains the current branch/i)).toBe(featFolder);
  });
});

describe('BranchesSection detached HEAD', () => {
  it('shows detached banner with sha7 and no current marker', async () => {
    const branches = [
      { name: 'main', isCurrent: false, ahead: 0, behind: 0 },
      { name: 'feature/x', isCurrent: false, ahead: 0, behind: 0 },
    ];
    render(
      <Wrapper
        listBranchesMock={() =>
          Promise.resolve(
            makeBranchList({ branches, head: { _tag: 'Detached', sha: 'abc1234def' } }),
          )
        }
      />,
    );
    // Banner shows sha truncated to 7 chars.
    expect(await screen.findByText('detached @ abc1234')).toBeTruthy();
    // No row is marked current (no aria-current="true").
    const items = screen.getAllByRole('option');
    for (const item of items) {
      expect(item.getAttribute('aria-current')).toBeNull();
    }
  });
});

describe('BranchesSection states', () => {
  it('shows skeleton rows while loading', () => {
    // Never resolves — stays in pending state.
    render(<Wrapper listBranchesMock={() => new Promise(() => {})} />);
    // Skeleton list is aria-busy and labeled.
    expect(screen.getByRole('list', { name: /loading branches/i, hidden: false })).toBeTruthy();
  });

  it('shows an empty hint when the repo has no branches', async () => {
    render(<Wrapper listBranchesMock={() => Promise.resolve(makeBranchList({ branches: [] }))} />);
    expect(await screen.findByText(/no branches yet/i)).toBeTruthy();
  });

  it('shows an error message on RepoNotFoundError', async () => {
    render(
      <Wrapper
        listBranchesMock={() => Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' })}
      />,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/repository not found/i);
  });
});

describe('BranchesSection AheadBehindBadge', () => {
  it('shows ahead/behind badge when upstream is set with non-zero counts', async () => {
    const branches = [
      { name: 'feature', isCurrent: true, upstream: 'origin/feature', ahead: 2, behind: 1 },
    ];
    render(
      <Wrapper
        listBranchesMock={() =>
          Promise.resolve(
            makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'feature' } }),
          )
        }
      />,
    );
    await screen.findByRole('option');
    expect(screen.getByText('↑2')).toBeTruthy();
    expect(screen.getByText('↓1')).toBeTruthy();
  });

  it('does not show badge when no upstream', async () => {
    const branches = [{ name: 'feature', isCurrent: true, ahead: 2, behind: 1 }];
    render(
      <Wrapper
        listBranchesMock={() =>
          Promise.resolve(
            makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'feature' } }),
          )
        }
      />,
    );
    await screen.findByRole('option');
    expect(screen.queryByText('↑2')).toBeNull();
  });
});

// --- Ground-truth tests: select/switch interactions (issue #24) ---

/**
 * Wrapper with ToastProvider + SelectionProvider for interaction tests.
 * switchBranchMock lets individual tests inject a failing IPC stub.
 */
function InteractionWrapper({
  root = '/repo',
  filter = '',
  listBranchesMock,
  switchBranchMock,
}: {
  root?: string;
  filter?: string;
  listBranchesMock: () => Promise<BranchList>;
  switchBranchMock?: () => Promise<void>;
}) {
  vi.stubGlobal('git', {
    listBranches: vi.fn(listBranchesMock),
    switchBranch: vi.fn(switchBranchMock ?? (() => Promise.resolve())),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ActiveRepositoryProvider>
          <RootSetter root={root} />
          <SelectionProvider>
            <BranchesSection filter={filter} />
          </SelectionProvider>
        </ActiveRepositoryProvider>
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('BranchesSection select interaction', () => {
  it('single-click highlights the row as selected (aria-selected=true)', async () => {
    const branches = [
      { name: 'main', isCurrent: true, ahead: 0, behind: 0 },
      { name: 'feature/login', isCurrent: false, ahead: 0, behind: 0 },
    ];
    render(
      <InteractionWrapper
        listBranchesMock={() =>
          Promise.resolve(makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'main' } }))
        }
      />,
    );
    await screen.findByText('feature/login');
    const featureRow = screen.getByText('feature/login').closest('[role="option"]') as HTMLElement;
    fireEvent.click(featureRow);
    expect(featureRow.getAttribute('aria-selected')).toBe('true');
  });

  it('double-click on the current branch does NOT call the switch mutation', async () => {
    const branches = [{ name: 'main', isCurrent: true, ahead: 0, behind: 0 }];
    const switchBranchMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal('git', {
      listBranches: vi.fn(() =>
        Promise.resolve(makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'main' } })),
      ),
      switchBranch: switchBranchMock,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ActiveRepositoryProvider>
            <RootSetter root='/repo' />
            <SelectionProvider>
              <BranchesSection filter='' />
            </SelectionProvider>
          </ActiveRepositoryProvider>
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('main');
    const mainRow = screen.getByText('main').closest('[role="option"]') as HTMLElement;
    fireEvent.doubleClick(mainRow);
    expect(switchBranchMock).not.toHaveBeenCalled();
  });

  it('switch rejecting with UncommittedChangesError surfaces a toast and does not crash', async () => {
    const branches = [
      { name: 'main', isCurrent: true, ahead: 0, behind: 0 },
      { name: 'feature/login', isCurrent: false, ahead: 0, behind: 0 },
    ];
    render(
      <InteractionWrapper
        listBranchesMock={() =>
          Promise.resolve(makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'main' } }))
        }
        switchBranchMock={() => Promise.reject({ _tag: 'UncommittedChangesError' })}
      />,
    );
    await screen.findByText('feature/login');
    const featureRow = screen.getByText('feature/login').closest('[role="option"]') as HTMLElement;
    fireEvent.doubleClick(featureRow);
    // Wait for the toast to appear with the uncommitted-changes message.
    expect(await screen.findByText(/working tree has uncommitted changes/i)).toBeTruthy();
  });
});

describe('BranchesSection selection reset', () => {
  it('selection resets to null when the active repo root changes', async () => {
    // The SelectionProvider resets selectedRef via useEffect when root changes.
    // We verify this by selecting a row, then switching the active repo root, and
    // confirming the fresh query for the row shows aria-selected=false.
    const branches = [{ name: 'main', isCurrent: true, ahead: 0, behind: 0 }];
    vi.stubGlobal('git', {
      listBranches: vi.fn(() =>
        Promise.resolve(makeBranchList({ branches, head: { _tag: 'OnBranch', branch: 'main' } })),
      ),
      switchBranch: vi.fn(() => Promise.resolve()),
    });

    // Component that exposes a button to change the active repo.
    function RepoSwitcher() {
      const { setActiveRepository } = useActiveRepository();
      return (
        <button type='button' onClick={() => setActiveRepository('/repo2')}>
          switch repo
        </button>
      );
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ActiveRepositoryProvider>
            <RootSetter root='/repo' />
            <SelectionProvider>
              <RepoSwitcher />
              <BranchesSection filter='' />
            </SelectionProvider>
          </ActiveRepositoryProvider>
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // Select the branch first.
    await screen.findByText('main');
    const mainRow = screen.getByText('main').closest('[role="option"]') as HTMLElement;
    fireEvent.click(mainRow);
    expect(mainRow.getAttribute('aria-selected')).toBe('true');

    // Switch repos — triggers SelectionProvider useEffect → selectedRef resets to null.
    fireEvent.click(screen.getByRole('button', { name: /switch repo/i }));

    // Re-query after the update — the same DOM element should now show aria-selected=false.
    await waitFor(() => {
      const updatedRow = screen.getByText('main').closest('[role="option"]') as HTMLElement;
      expect(updatedRow.getAttribute('aria-selected')).toBe('false');
    });
  });
});
