/**
 * @vitest-environment happy-dom
 */

import type { CommitDetail as CommitDetailData } from '@gitoui/contracts/git';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CenterViewProvider } from '#renderer/modules/diff/CenterViewContext';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { CommitDetail } from './CommitDetail';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.stubGlobal('desktop', { platform: 'linux' });

function makeDetail(partial: Partial<CommitDetailData> = {}): CommitDetailData {
  return {
    sha: 'deadbeef123456789',
    author: { name: 'Ada Lovelace', email: 'ada@example.com' },
    date: Date.now(),
    message: 'Add fallback path\n\nExplains why the fallback exists.',
    changes: [],
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
  sha = 'deadbeef123456789',
  commitDetailMock,
}: {
  root?: string;
  sha?: string;
  commitDetailMock: () => Promise<CommitDetailData>;
}) {
  vi.stubGlobal('git', { commitDetail: vi.fn(commitDetailMock) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveRepositoryProvider>
        <RootSetter root={root} />
        <CenterViewProvider>
          <CommitDetail sha={sha} />
        </CenterViewProvider>
      </ActiveRepositoryProvider>
    </QueryClientProvider>
  );
}

describe('CommitDetail', () => {
  it('shows the short SHA immediately, independent of the query', () => {
    render(<Wrapper commitDetailMock={() => new Promise(() => {})} />);
    expect(screen.getByText('deadbee')).toBeTruthy();
  });

  it('renders author, relative date, full message, and Changes once loaded', async () => {
    render(
      <Wrapper
        commitDetailMock={() =>
          Promise.resolve(
            makeDetail({
              changes: [{ path: 'src/a.ts', kind: 'modified', additions: 3, deletions: 1 }],
            }),
          )
        }
      />,
    );

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Add fallback path')).toBeTruthy();
    expect(screen.getByText('Explains why the fallback exists.')).toBeTruthy();
    expect(screen.getByText('a.ts')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('−1')).toBeTruthy();
  });

  it('renders Change rows read-only — no stage/unstage action', async () => {
    render(
      <Wrapper
        commitDetailMock={() =>
          Promise.resolve(makeDetail({ changes: [{ path: 'src/a.ts', kind: 'modified' }] }))
        }
      />,
    );

    await screen.findByText('a.ts');
    expect(screen.queryByRole('button', { name: /^Stage /i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Unstage /i })).toBeNull();
  });

  it('shows an inline error phrased via matchError when the query rejects', async () => {
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      render(
        <Wrapper
          commitDetailMock={() => Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' })}
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

  it('retries and shows the detail once the retried query succeeds', async () => {
    const rejectionListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', () => {});
    try {
      let hasFailed = false;
      render(
        <Wrapper
          commitDetailMock={() => {
            if (!hasFailed) {
              hasFailed = true;
              return Promise.reject({ _tag: 'RepoNotFoundError', path: '/bad/path' });
            }
            return Promise.resolve(makeDetail());
          }}
        />,
      );

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      await act(async () => {
        retryButton.click();
      });

      await screen.findByText('Ada Lovelace');
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const listener of rejectionListeners) {
        process.on('unhandledRejection', listener);
      }
    }
  });

  it('copies the full SHA when the SHA button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<Wrapper commitDetailMock={() => Promise.resolve(makeDetail())} />);

    const shaButton = await screen.findByRole('button', { name: 'Copy commit SHA' });
    await act(async () => {
      shaButton.click();
    });

    expect(writeText).toHaveBeenCalledWith('deadbeef123456789');
  });

  it("walks the commit's files with the arrow keys, clamping at the ends", async () => {
    render(
      <Wrapper
        commitDetailMock={() =>
          Promise.resolve(
            makeDetail({
              changes: [
                { path: 'a.ts', kind: 'modified' },
                { path: 'b.ts', kind: 'modified' },
                { path: 'c.ts', kind: 'modified' },
              ],
            }),
          )
        }
      />,
    );

    // The open file drives `aria-selected`, so the selected option tracks arrow navigation. Fire on
    // the first row throughout — the handler reads the open-file state, not the fired element.
    const firstRow = (await screen.findByText('a.ts')).closest('[role="option"]') as HTMLElement;
    await act(async () => {
      firstRow.click();
    });
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('a.ts');

    await act(async () => {
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    });
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('b.ts');

    await act(async () => {
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    });
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('c.ts');

    // ArrowDown from the last file clamps (no wrap).
    await act(async () => {
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    });
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('c.ts');

    await act(async () => {
      fireEvent.keyDown(firstRow, { key: 'ArrowUp' });
    });
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('b.ts');
  });
});
