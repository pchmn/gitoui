import { TabsList, TabsPanel, TabsRoot, TabsTab } from '@gitoui/ui/tabs';
import { ChangesPanel } from '#renderer/modules/changes/components/ChangesPanel';
import { messages } from '#renderer/shared/messages/messages';
import { ResizeHandle } from './ResizeHandle';
import { useResizable } from './useResizable';

/**
 * The right-hand Inspector column (DESIGN.md §5 — Layout / App Shell; CONTEXT.md's Inspector
 * glossary entry): a tabbed `Changes` ⇄ `Tree` panel, Surface-tinted, user-resizable, and rendered
 * only when a Repository is open — mirrors `RepoRail`'s left-side usage of `useResizable` +
 * `ResizeHandle`, just flipped to `side: 'right'` and its own persisted storage key.
 *
 * This slice (#61) only ships the `Changes` tab, read-only, over the real `status` collection —
 * `Tree` is present but disabled until its own slice (#58's tranche ⑩), and the panel always shows
 * Changes mode: the graph-selection-driven Changes/Commit-detail split (WIP row, Commit detail)
 * lands with the WIP row (#58's tranche ⑦).
 */
export function Inspector() {
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
      <TabsRoot defaultValue='changes' className='min-h-0 flex-1'>
        <TabsList className='px-2'>
          <TabsTab value='changes'>{messages.inspector.changesTab}</TabsTab>
          <TabsTab value='tree' disabled>
            {messages.inspector.treeTab}
          </TabsTab>
        </TabsList>
        <TabsPanel value='changes' className='min-h-0 flex-1 overflow-y-auto'>
          <ChangesPanel />
        </TabsPanel>
      </TabsRoot>
    </aside>
  );
}
