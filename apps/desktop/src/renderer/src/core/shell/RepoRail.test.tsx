/**
 * @vitest-environment happy-dom
 */

import type { BranchList } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { AppShell } from './AppShell';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Stub out window.desktop and window.git — injected by the preload in Electron, absent in tests.
vi.stubGlobal('desktop', { platform: 'linux' });

/** Re-stub window.git before each test so a test can override `listBranches` without leaking. */
function stubGit(listBranches?: () => Promise<BranchList>) {
  vi.stubGlobal('git', {
    status: vi.fn().mockResolvedValue({ branch: 'main', ahead: 0, behind: 0, entries: [] }),
    listBranches:
      listBranches !== undefined
        ? vi.fn(listBranches)
        : vi.fn().mockResolvedValue({ branches: [], head: { _tag: 'OnBranch', branch: 'main' } }),
    createBranch: vi.fn().mockResolvedValue(undefined),
    switchBranch: vi.fn().mockResolvedValue(undefined),
    openRepository: vi.fn().mockResolvedValue('/repo'),
    listRecentRepositories: vi.fn().mockResolvedValue([]),
    removeRecentRepository: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => stubGit());

// Stub useReopenLastRepository so AppShell does not fire IPC calls on mount.
vi.mock('#renderer/modules/repository/hooks/useReopenLastRepository', () => ({
  useReopenLastRepository: () => ({ isRestoring: false }),
}));

/** Sets the active repository root synchronously via context before the tree renders. */
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

describe('RepoRail visibility', () => {
  it('renders the rail with a Branches section when a Repository is open', async () => {
    render(<Wrapper root='/repo/my-project' />);
    // Wait for the useEffect to fire and re-render with the root set.
    expect(await screen.findByText('Branches')).toBeTruthy();
  });

  it('does not render the rail on EmptyState (no repo open)', () => {
    render(<Wrapper root={null} />);
    expect(screen.queryByText('Branches')).toBeNull();
  });
});

describe('RepoRail resize', () => {
  it('resizes the rail via the separator and persists the width', async () => {
    render(<Wrapper root='/repo/my-project' />);
    await screen.findByText('Branches');

    const separator = screen.getByRole('separator');
    const rail = separator.closest('aside') as HTMLElement;
    expect(rail.style.width).toBe('256px'); // default

    // ArrowLeft on a left-side rail shrinks it by 8px; the width persists to localStorage.
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(rail.style.width).toBe('248px');
    expect(localStorage.getItem('gitoui:rail-width')).toBe('248');

    // Shift = coarse step (32px).
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
    expect(rail.style.width).toBe('280px');

    // Double-click restores the default.
    fireEvent.doubleClick(separator);
    expect(rail.style.width).toBe('256px');
  });

  it('restores a previously persisted width on mount', async () => {
    localStorage.setItem('gitoui:rail-width', '320');
    render(<Wrapper root='/repo/my-project' />);
    await screen.findByText('Branches');
    const rail = screen.getByRole('separator').closest('aside') as HTMLElement;
    expect(rail.style.width).toBe('320px');
  });
});

describe('RepoRail global filter', () => {
  it('narrows the branch list as the user types in the rail-level filter', async () => {
    stubGit(() =>
      Promise.resolve({
        branches: [
          { name: 'main', isCurrent: true, ahead: 0, behind: 0 },
          { name: 'feature/login', isCurrent: false, ahead: 0, behind: 0 },
        ],
        head: { _tag: 'OnBranch', branch: 'main' },
      }),
    );
    render(<Wrapper root='/repo/my-project' />);

    // Scope to the rail so the top-bar Branch selector (also a "main") never confuses the query.
    const rail = (await screen.findByText('Branches')).closest('aside') as HTMLElement;
    // Default view is tree: 'main' is a top-level leaf; 'feature/login' nests under a 'feature/'
    // folder and its leaf reads as just its segment, 'login'.
    expect(await within(rail).findByText('login')).toBeTruthy();
    expect(within(rail).getByText('main')).toBeTruthy();

    const filter = within(rail).getByRole('textbox', { name: /filter branches/i });
    fireEvent.change(filter, { target: { value: 'feat' } });

    // 'feature/login' matches 'feat' on its full name, so its leaf + folder stay; 'main' drops out.
    expect(within(rail).getByText('login')).toBeTruthy();
    expect(within(rail).queryByText('main')).toBeNull();
  });
});

describe('RepoRail branches view-mode toggle', () => {
  it('defaults to tree, toggles to flat, persists to localStorage, and survives a remount', async () => {
    render(<Wrapper root='/repo/my-project' />);
    await screen.findByText('Branches');

    // Nothing persisted yet → default is tree, so the control offers to switch to flat.
    expect(localStorage.getItem('gitoui:rail-view-mode')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /switch to flat list view/i }));

    // Now flat: the new mode is written and the control flips to offer tree.
    expect(localStorage.getItem('gitoui:rail-view-mode')).toBe('flat');
    expect(screen.getByRole('button', { name: /switch to tree view/i })).toBeTruthy();

    // A fresh instance reads localStorage on mount and stays in flat mode.
    cleanup();
    render(<Wrapper root='/repo/my-project' />);
    await screen.findByText('Branches');
    expect(screen.getByRole('button', { name: /switch to tree view/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /switch to flat list view/i })).toBeNull();
  });
});
