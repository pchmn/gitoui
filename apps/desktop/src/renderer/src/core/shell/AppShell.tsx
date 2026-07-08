import { CommitSelectionProvider } from '#renderer/modules/commits/CommitSelectionContext';
import { CommitGraph } from '#renderer/modules/commits/components/CommitGraph';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { EmptyState } from '#renderer/modules/repository/components/EmptyState';
import { useReopenLastRepository } from '#renderer/modules/repository/hooks/useReopenLastRepository';
import { Inspector } from './Inspector';
import { RepoRail } from './RepoRail';
import { SelectionProvider } from './SelectionContext';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

/**
 * The vertical app shell (epic decision 8): frameless top bar, a flex-row body (rail + center +
 * right Inspector), and the minimal status bar pinned to the bottom.
 *
 * The body is a flex row so the Inspector slots in as a third flex child alongside the rail and
 * center. Both the rail and the Inspector are rendered only when a Repository is open; on
 * `EmptyState` the center stays full-width. On launch it reopens the last active Repository
 * (MRU[0], re-validated — issue #10); the content region stays blank while that one attempt
 * settles, so the empty-state CTA never flashes before a restored repo view.
 */
export function AppShell() {
  const { root } = useActiveRepository();
  const { isRestoring } = useReopenLastRepository();

  return (
    <SelectionProvider>
      <CommitSelectionProvider>
        <div className='flex h-screen flex-col bg-background text-foreground'>
          <TopBar />
          <div className='flex min-h-0 flex-1'>
            {root !== null && <RepoRail />}
            <main className='min-h-0 flex-1 overflow-auto'>
              {root !== null ? <CommitGraph root={root} /> : isRestoring ? null : <EmptyState />}
            </main>
            {root !== null && <Inspector />}
          </div>
          <StatusBar />
        </div>
      </CommitSelectionProvider>
    </SelectionProvider>
  );
}
