import type { ReactNode } from 'react';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { useStatus } from '../hooks/useStatus';
import { ChangeRow } from './ChangeRow';

/**
 * The Inspector's read-only Changes tab (issue #61): Staged and Unstaged groups fed by the real
 * `status` collection. A path Staged AND Unstaged (git's two-axis model, CONTEXT.md) appears in
 * BOTH groups, each row carrying only its own axis's stats — not a staged-xor-unstaged partition.
 *
 * Loading/error states mirror `CommitGraph`'s (skeleton rows on pending, no spinner; a centered
 * inline `role="alert"` via `matchError` on error). A clean Working tree shows a quiet empty state
 * instead of two zero-count groups. Staging interactions, Stage/Unstage all, and the commit
 * composer land in a later slice (#58's tranche ④+).
 */
export function ChangesPanel() {
  const { root } = useActiveRepository();
  const { data: status, isLoading, isError, error, retry } = useStatus(root);

  if (root === null) return null;

  if (isLoading) {
    return <ChangesPanelSkeleton />;
  }

  if (isError) {
    const message = matchError<GitError<'status'>, string>(error, {
      RepoNotFoundError: (e) => messages.changesPanel.repoNotFound(e.path),
      _: () => messages.changesPanel.failedToLoad,
    });
    return (
      <div className='flex flex-col items-center gap-2 px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground' role='alert'>
          {message}
        </p>
        <button
          type='button'
          onClick={retry}
          className='rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted'
        >
          {messages.changesPanel.retry}
        </button>
      </div>
    );
  }

  const entries = status?.entries ?? [];
  // Map (not filter) so each group's rows carry their OWN axis's `StatusChange` without a
  // non-null assertion — a path Staged AND Unstaged contributes one row to each group.
  const staged = entries.flatMap((e) => (e.staged ? [{ path: e.path, change: e.staged }] : []));
  const unstaged = entries.flatMap((e) =>
    e.unstaged ? [{ path: e.path, change: e.unstaged }] : [],
  );

  if (staged.length === 0 && unstaged.length === 0) {
    return (
      <div className='flex h-full items-center justify-center px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground'>{messages.changesPanel.clean}</p>
      </div>
    );
  }

  return (
    <div className='flex flex-col'>
      <ChangeGroup heading={messages.changesPanel.stagedHeading} count={staged.length}>
        {staged.map((row) => (
          <ChangeRow key={`staged:${row.path}`} path={row.path} change={row.change} />
        ))}
      </ChangeGroup>
      <ChangeGroup heading={messages.changesPanel.unstagedHeading} count={unstaged.length}>
        {unstaged.map((row) => (
          <ChangeRow key={`unstaged:${row.path}`} path={row.path} change={row.change} />
        ))}
      </ChangeGroup>
    </div>
  );
}

/** A `STAGED n` / `UNSTAGED n` group header (DESIGN.md) plus its rows. Hidden when empty. */
function ChangeGroup({
  heading,
  count,
  children,
}: {
  heading: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div className='flex flex-col'>
      <div className='flex h-7 items-center gap-1.5 px-3 text-xs font-bold text-muted-foreground'>
        <span>{heading}</span>
        <span className='rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.625rem] leading-none text-muted-foreground tabular-nums'>
          {count}
        </span>
      </div>
      <div role='listbox' aria-label={heading} className='flex flex-col'>
        {children}
      </div>
    </div>
  );
}

/** Skeleton rows shown during loading (no spinner — matches BranchesSection/CommitGraph). */
function ChangesPanelSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading status'>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className='flex h-6 items-center gap-2'>
          <span className='size-4 shrink-0 rounded-sm bg-muted-foreground/20' />
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${50 + (i % 3) * 20}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
