/**
 * @vitest-environment happy-dom
 */

import type { Status, StatusEntry } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { ChangesPanel } from './ChangesPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.stubGlobal('desktop', { platform: 'linux' });

function makeStatus(partial: Partial<Status> = {}): Status {
  return { branch: 'main', ahead: 0, behind: 0, entries: [], ...partial };
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
  statusMock,
}: {
  root?: string;
  statusMock: () => Promise<Status>;
}) {
  vi.stubGlobal('git', { status: vi.fn(statusMock) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveRepositoryProvider>
        <RootSetter root={root} />
        <ChangesPanel />
      </ActiveRepositoryProvider>
    </QueryClientProvider>
  );
}

describe('ChangesPanel states', () => {
  it('shows skeleton rows while loading', () => {
    render(<Wrapper statusMock={() => new Promise(() => {})} />);
    expect(screen.getByRole('list', { name: /loading status/i, hidden: false })).toBeTruthy();
  });

  it('shows a clean empty state when there are no entries', async () => {
    render(<Wrapper statusMock={() => Promise.resolve(makeStatus())} />);
    expect(await screen.findByText('Clean working tree')).toBeTruthy();
  });

  it('shows an inline error phrased via matchError when the query rejects', async () => {
    // See CommitGraph.test.tsx's identical note: @tanstack/db's on-demand sync layer leaks
    // *derived* unhandled promise rejections on a subset error; the error itself is handled
    // (asserted below via the rendered alert) — detach Vitest's rejection accounting for this test.
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      render(
        <Wrapper
          statusMock={() => Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' })}
        />,
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toMatch(/repository not found: \/bad\/path/i);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const listener of rejectionListeners) {
        process.on('unhandledRejection', listener);
      }
    }
  });

  it('retries and shows the entries once the retried query succeeds', async () => {
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      let hasFailed = false;
      const statusMock = vi.fn(() => {
        if (!hasFailed) {
          hasFailed = true;
          return Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' });
        }
        return Promise.resolve(
          makeStatus({ entries: [{ path: 'a.txt', unstaged: { kind: 'modified' } }] }),
        );
      });
      render(<Wrapper statusMock={statusMock} />);

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      await act(async () => {
        retryButton.click();
      });

      await screen.findByText('a.txt');
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const listener of rejectionListeners) {
        process.on('unhandledRejection', listener);
      }
    }
  });
});

describe('ChangesPanel groups', () => {
  it('renders Staged and Unstaged groups with counts, glyphs, and per-axis stats', async () => {
    const entries: StatusEntry[] = [
      {
        path: 'src/api/payment.ts',
        staged: { kind: 'modified', additions: 24, deletions: 6 },
      },
      {
        path: 'src/api/fallback.ts',
        staged: { kind: 'added', additions: 58 },
      },
      {
        path: 'src/utils/retry.ts',
        unstaged: { kind: 'modified', additions: 8, deletions: 3 },
      },
      {
        path: 'src/legacy/old-fallback.ts',
        unstaged: { kind: 'deleted', deletions: 41 },
      },
    ];
    render(<Wrapper statusMock={() => Promise.resolve(makeStatus({ entries }))} />);

    expect(await screen.findByText('STAGED')).toBeTruthy();
    expect(screen.getByText('UNSTAGED')).toBeTruthy();

    const stagedGroup = screen.getByRole('listbox', { name: 'STAGED' });
    const unstagedGroup = screen.getByRole('listbox', { name: 'UNSTAGED' });
    expect(stagedGroup.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(unstagedGroup.querySelectorAll('[role="option"]')).toHaveLength(2);

    // Glyph mapping + per-axis stats.
    expect(screen.getByText('payment.ts')).toBeTruthy();
    expect(screen.getByText('+24')).toBeTruthy();
    expect(screen.getByText('−6')).toBeTruthy();
    expect(screen.getByText('+58')).toBeTruthy();
    expect(screen.getByText('−41')).toBeTruthy();
  });

  it('renders a path staged AND unstaged in both groups with its own axis stats', async () => {
    const entries: StatusEntry[] = [
      {
        path: 'a.txt',
        staged: { kind: 'modified', additions: 3, deletions: 1 },
        unstaged: { kind: 'modified', additions: 5, deletions: 2 },
      },
    ];
    render(<Wrapper statusMock={() => Promise.resolve(makeStatus({ entries }))} />);

    const rows = await screen.findAllByText('a.txt');
    expect(rows).toHaveLength(2);

    const stagedGroup = screen.getByRole('listbox', { name: 'STAGED' });
    const unstagedGroup = screen.getByRole('listbox', { name: 'UNSTAGED' });
    expect(stagedGroup.textContent).toMatch(/\+3/);
    expect(stagedGroup.textContent).toMatch(/−1/);
    expect(unstagedGroup.textContent).toMatch(/\+5/);
    expect(unstagedGroup.textContent).toMatch(/−2/);
  });

  it('omits a zero axis and tints the added/deleted glyphs', async () => {
    const entries: StatusEntry[] = [
      { path: 'src/added.ts', staged: { kind: 'added', additions: 12, deletions: 0 } },
      { path: 'src/removed.ts', unstaged: { kind: 'deleted', additions: 0, deletions: 7 } },
    ];
    render(<Wrapper statusMock={() => Promise.resolve(makeStatus({ entries }))} />);

    await screen.findByText('added.ts');
    // A one-sided change shows only its moved axis — no `+0` / `−0` noise.
    expect(screen.getByText('+12')).toBeTruthy();
    expect(screen.getByText('−7')).toBeTruthy();
    expect(screen.queryByText('−0')).toBeNull();
    expect(screen.queryByText('+0')).toBeNull();

    // The glyph square carries its kind and the semantic tint (color spent on the add/delete case).
    const addedGlyph = screen
      .getByText('added.ts')
      .closest('[role="option"]')
      ?.querySelector('[data-kind]');
    expect(addedGlyph?.getAttribute('data-kind')).toBe('added');
    expect(addedGlyph?.className).toContain('text-success');
    const removedGlyph = screen
      .getByText('removed.ts')
      .closest('[role="option"]')
      ?.querySelector('[data-kind]');
    expect(removedGlyph?.getAttribute('data-kind')).toBe('deleted');
    expect(removedGlyph?.className).toContain('text-destructive');
  });

  it('omits stats for untracked and binary entries', async () => {
    const entries: StatusEntry[] = [
      { path: 'new-file.ts', unstaged: { kind: 'untracked' } },
      { path: 'image.png', staged: { kind: 'added' } },
    ];
    render(<Wrapper statusMock={() => Promise.resolve(makeStatus({ entries }))} />);

    await screen.findByText('new-file.ts');
    expect(screen.queryByText(/^\+/)).toBeNull();
    expect(screen.queryByText(/^−/)).toBeNull();
  });
});
