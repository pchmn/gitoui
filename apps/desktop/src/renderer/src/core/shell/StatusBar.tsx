import { cn } from '@gitoui/ui/lib/utils';
import { GitBranchIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { messages } from '#renderer/shared/messages/messages';

/**
 * Slim Surface bar pinned to the bottom (DESIGN §5). Reflects the active Repository's live `status`:
 * current branch, ahead/behind, changed count, and a quiet clean/dirty dot. No color beyond state.
 */
export function StatusBar() {
  const { root } = useActiveRepository();

  // `queryFn` throws on Failure/Defect (Style A); re-runs whenever the active Repository changes.
  const status = useQuery({
    queryKey: ['status', root],
    queryFn: () => window.git.status({ repoPath: root as string }),
    enabled: root !== null,
  });

  return (
    <footer className='flex h-6 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground'>
      <div className='flex min-w-0 items-center gap-3'>
        {root === null ? (
          <span>{messages.statusBar.idle}</span>
        ) : status.isError ? (
          <span>{messages.statusBar.unavailable}</span>
        ) : status.data ? (
          <>
            <span className='flex items-center gap-1 text-foreground'>
              <GitBranchIcon className='size-3 shrink-0' />
              <span className='truncate'>{status.data.branch}</span>
            </span>
            {(status.data.ahead > 0 || status.data.behind > 0) && (
              <span className='flex items-center gap-1.5 tabular-nums'>
                {status.data.ahead > 0 && <span>↑{status.data.ahead}</span>}
                {status.data.behind > 0 && <span>↓{status.data.behind}</span>}
              </span>
            )}
            <span className='tabular-nums'>
              {messages.statusBar.changedCount(status.data.entries.length)}
            </span>
          </>
        ) : (
          <span>{messages.statusBar.loading}</span>
        )}
      </div>

      {root !== null && status.data && (
        <CleanDirtyIndicator dirty={status.data.entries.length > 0} />
      )}
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
