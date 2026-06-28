import { InputGroup, InputGroupAddon, InputGroupInput } from '@gitoui/ui/input-group';
import {
  GitBranchIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { BranchesSection } from '#renderer/modules/branches/components/BranchesSection';
import { ResizeHandle } from './ResizeHandle';
import { useResizable } from './useResizable';

const BRANCHES_VIEW_MODE_KEY = 'gitoui:branches-view-mode';

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
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>(() => {
    const stored = localStorage.getItem(BRANCHES_VIEW_MODE_KEY);
    return stored === 'flat' ? 'flat' : 'tree';
  });

  function toggleViewMode() {
    const next: 'flat' | 'tree' = viewMode === 'tree' ? 'flat' : 'tree';
    setViewMode(next);
    localStorage.setItem(BRANCHES_VIEW_MODE_KEY, next);
  }

  return (
    <aside className='relative flex shrink-0 flex-col bg-card' style={{ width }}>
      <RailFilter value={filter} onChange={setFilter} />
      <div className='border-b border-border' />
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <BranchesSectionShell
          filter={filter}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
        />
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

/** Branches section: header + the branch list from modules/branches/, narrowed by `filter`. */
function BranchesSectionShell({
  filter,
  viewMode,
  onToggleViewMode,
}: {
  filter: string;
  viewMode: 'flat' | 'tree';
  onToggleViewMode: () => void;
}) {
  return (
    <section>
      <header className='flex h-8 items-center gap-1.5 px-3 pr-2 text-xs font-medium text-muted-foreground'>
        <GitBranchIcon className='size-3.5 shrink-0' />
        <span className='flex-1'>Branches</span>
        {/* Toggle shows the icon for the OPPOSITE view (what clicking will switch to). */}
        <button
          type='button'
          className='flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground'
          onClick={onToggleViewMode}
          aria-label={viewMode === 'tree' ? 'Switch to flat list view' : 'Switch to tree view'}
          title={viewMode === 'tree' ? 'Switch to flat list view' : 'Switch to tree view'}
        >
          {viewMode === 'tree' ? (
            <ListBulletsIcon className='size-4' aria-hidden='true' />
          ) : (
            <RecursiveTreeIcon className='size-4' aria-hidden='true' />
          )}
        </button>
      </header>
      <BranchesSection filter={filter} viewMode={viewMode} />
    </section>
  );
}

function RecursiveTreeIcon({ className }: { className?: string }) {
  return (
    <svg
      width='256'
      height='256'
      viewBox='0 0 256 256'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
    >
      <title>Recursive Tree View</title>
      <g clip-path='url(#clip0_2005_2)'>
        <path
          d='M88 64H216'
          stroke='currentColor'
          stroke-width='16'
          stroke-linecap='round'
          stroke-linejoin='round'
        />
        <path
          d='M117 128L216 128'
          stroke='currentColor'
          stroke-width='16'
          stroke-linecap='round'
          stroke-linejoin='round'
        />
        <path
          d='M145 192L216 192'
          stroke='currentColor'
          stroke-width='16'
          stroke-linecap='round'
          stroke-linejoin='round'
        />
        <path
          d='M44 76C50.6274 76 56 70.6274 56 64C56 57.3726 50.6274 52 44 52C37.3726 52 32 57.3726 32 64C32 70.6274 37.3726 76 44 76Z'
          fill='currentColor'
        />
        <path
          d='M68 140C74.6274 140 80 134.627 80 128C80 121.373 74.6274 116 68 116C61.3726 116 56 121.373 56 128C56 134.627 61.3726 140 68 140Z'
          fill='currentColor'
        />
        <path
          d='M92 204C98.6274 204 104 198.627 104 192C104 185.373 98.6274 180 92 180C85.3726 180 80 185.373 80 192C80 198.627 85.3726 204 92 204Z'
          fill='currentColor'
        />
      </g>
      <defs>
        <clipPath id='clip0_2005_2'>
          <rect width='256' height='256' fill='white' />
        </clipPath>
      </defs>
    </svg>
  );
}
