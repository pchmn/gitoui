/**
 * @vitest-environment happy-dom
 */

import type { Status, StatusEntry } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { ChangesPanel } from './ChangesPanel';

// Spy on the Toast surface so staging-error tests can assert what the user is shown.
const { mockToastAdd } = vi.hoisted(() => ({ mockToastAdd: vi.fn() }));
vi.mock('@gitoui/ui/toast', () => ({ toast: { add: mockToastAdd } }));

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

type StagingMock = ReturnType<typeof vi.fn>;

function Wrapper({
  root = '/repo',
  statusMock,
  git: gitExtra,
}: {
  root?: string;
  statusMock: () => Promise<Status>;
  git?: Partial<Record<'stageFile' | 'unstageFile' | 'stageAll' | 'unstageAll', StagingMock>>;
}) {
  vi.stubGlobal('git', {
    status: vi.fn(statusMock),
    stageFile: gitExtra?.stageFile ?? vi.fn(() => Promise.resolve()),
    unstageFile: gitExtra?.unstageFile ?? vi.fn(() => Promise.resolve()),
    stageAll: gitExtra?.stageAll ?? vi.fn(() => Promise.resolve()),
    unstageAll: gitExtra?.unstageAll ?? vi.fn(() => Promise.resolve()),
  });
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

    // The status letter carries its kind and the Pierre-palette tint (green add, red delete).
    const addedGlyph = screen
      .getByText('added.ts')
      .closest('[role="option"]')
      ?.querySelector('[data-kind]');
    expect(addedGlyph?.getAttribute('data-kind')).toBe('added');
    expect(addedGlyph?.className).toContain('text-git-added');
    const removedGlyph = screen
      .getByText('removed.ts')
      .closest('[role="option"]')
      ?.querySelector('[data-kind]');
    expect(removedGlyph?.getAttribute('data-kind')).toBe('deleted');
    expect(removedGlyph?.className).toContain('text-git-deleted');
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

describe('ChangesPanel staging', () => {
  it('stages an unstaged file when its checkbox is ticked, then refreshes', async () => {
    let staged = false;
    const statusMock = vi.fn(() =>
      Promise.resolve(
        makeStatus({
          entries: staged
            ? [{ path: 'a.txt', staged: { kind: 'modified' } }]
            : [{ path: 'a.txt', unstaged: { kind: 'modified' } }],
        }),
      ),
    );
    // Staging flips the fixture so the invalidated `status` refetch shows the moved row.
    const stageFile = vi.fn(() => {
      staged = true;
      return Promise.resolve();
    });

    render(<Wrapper statusMock={statusMock} git={{ stageFile }} />);

    const checkbox = await screen.findByRole('button', { name: 'Stage a.txt' });
    await act(async () => {
      checkbox.click();
    });

    expect(stageFile).toHaveBeenCalledWith({ repoPath: '/repo', path: 'a.txt' });
    // The list refreshes: a.txt now sits in the Staged group, so its toggle reads "Unstage a.txt".
    await screen.findByRole('button', { name: 'Unstage a.txt' });
  });

  it('unstages a staged file when its checkbox is unticked', async () => {
    const unstageFile = vi.fn(() => Promise.resolve());
    render(
      <Wrapper
        statusMock={() =>
          Promise.resolve(
            makeStatus({ entries: [{ path: 'a.txt', staged: { kind: 'modified' } }] }),
          )
        }
        git={{ unstageFile }}
      />,
    );

    const checkbox = await screen.findByRole('button', { name: 'Unstage a.txt' });
    await act(async () => {
      checkbox.click();
    });

    expect(unstageFile).toHaveBeenCalledWith({ repoPath: '/repo', path: 'a.txt' });
  });

  it('stages everything when Stage all is clicked', async () => {
    const stageAll = vi.fn(() => Promise.resolve());
    render(
      <Wrapper
        statusMock={() =>
          Promise.resolve(
            makeStatus({ entries: [{ path: 'a.txt', unstaged: { kind: 'modified' } }] }),
          )
        }
        git={{ stageAll }}
      />,
    );

    // Exact name so "Stage all" doesn't also match the "Unstage all" header action.
    const button = await screen.findByRole('button', { name: 'Stage all' });
    await act(async () => {
      button.click();
    });

    expect(stageAll).toHaveBeenCalledWith({ repoPath: '/repo' });
  });

  it('unstages everything when Unstage all is clicked', async () => {
    const unstageAll = vi.fn(() => Promise.resolve());
    render(
      <Wrapper
        statusMock={() =>
          Promise.resolve(
            makeStatus({ entries: [{ path: 'a.txt', staged: { kind: 'modified' } }] }),
          )
        }
        git={{ unstageAll }}
      />,
    );

    const button = await screen.findByRole('button', { name: 'Unstage all' });
    await act(async () => {
      button.click();
    });

    expect(unstageAll).toHaveBeenCalledWith({ repoPath: '/repo' });
  });

  it('optimistically moves the row to Staged before the git call resolves', async () => {
    // `stageFile` never resolves, so `onSettled`/reconcile can't fire — if the row moves to Staged,
    // it can ONLY be the optimistic `onMutate` write, not a status refetch.
    const stageFile = vi.fn(() => new Promise<void>(() => {}));
    render(
      <Wrapper
        statusMock={() =>
          Promise.resolve(
            makeStatus({ entries: [{ path: 'a.txt', unstaged: { kind: 'modified' } }] }),
          )
        }
        git={{ stageFile }}
      />,
    );

    const checkbox = await screen.findByRole('button', { name: 'Stage a.txt' });
    await act(async () => {
      checkbox.click();
    });

    // Instant optimistic move: the row is now in the Staged group (toggle reads "Unstage a.txt").
    expect(await screen.findByRole('button', { name: 'Unstage a.txt' })).toBeTruthy();
    expect(stageFile).toHaveBeenCalledWith({ repoPath: '/repo', path: 'a.txt' });
  });

  it("toasts git's own message (not a misleading catch-all) when staging fails", async () => {
    mockToastAdd.mockClear();
    const gitMessage = "fatal: pathspec '.claude/worktrees/agent-x' did not match any files";
    const stageFile = vi.fn(() => Promise.reject({ _tag: 'GitCommandError', message: gitMessage }));
    render(
      <Wrapper
        statusMock={() =>
          Promise.resolve(
            makeStatus({ entries: [{ path: 'a.txt', unstaged: { kind: 'modified' } }] }),
          )
        }
        git={{ stageFile }}
      />,
    );

    const checkbox = await screen.findByRole('button', { name: 'Stage a.txt' });
    await act(async () => {
      checkbox.click();
    });

    await waitFor(() =>
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: gitMessage }),
      ),
    );
  });
});
