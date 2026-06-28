import { GitBranchIcon } from '@phosphor-icons/react';
import { ResizeHandle } from './ResizeHandle';
import { useResizable } from './useResizable';

/**
 * The persistent left rail (DESIGN.md §5 — Layout / App Shell). Surface background; user-resizable
 * width (persisted), divided from the center by the Hairline the `ResizeHandle` draws (Flat-At-Rest
 * rule: no shadow). Rendered only when a Repository is open; the center column stays full-width on
 * `EmptyState`.
 *
 * This slice: scaffold only — the `Branches` section header + an empty list stub. Branch data
 * lands in the next slice (modules/branches/).
 */
export function RepoRail() {
  const { width, isDragging, handleProps } = useResizable({
    storageKey: 'gitoui:rail-width',
    defaultWidth: 256,
    minWidth: 180,
    maxWidth: 480,
    side: 'left',
  });

  return (
    <aside className='relative flex shrink-0 flex-col bg-card' style={{ width }}>
      <BranchesSection />
      <ResizeHandle side='left' isDragging={isDragging} {...handleProps} />
    </aside>
  );
}

/** Empty stub — branch list data lands in the next slice. */
function BranchesSection() {
  return (
    <section>
      <header className='flex h-8 items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground'>
        <GitBranchIcon className='size-3.5 shrink-0' />
        <span>Branches</span>
      </header>
      {/* branch list renders here in the next slice */}
    </section>
  );
}
