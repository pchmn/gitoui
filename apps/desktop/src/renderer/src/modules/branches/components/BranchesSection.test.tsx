/**
 * @vitest-environment happy-dom
 */

import type { BranchList } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  listBranchesMock,
}: {
  root?: string;
  filter?: string;
  listBranchesMock: () => Promise<BranchList>;
}) {
  vi.stubGlobal('git', { listBranches: vi.fn(listBranchesMock) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveRepositoryProvider>
        <RootSetter root={root} />
        <BranchesSection filter={filter} />
      </ActiveRepositoryProvider>
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
    const items = screen.getAllByRole('listitem');
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
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent?.trim()).toBe('feature/x');
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
    const items = screen.getAllByRole('listitem');
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
    await screen.findByRole('listitem');
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
    await screen.findByRole('listitem');
    expect(screen.queryByText('↑2')).toBeNull();
  });
});
