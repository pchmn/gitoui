import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { EmptyState } from '#renderer/modules/repository/components/EmptyState';
import { RepositoryView } from '#renderer/modules/repository/components/RepositoryView';
import { useReopenLastRepository } from '#renderer/modules/repository/hooks/useReopenLastRepository';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

/**
 * The vertical app shell (epic decision 8): frameless top bar, a flexible content region, and the
 * minimal status bar pinned to the bottom. No 3-column split yet — that lands with the graph tranche.
 *
 * On launch it reopens the last active Repository (MRU[0], re-validated — issue #10); the content
 * region stays blank while that one attempt settles, so the empty-state CTA never flashes before a
 * restored repo view.
 */
export function AppShell() {
  const { root } = useActiveRepository();
  const { isRestoring } = useReopenLastRepository();

  return (
    <div className='flex h-screen flex-col bg-background text-foreground'>
      <TopBar />
      <main className='min-h-0 flex-1 overflow-auto'>
        {root !== null ? <RepositoryView root={root} /> : isRestoring ? null : <EmptyState />}
      </main>
      <StatusBar />
    </div>
  );
}
