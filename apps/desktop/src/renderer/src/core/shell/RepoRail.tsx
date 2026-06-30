import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@gitoui/ui/input-group';
import { GitBranchIcon, ListBulletsIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { BranchesSection } from '#renderer/modules/branches/components/BranchesSection';
import { useBranches } from '#renderer/modules/branches/hooks/useBranches';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { messages } from '#renderer/shared/messages/messages';
import { RailSection } from './RailSection';
import { ResizeHandle } from './ResizeHandle';
import { useResizable } from './useResizable';

/** localStorage key for the flat/tree view-mode toggle — now rail-global (issue #33). */
const RAIL_VIEW_MODE_KEY = 'gitoui:rail-view-mode';

/** localStorage key for per-section open/closed state. */
const SECTION_OPEN_KEY = (id: string) => `gitoui:rail-section-${id}-open`;

/**
 * The persistent left rail (DESIGN.md §5 — Layout / App Shell). Surface background; user-resizable
 * width (persisted), divided from the center by the Hairline the `ResizeHandle` draws (Flat-At-Rest
 * rule: no shadow). Rendered only when a Repository is open; the center column stays full-width on
 * `EmptyState`.
 *
 * A single global filter is pinned to the top and narrows every section beneath it (Branches today;
 * Remotes / Tags / Stashes later) — so its state lives here, above the sections, not inside one.
 *
 * Sections collapse/expand independently (not a single-open accordion). Open/closed state persists
 * per-section in localStorage. The view-mode toggle is a rail-global trailing addon in the filter
 * bar (issue #33).
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

  // Rail-global view-mode toggle (was gitoui:branches-view-mode, renamed gitoui:rail-view-mode, issue #33).
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>(() => {
    const stored = localStorage.getItem(RAIL_VIEW_MODE_KEY);
    return stored === 'flat' ? 'flat' : 'tree';
  });

  function toggleViewMode() {
    const next: 'flat' | 'tree' = viewMode === 'tree' ? 'flat' : 'tree';
    setViewMode(next);
    localStorage.setItem(RAIL_VIEW_MODE_KEY, next);
  }

  // Per-section open state with localStorage persistence. Default: Branches open.
  const [branchesOpen, setBranchesOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(SECTION_OPEN_KEY('branches'));
    return stored === null ? true : stored === 'true';
  });

  function handleBranchesOpenChange(open: boolean) {
    setBranchesOpen(open);
    localStorage.setItem(SECTION_OPEN_KEY('branches'), String(open));
  }

  return (
    <aside className='relative flex shrink-0 flex-col bg-card' style={{ width }}>
      <RailFilter
        value={filter}
        onChange={setFilter}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
      />
      <div className='border-b border-border' />
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <BranchesSectionShell
          filter={filter}
          viewMode={viewMode}
          open={branchesOpen}
          onOpenChange={handleBranchesOpenChange}
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
 *
 * The flat/tree view-mode toggle lives here as a trailing `InputGroupButton` addon (issue #33).
 */
function RailFilter({
  value,
  onChange,
  viewMode,
  onToggleViewMode,
}: {
  value: string;
  onChange: (next: string) => void;
  viewMode: 'flat' | 'tree';
  onToggleViewMode: () => void;
}) {
  return (
    <InputGroup variant='ghost' className='py-1 px-1'>
      <InputGroupAddon>
        <MagnifyingGlassIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={messages.repoRail.filterPlaceholder}
        aria-label={messages.repoRail.filterAria}
        className='text-xs/relaxed'
      />
      <InputGroupAddon align='inline-end'>
        {/* Toggle shows the icon for the OPPOSITE view (what clicking will switch to). */}
        <InputGroupButton
          onClick={onToggleViewMode}
          aria-label={viewMode === 'tree' ? 'Switch to flat list view' : 'Switch to tree view'}
          title={viewMode === 'tree' ? 'Switch to flat list view' : 'Switch to tree view'}
        >
          {viewMode === 'tree' ? (
            <ListBulletsIcon className='size-3.5' aria-hidden='true' />
          ) : (
            <RecursiveTreeIcon className='size-3.5' aria-hidden='true' />
          )}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/**
 * Render-prop helper that reads the branches query to provide the count badge and match flag
 * without duplicating the hook call into every consumer. Shows 0 during loading (badge always
 * renders per spec — "render even when 0").
 */
function BranchesSectionCount({
  filter,
  children,
}: {
  filter: string;
  children: (count: number, hasMatch: boolean) => ReactNode;
}) {
  const { root } = useActiveRepository();
  const { data: branchList } = useBranches(root);

  const branches = branchList?.branches ?? [];
  const count = branches.length;
  const hasMatch =
    filter.trim() === '' ||
    branches.some((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  return children(count, hasMatch);
}

/**
 * Branches section — uses `RailSection` for the collapsible header with count badge. Auto-expands
 * while a filter is active and there are matches (mirrors BranchTreeView folder auto-expand
 * behavior). A section with no matches is hidden while a filter is active.
 */
function BranchesSectionShell({
  filter,
  viewMode,
  open,
  onOpenChange,
}: {
  filter: string;
  viewMode: 'flat' | 'tree';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isFiltering = filter.trim() !== '';
  // While a filter is active, auto-expand — overrides persisted collapsed state.
  const effectiveOpen = isFiltering ? true : open;

  return (
    <BranchesSectionCount filter={filter}>
      {(count, hasMatch) => {
        // While filtering with no match, hide the entire section.
        if (isFiltering && !hasMatch) return null;

        return (
          <RailSection
            id='branches'
            icon={<GitBranchIcon />}
            label={messages.repoRail.branchesHeading}
            count={count}
            open={effectiveOpen}
            onOpenChange={(next) => {
              // Don't persist the auto-expand override; only persist user-driven changes.
              if (!isFiltering) {
                onOpenChange(next);
              }
            }}
          >
            <BranchesSection filter={filter} viewMode={viewMode} />
          </RailSection>
        );
      }}
    </BranchesSectionCount>
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
      <g clipPath='url(#clip0_2005_2)'>
        <path
          d='M88 64H216'
          stroke='currentColor'
          strokeWidth='16'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path
          d='M117 128L216 128'
          stroke='currentColor'
          strokeWidth='16'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path
          d='M145 192L216 192'
          stroke='currentColor'
          strokeWidth='16'
          strokeLinecap='round'
          strokeLinejoin='round'
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
