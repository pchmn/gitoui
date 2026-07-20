/**
 * @vitest-environment happy-dom
 */

import type { Diff, Status, StatusEntry } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangesPanel } from '#renderer/modules/changes/components/ChangesPanel';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { CenterViewProvider, useCenterView } from '../CenterViewContext';
import { CodeDiffView } from './CodeDiffView';

// The library internals aren't ours to test (epic's testing decision) — only our wiring (the props
// we hand `DiffBody`). Mocking it here also sidesteps the real `@pierre/diffs` package needing a
// worker/canvas-capable DOM.
vi.mock('./DiffBody', () => ({
  DiffBody: ({ path, diffStyle }: { path: string; diffStyle: string }) => (
    <pre data-testid='diff-body' data-diffstyle={diffStyle} data-path={path} />
  ),
  // ChangesPanel pulls the hover-prefetch primer from the same module — inert here.
  useDiffPrimer: () => () => {},
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

vi.stubGlobal('desktop', { platform: 'linux' });

function makeStatus(partial: Partial<Status> = {}): Status {
  return { branch: 'main', ahead: 0, behind: 0, entries: [], ...partial };
}

function makeDiff(partial: Partial<Diff> = {}): Diff {
  return {
    patch: 'diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-a\n+b\n',
    oldContent: 'a\n',
    newContent: 'b\n',
    binary: false,
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

/** Mirrors `AppShell`'s own center swap (`CenterArea`) without pulling in the whole shell. */
function CenterArea() {
  const { file } = useCenterView();
  return file !== null ? <CodeDiffView /> : <div data-testid='graph'>graph</div>;
}

function Wrapper({
  root = '/repo',
  entries = [],
  diffMock = vi.fn(() => Promise.resolve(makeDiff())),
  statusMock,
  git: gitExtra,
}: {
  root?: string;
  entries?: StatusEntry[];
  diffMock?: ReturnType<typeof vi.fn>;
  statusMock?: () => Promise<Status>;
  git?: Partial<
    Record<'stageFile' | 'unstageFile' | 'stageAll' | 'unstageAll', ReturnType<typeof vi.fn>>
  >;
}) {
  vi.stubGlobal('git', {
    status: vi.fn(statusMock ?? (() => Promise.resolve(makeStatus({ entries })))),
    diff: diffMock,
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
        <CenterViewProvider>
          <CenterArea />
          <ChangesPanel />
        </CenterViewProvider>
      </ActiveRepositoryProvider>
    </QueryClientProvider>
  );
}

describe('Code & Diff view wiring', () => {
  it('opens the unstaged diff with the right payload when its row is clicked', async () => {
    const diffMock = vi.fn(() => Promise.resolve(makeDiff()));
    render(
      <Wrapper
        entries={[{ path: 'src/a.txt', unstaged: { kind: 'modified' } }]}
        diffMock={diffMock}
      />,
    );

    expect(await screen.findByTestId('graph')).toBeTruthy();

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });

    await waitFor(() =>
      expect(diffMock).toHaveBeenCalledWith({
        repoPath: '/repo',
        path: 'src/a.txt',
        source: { kind: 'unstaged' },
      }),
    );
    expect(screen.queryByTestId('graph')).toBeNull();
    expect(await screen.findByTestId('diff-body')).toBeTruthy();
  });

  it('opens the staged diff (not unstaged) when the Staged row is clicked', async () => {
    const diffMock = vi.fn(() => Promise.resolve(makeDiff()));
    render(
      <Wrapper entries={[{ path: 'b.txt', staged: { kind: 'added' } }]} diffMock={diffMock} />,
    );

    const row = (await screen.findByText('b.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });

    await waitFor(() =>
      expect(diffMock).toHaveBeenCalledWith({
        repoPath: '/repo',
        path: 'b.txt',
        source: { kind: 'staged' },
      }),
    );
  });

  it('closes on the first Esc, back to the graph', async () => {
    render(<Wrapper entries={[{ path: 'a.txt', unstaged: { kind: 'modified' } }]} />);

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });
    await screen.findByTestId('diff-body');
    expect(screen.queryByTestId('graph')).toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(await screen.findByTestId('graph')).toBeTruthy();
  });

  it('toggles between unified and split layout, persisting the choice', async () => {
    render(<Wrapper entries={[{ path: 'a.txt', unstaged: { kind: 'modified' } }]} />);

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });

    expect((await screen.findByTestId('diff-body')).getAttribute('data-diffstyle')).toBe('unified');

    await act(async () => {
      screen.getByRole('button', { name: 'Split layout' }).click();
    });

    expect((await screen.findByTestId('diff-body')).getAttribute('data-diffstyle')).toBe('split');
    expect(localStorage.getItem('gitoui.diff.layout')).toBe('split');
  });

  it('restores the persisted split layout when the view opens', async () => {
    localStorage.setItem('gitoui.diff.layout', 'split');
    render(<Wrapper entries={[{ path: 'a.txt', unstaged: { kind: 'modified' } }]} />);

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });

    expect((await screen.findByTestId('diff-body')).getAttribute('data-diffstyle')).toBe('split');
  });

  it('closes via the header × button', async () => {
    render(<Wrapper entries={[{ path: 'a.txt', unstaged: { kind: 'modified' } }]} />);

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });
    await screen.findByTestId('diff-body');

    const closeButton = await screen.findByRole('button', { name: 'Close' });
    await act(async () => {
      closeButton.click();
    });

    expect(await screen.findByTestId('graph')).toBeTruthy();
  });

  it('follows the open file to the Staged axis when it is staged, keeping the diff visible', async () => {
    // Staging flips the fixture so the reconcile refetch agrees the file is now Staged-only.
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
    const stageFile = vi.fn(() => {
      staged = true;
      return Promise.resolve();
    });
    const diffMock = vi.fn(() => Promise.resolve(makeDiff()));
    render(<Wrapper statusMock={statusMock} diffMock={diffMock} git={{ stageFile }} />);

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });
    await waitFor(() =>
      expect(diffMock).toHaveBeenCalledWith({
        repoPath: '/repo',
        path: 'a.txt',
        source: { kind: 'unstaged' },
      }),
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Stage a.txt' }).click();
    });

    // The view stays (never falls back to the graph) and re-reads the file on the Staged axis.
    expect(screen.queryByTestId('graph')).toBeNull();
    await waitFor(() =>
      expect(diffMock).toHaveBeenCalledWith({
        repoPath: '/repo',
        path: 'a.txt',
        source: { kind: 'staged' },
      }),
    );
    expect(await screen.findByTestId('diff-body')).toBeTruthy();
  });

  it('follows the open file across axes on Stage all', async () => {
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
    const stageAll = vi.fn(() => {
      staged = true;
      return Promise.resolve();
    });
    const diffMock = vi.fn(() => Promise.resolve(makeDiff()));
    render(<Wrapper statusMock={statusMock} diffMock={diffMock} git={{ stageAll }} />);

    const row = (await screen.findByText('a.txt')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      row.click();
    });
    await screen.findByTestId('diff-body');

    await act(async () => {
      screen.getByRole('button', { name: 'Stage all' }).click();
    });

    await waitFor(() =>
      expect(diffMock).toHaveBeenCalledWith({
        repoPath: '/repo',
        path: 'a.txt',
        source: { kind: 'staged' },
      }),
    );
  });
});
