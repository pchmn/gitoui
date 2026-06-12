import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { EmptyState } from '#renderer/modules/repository/EmptyState';
import { RepositoryView } from '#renderer/modules/repository/RepositoryView';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

/**
 * The vertical app shell (epic decision 8): frameless top bar, a flexible content region, and the
 * minimal status bar pinned to the bottom. No 3-column split yet — that lands with the graph tranche.
 */
export function AppShell() {
  const { root } = useActiveRepository();

  return (
    <div className='flex h-screen flex-col bg-background text-foreground'>
      <TopBar />
      <main className='min-h-0 flex-1 overflow-auto'>
        {root === null ? <EmptyState /> : <RepositoryView root={root} />}
      </main>
      <StatusBar />
    </div>
  );
}
