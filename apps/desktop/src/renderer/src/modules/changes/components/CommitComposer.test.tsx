/**
 * @vitest-environment happy-dom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveRepositoryProvider,
  useActiveRepository,
} from '#renderer/modules/repository/ActiveRepositoryContext';
import { CommitComposer } from './CommitComposer';

// Spy on the Toast surface so the error test can assert what the user is shown.
const { mockToastAdd } = vi.hoisted(() => ({ mockToastAdd: vi.fn() }));
vi.mock('@gitoui/ui/toast', () => ({ toast: { add: mockToastAdd } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function RootSetter({ root }: { root: string }) {
  const { setActiveRepository } = useActiveRepository();
  useEffect(() => {
    setActiveRepository(root);
  }, [root, setActiveRepository]);
  return null;
}

type CommitMock = ReturnType<typeof vi.fn>;

function Wrapper({
  stagedCount,
  root = '/repo',
  commitMock = vi.fn(() => Promise.resolve({ sha: 'abc123' })),
}: {
  stagedCount: number;
  root?: string;
  commitMock?: CommitMock;
}) {
  vi.stubGlobal('git', { commit: commitMock });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveRepositoryProvider>
        <RootSetter root={root} />
        <CommitComposer stagedCount={stagedCount} />
      </ActiveRepositoryProvider>
    </QueryClientProvider>
  );
}

const summaryOf = () => screen.getByPlaceholderText('Commit message') as HTMLInputElement;
const descriptionOf = () => screen.getByPlaceholderText('Description') as HTMLTextAreaElement;
const buttonOf = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('CommitComposer disable rules', () => {
  it('disables the button when the summary is empty', () => {
    render(<Wrapper stagedCount={2} />);
    expect(buttonOf('Commit 2 files').disabled).toBe(true);
  });

  it('disables the button when the summary is whitespace only', () => {
    render(<Wrapper stagedCount={2} />);
    fireEvent.change(summaryOf(), { target: { value: '   ' } });
    expect(buttonOf('Commit 2 files').disabled).toBe(true);
  });

  it('keeps the button disabled when only the description is filled', () => {
    render(<Wrapper stagedCount={2} />);
    fireEvent.change(descriptionOf(), { target: { value: 'A body without a subject' } });
    expect(buttonOf('Commit 2 files').disabled).toBe(true);
  });

  it('disables the button when the Staged set is empty, even with a summary', () => {
    render(<Wrapper stagedCount={0} />);
    fireEvent.change(summaryOf(), { target: { value: 'Fix the thing' } });
    expect(buttonOf('Commit 0 files').disabled).toBe(true);
  });

  it('enables the button once a non-blank summary is entered and files are staged', () => {
    render(<Wrapper stagedCount={2} />);
    fireEvent.change(summaryOf(), { target: { value: 'Fix the thing' } });
    expect(buttonOf('Commit 2 files').disabled).toBe(false);
  });

  it('labels the button with the raw Staged count', () => {
    render(<Wrapper stagedCount={5} />);
    expect(screen.getByRole('button', { name: 'Commit 5 files' })).toBeTruthy();
  });

  it('uses the singular noun for a single staged file', () => {
    render(<Wrapper stagedCount={1} />);
    expect(screen.getByRole('button', { name: 'Commit 1 file' })).toBeTruthy();
  });
});

describe('CommitComposer submit', () => {
  it('commits the summary alone as the whole message, then clears the fields', async () => {
    const commitMock = vi.fn(() => Promise.resolve({ sha: 'abc123' }));
    render(<Wrapper stagedCount={2} commitMock={commitMock} root='/repo' />);

    fireEvent.change(summaryOf(), { target: { value: 'Fix the thing' } });

    const button = buttonOf('Commit 2 files');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(commitMock).toHaveBeenCalledWith({ repoPath: '/repo', message: 'Fix the thing' });
    expect(summaryOf().value).toBe('');
  });

  it("joins summary + description as git's subject / blank line / body shape", async () => {
    const commitMock = vi.fn(() => Promise.resolve({ sha: 'abc123' }));
    render(<Wrapper stagedCount={2} commitMock={commitMock} root='/repo' />);

    fireEvent.change(summaryOf(), { target: { value: 'Fix the thing' } });
    fireEvent.change(descriptionOf(), {
      target: { value: 'The retry loop dropped the last attempt.\nAlso covers the timeout path.' },
    });

    await act(async () => {
      fireEvent.click(buttonOf('Commit 2 files'));
    });

    expect(commitMock).toHaveBeenCalledWith({
      repoPath: '/repo',
      message:
        'Fix the thing\n\nThe retry loop dropped the last attempt.\nAlso covers the timeout path.',
    });
    // Both fields clear on success.
    expect(summaryOf().value).toBe('');
    expect(descriptionOf().value).toBe('');
  });

  it('submits on Cmd+Enter from either field', async () => {
    const commitMock = vi.fn(() => Promise.resolve({ sha: 'abc123' }));
    render(<Wrapper stagedCount={1} commitMock={commitMock} root='/repo' />);

    fireEvent.change(summaryOf(), { target: { value: 'Quick fix' } });
    await act(async () => {
      fireEvent.keyDown(descriptionOf(), { key: 'Enter', metaKey: true });
    });

    expect(commitMock).toHaveBeenCalledWith({ repoPath: '/repo', message: 'Quick fix' });
  });

  it('moves focus to the description on a bare Enter in the summary — never submits', async () => {
    const commitMock = vi.fn(() => Promise.resolve({ sha: 'abc123' }));
    render(<Wrapper stagedCount={1} commitMock={commitMock} root='/repo' />);

    const summary = summaryOf();
    fireEvent.change(summary, { target: { value: 'Quick fix' } });
    await act(async () => {
      fireEvent.keyDown(summary, { key: 'Enter' });
    });

    expect(commitMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(descriptionOf());
  });

  it("toasts git's own message when the commit fails (e.g. the Staged set emptied)", async () => {
    mockToastAdd.mockClear();
    const gitMessage = 'nothing to commit, working tree clean';
    const commitMock = vi.fn(() =>
      Promise.reject({ _tag: 'GitCommandError', message: gitMessage }),
    );
    render(<Wrapper stagedCount={1} commitMock={commitMock} root='/repo' />);

    fireEvent.change(summaryOf(), { target: { value: 'Race condition' } });
    fireEvent.change(descriptionOf(), { target: { value: 'Keep me too' } });
    const button = buttonOf('Commit 1 file');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', description: gitMessage }),
    );
    // Neither field is cleared on failure — the user's message survives so they can retry.
    expect(summaryOf().value).toBe('Race condition');
    expect(descriptionOf().value).toBe('Keep me too');
  });
});

describe('CommitComposer summary countdown', () => {
  it('shows the remaining subject budget once typing starts and tints negative overruns', () => {
    render(<Wrapper stagedCount={1} />);

    // Quiet at rest — no counter before any input.
    expect(screen.queryByText('72')).toBeNull();

    fireEvent.change(summaryOf(), { target: { value: 'a'.repeat(10) } });
    expect(screen.getByText('62')).toBeTruthy();

    fireEvent.change(summaryOf(), { target: { value: 'a'.repeat(75) } });
    const overrun = screen.getByText('-3');
    expect(overrun.className).toContain('text-destructive');
  });
});
