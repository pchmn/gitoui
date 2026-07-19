import { useLiveStatus } from '#renderer/modules/changes/hooks/useLiveStatus';
import { CommitSelectionProvider } from '#renderer/modules/commits/CommitSelectionContext';
import { CommitGraph } from '#renderer/modules/commits/components/CommitGraph';
import { CenterViewProvider, useCenterView } from '#renderer/modules/diff/CenterViewContext';
import { CodeDiffView } from '#renderer/modules/diff/components/CodeDiffView';
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
 *
 * Mounts `useLiveStatus` here (not in StatusBar or the Changes panel) so there's exactly one
 * `RepoWatcher` subscription per active Repository, feeding both.
 */
export function AppShell() {
  const { root } = useActiveRepository();
  const { isRestoring } = useReopenLastRepository();
  useLiveStatus(root);

  return (
    <SelectionProvider>
      <CommitSelectionProvider>
        <CenterViewProvider>
          <div className='flex h-screen flex-col bg-background text-foreground'>
            <TopBar />
            <ShellBody root={root} isRestoring={isRestoring} />
            <StatusBar />
          </div>
        </CenterViewProvider>
      </CommitSelectionProvider>
    </SelectionProvider>
  );
}

/**
 * The flex-row body (rail + center + right Inspector). The Code & Diff view (issue #67) replaces the
 * Commit graph in the center while a file is targeted (`CenterViewContext`) AND takes over the left
 * rail's space — the rail unmounts so the diff gets the full width up to the Inspector, which stays
 * (it holds the Changes list you navigate between files with). `CommitGraph` also UNMOUNTS while the
 * diff is open — its own Esc handler isn't attached then, so a second Esc only fires once the graph
 * is back (see `CodeDiffView`'s comment on the capture-phase handoff).
 */
function ShellBody({ root, isRestoring }: { root: string | null; isRestoring: boolean }) {
  const { file } = useCenterView();
  const diffOpen = root !== null && file !== null;

  return (
    <div className='flex min-h-0 flex-1'>
      {root !== null && !diffOpen && <RepoRail />}
      <main className='min-h-0 flex-1 overflow-auto'>
        {root !== null ? (
          diffOpen ? (
            <CodeDiffView />
          ) : (
            <CommitGraph root={root} />
          )
        ) : isRestoring ? null : (
          <EmptyState />
        )}
      </main>
      {root !== null && <Inspector />}
    </div>
  );
}
