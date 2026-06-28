import { InputGroup, InputGroupAddon, InputGroupInput } from '@gitoui/ui/input-group';
import { GitBranchIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { BranchesSection } from '#renderer/modules/branches/components/BranchesSection';
import { ResizeHandle } from './ResizeHandle';
import { useResizable } from './useResizable';

/**
 * The persistent left rail (DESIGN.md §5 — Layout / App Shell). Surface background; user-resizable
 * width (persisted), divided from the center by the Hairline the `ResizeHandle` draws (Flat-At-Rest
 * rule: no shadow). Rendered only when a Repository is open; the center column stays full-width on
 * `EmptyState`.
 *
 * A single global filter is pinned to the top and narrows every section beneath it (Branches today;
 * Remotes / Tags / Stashes later) — so its state lives here, above the sections, not inside one.
 */
export function RepoRail() {
  const { width, isDragging, handleProps } = useResizable({
    storageKey: 'gitoui:rail-width',
    defaultWidth: 256,
    minWidth: 180,
    maxWidth: 480,
    side: 'left',
  });
  const [filter, setFilter] = useState('');

  return (
    <aside className='relative flex shrink-0 flex-col bg-card' style={{ width }}>
      <RailFilter value={filter} onChange={setFilter} />
      <div className='border-b border-border' />
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <BranchesSectionShell filter={filter} />
      </div>
      <ResizeHandle side='left' isDragging={isDragging} {...handleProps} />
    </aside>
  );
}

/**
 * The rail's global filter, pinned to the top (DESIGN.md §5 — "a filter field at the top"). Built
 * from the shared flat (`ghost`) `InputGroup` + `InputGroupInput`, so it reads as the same control
 * family as the Branch and Repository selector search fields: a leading magnifying glass over a
 * borderless input, flush against the rail.
 */
function RailFilter({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <InputGroup variant='ghost' className='py-1 px-1'>
      <InputGroupAddon>
        <MagnifyingGlassIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder='Filter branches, tags…'
        aria-label='Filter branches and tags'
        className='text-xs/relaxed'
      />
    </InputGroup>
  );
}

/** Branches section: header + the flat branch list from modules/branches/, narrowed by `filter`. */
function BranchesSectionShell({ filter }: { filter: string }) {
  return (
    <section>
      <header className='flex h-8 items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground'>
        <GitBranchIcon className='size-3.5 shrink-0' />
        <span>Branches</span>
      </header>
      <BranchesSection filter={filter} />
    </section>
  );
}
