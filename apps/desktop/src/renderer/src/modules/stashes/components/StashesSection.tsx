import { cn } from '@gitoui/ui/lib/utils';
import { StackIcon, StackSimpleIcon } from '@phosphor-icons/react';
import { useSelection } from '#renderer/core/shell/SelectionContext';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useStashes } from '../hooks/useStashes';

/**
 * Flat read-only Stashes section for the Repository rail (issue #36). Always flat.
 * Rows are selectable: `{ kind: 'stash', id: stash.id }`.
 *
 * Filter matches on message OR branch and auto-expands the section. Loading shows skeleton rows;
 * empty state mirrors `TagsSection`. Order follows `stash@{0}` first (git's natural output order).
 */
export function StashesSection({ filter }: { filter: string }) {
  const { root } = useActiveRepository();
  const { data: stashList, isPending, isError, error } = useStashes(root);

  if (root === null) return null;

  // Loading state — show skeleton rows, no spinner.
  if (isPending) {
    return <StashesSkeleton />;
  }

  // Error state — quiet inline message via matchError.
  if (isError) {
    const message = matchError<GitError<'listStashes'>, string>(error, {
      RepoNotFoundError: (e) => messages.stashesSection.repoNotFound(e.path),
      _: () => messages.stashesSection.failedToLoad,
    });
    return (
      <p className='px-3 py-2 text-xs text-muted-foreground' role='alert'>
        {message}
      </p>
    );
  }

  const { stashes } = stashList;
  const lowerFilter = filter.toLowerCase().trim();

  // Filter: case-insensitive substring on message OR branch.
  const filtered =
    lowerFilter === ''
      ? stashes
      : stashes.filter(
          (s) =>
            s.message.toLowerCase().includes(lowerFilter) ||
            s.branch?.toLowerCase().includes(lowerFilter),
        );

  const isEmpty = filtered.length === 0;

  return (
    <>
      {/* Empty state — quiet Muted-Ink hint. */}
      {isEmpty && (
        <p className='px-3 py-1.5 text-xs text-muted-foreground'>
          {stashes.length === 0
            ? messages.stashesSection.emptyYet
            : messages.stashesSection.emptyFiltered}
        </p>
      )}

      {/* Flat stash list. */}
      {!isEmpty && (
        <div role='listbox' aria-label='Stashes' className='flex flex-col px-2'>
          {filtered.map((stash) => (
            <StashRow key={stash.id} id={stash.id} message={stash.message} branch={stash.branch} />
          ))}
        </div>
      )}
    </>
  );
}

/** Single stash row — read-only, single-click = select. */
function StashRow({ id, message, branch }: { id: string; message: string; branch?: string }) {
  const { isSelected, select } = useSelection();
  const sel = { kind: 'stash' as const, id };
  const isRowSelected = isSelected(sel);

  function handleClick() {
    select(sel);
  }

  return (
    <div
      role='option'
      className={cn(
        'flex h-7 cursor-default select-none items-center gap-1.5 px-3 text-xs hover:bg-muted rounded-sm',
        isRowSelected && 'ring-1 ring-inset ring-primary/50',
      )}
      aria-selected={isRowSelected}
      tabIndex={0}
      title={branch !== undefined ? `${message} (${branch})` : message}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Stack icon in a size-3 slot so it aligns with branch/tag rows. */}
      <span className='flex size-3 shrink-0 items-center justify-center' aria-hidden='true'>
        <StackSimpleIcon className='size-3 text-muted-foreground/60' weight='fill' />
      </span>
      <span className='min-w-0 flex-1 truncate'>{message}</span>
      {branch !== undefined && (
        <span className='shrink-0 truncate text-muted-foreground/60'>{branch}</span>
      )}
    </div>
  );
}

/** Skeleton rows shown during loading (no spinner — skeletons over spinners per issue #23). */
function StashesSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading stashes'>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className='flex h-6 items-center gap-2'>
          <span className='size-1.5 shrink-0 rounded-full bg-muted-foreground/20' />
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${55 + (i % 3) * 20}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
