import { TabsList, TabsPanel, TabsRoot, TabsTab } from '@gitoui/ui/tabs';
import { ChangesPanel } from '#renderer/modules/changes/components/ChangesPanel';
import { useCommitSelection } from '#renderer/modules/commits/CommitSelectionContext';
import { CommitDetail } from '#renderer/modules/commits/components/CommitDetail';
import { messages } from '#renderer/shared/messages/messages';
import { ResizeHandle } from './ResizeHandle';
import { useResizable } from './useResizable';

/**
 * The right-hand Inspector column (DESIGN.md §5 — Layout / App Shell; CONTEXT.md's Inspector
 * glossary entry): Surface-tinted, user-resizable, and rendered only when a Repository is open —
 * mirrors `RepoRail`'s left-side usage of `useResizable` + `ResizeHandle`, just flipped to
 * `side: 'right'` and its own persisted storage key.
 *
 * Two modes, driven by the graph selection (issue #66): Commit detail when a Commit is selected
 * (`kind: 'commit'`), and the tabbed `Changes` ⇄ `Tree` panel otherwise — a Working-tree (WIP)
 * selection and no selection are equivalent, both Changes mode. `Tree` stays disabled until its own
 * slice (#58's tranche ⑩); the `Changes` tab is read-only over the real `status` collection (#61).
 */
export function Inspector() {
  const { selection } = useCommitSelection();
  const { width, isDragging, handleProps } = useResizable({
    storageKey: 'gitoui:inspector-width',
    defaultWidth: 288,
    minWidth: 220,
    maxWidth: 480,
    side: 'right',
  });

  return (
    <aside className='relative flex shrink-0 flex-col bg-card' style={{ width }}>
      <ResizeHandle side='right' isDragging={isDragging} {...handleProps} />
      {selection?.kind === 'commit' ? (
        <CommitDetail sha={selection.sha} />
      ) : (
        <TabsRoot defaultValue='changes' className='min-h-0 flex-1'>
          <TabsList className='px-2'>
            <TabsTab value='changes'>{messages.inspector.changesTab}</TabsTab>
            <TabsTab value='tree' disabled>
              {messages.inspector.treeTab}
            </TabsTab>
          </TabsList>
          {/* No `overflow-y-auto` here: ChangesPanel owns its own scroll so its commit composer can
              stay pinned as a footer while only the file lists scroll. */}
          <TabsPanel value='changes' className='flex min-h-0 flex-1 flex-col'>
            <ChangesPanel />
          </TabsPanel>
        </TabsRoot>
      )}
    </aside>
  );
}
