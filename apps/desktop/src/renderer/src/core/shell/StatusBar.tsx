import { cn } from '@gitoui/ui/lib/utils';
import { GitBranchIcon } from '@phosphor-icons/react';
import { useStatus } from '#renderer/modules/changes/hooks/useStatus';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { messages } from '#renderer/shared/messages/messages';

/**
 * Slim Surface bar pinned to the bottom (DESIGN §5). Reflects the active Repository's live `status`:
 * current branch, ahead/behind, changed count, and a quiet clean/dirty dot. No color beyond state.
 *
 * Reads the shared `status` collection (via `useStatus`) rather than its own `useQuery(['status',
 * root])`. A separate plain query would COLLIDE with the collection on the same key but with a
 * different result shape (object vs the collection's array), which breaks `invalidateQueries(['status',
 * root])` for every status mutation (staging, branch switch, …). One key, one shape (issue #62).
 */
export function StatusBar() {
  const { root } = useActiveRepository();
  const { data: status, isError } = useStatus(root);

  return (
    <footer className='flex h-6 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground'>
      <div className='flex min-w-0 items-center gap-3'>
        {root === null ? (
          <span>{messages.statusBar.idle}</span>
        ) : isError ? (
          <span>{messages.statusBar.unavailable}</span>
        ) : status ? (
          <>
            <span className='flex items-center gap-1 text-foreground'>
              <GitBranchIcon className='size-3 shrink-0' />
              <span className='truncate'>{status.branch}</span>
            </span>
            {(status.ahead > 0 || status.behind > 0) && (
              <span className='flex items-center gap-1.5 tabular-nums'>
                {status.ahead > 0 && <span>↑{status.ahead}</span>}
                {status.behind > 0 && <span>↓{status.behind}</span>}
              </span>
            )}
            <span className='tabular-nums'>
              {messages.statusBar.changedCount(status.entries.length)}
            </span>
          </>
        ) : (
          <span>{messages.statusBar.loading}</span>
        )}
      </div>

      {root !== null && status && <CleanDirtyIndicator dirty={status.entries.length > 0} />}
    </footer>
  );
}

function CleanDirtyIndicator({ dirty }: { dirty: boolean }) {
  return (
    <span className='flex shrink-0 items-center gap-1.5'>
      <span
        className={cn('size-1.5 rounded-full', dirty ? 'bg-primary' : 'bg-muted-foreground/40')}
      />
      {dirty ? messages.statusBar.dirty : messages.statusBar.clean}
    </span>
  );
}
