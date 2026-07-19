import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@gitoui/ui/input-group';
import {
  GitBranchIcon,
  HardDrivesIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  StackIcon,
  TagIcon,
  TreeViewIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { BranchesSection } from '#renderer/modules/branches/components/BranchesSection';
import { useBranches } from '#renderer/modules/branches/hooks/useBranches';
import { RemotesSection } from '#renderer/modules/remotes/components/RemotesSection';
import { useRemotes } from '#renderer/modules/remotes/hooks/useRemotes';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { StashesSection } from '#renderer/modules/stashes/components/StashesSection';
import { useStashes } from '#renderer/modules/stashes/hooks/useStashes';
import { TagsSection } from '#renderer/modules/tags/components/TagsSection';
import { useTags } from '#renderer/modules/tags/hooks/useTags';
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

  // Per-section open state for Remotes. Default: open.
  const [remotesOpen, setRemotesOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(SECTION_OPEN_KEY('remotes'));
    return stored === null ? true : stored === 'true';
  });

  function handleRemotesOpenChange(open: boolean) {
    setRemotesOpen(open);
    localStorage.setItem(SECTION_OPEN_KEY('remotes'), String(open));
  }

  // Per-section open state for Tags. Default: open.
  const [tagsOpen, setTagsOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(SECTION_OPEN_KEY('tags'));
    return stored === null ? true : stored === 'true';
  });

  function handleTagsOpenChange(open: boolean) {
    setTagsOpen(open);
    localStorage.setItem(SECTION_OPEN_KEY('tags'), String(open));
  }

  // Per-section open state for Stashes. Default: open.
  const [stashesOpen, setStashesOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(SECTION_OPEN_KEY('stashes'));
    return stored === null ? true : stored === 'true';
  });

  function handleStashesOpenChange(open: boolean) {
    setStashesOpen(open);
    localStorage.setItem(SECTION_OPEN_KEY('stashes'), String(open));
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
      <div className='min-h-0 flex-1 overflow-y-auto flex flex-col gap-1'>
        <BranchesSectionShell
          filter={filter}
          viewMode={viewMode}
          open={branchesOpen}
          onOpenChange={handleBranchesOpenChange}
        />
        <RemotesSectionShell
          filter={filter}
          viewMode={viewMode}
          open={remotesOpen}
          onOpenChange={handleRemotesOpenChange}
        />
        <TagsSectionShell filter={filter} open={tagsOpen} onOpenChange={handleTagsOpenChange} />
        <StashesSectionShell
          filter={filter}
          open={stashesOpen}
          onOpenChange={handleStashesOpenChange}
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
        <MagnifyingGlassIcon weight='regular' />
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
            <ListViewIcon className='size-4' aria-hidden='true' />
          ) : (
            <TreeViewIcon className='size-4' aria-hidden='true' weight='duotone' />
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
            icon={<GitBranchIcon weight='duotone' />}
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

/**
 * Render-prop helper that reads the remotes query to provide the count badge and match flag
 * without duplicating the hook call into every consumer.
 */
function RemotesSectionCount({
  filter,
  children,
}: {
  filter: string;
  children: (count: number, hasMatch: boolean) => ReactNode;
}) {
  const { root } = useActiveRepository();
  const { data: remoteList } = useRemotes(root);

  const remotes = remoteList?.remotes ?? [];
  const count = remotes.length;
  const lowerFilter = filter.toLowerCase().trim();
  const hasMatch =
    lowerFilter === '' ||
    remotes.some(
      (r) =>
        r.name.toLowerCase().includes(lowerFilter) ||
        r.branches.some((b) => b.name.toLowerCase().includes(lowerFilter)),
    );

  return children(count, hasMatch);
}

/**
 * Remotes section — uses `RailSection` for the collapsible header with count badge. Auto-expands
 * while a filter is active and there are matches. A section with no matches is hidden while a
 * filter is active.
 */
function RemotesSectionShell({
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
  const effectiveOpen = isFiltering ? true : open;

  return (
    <RemotesSectionCount filter={filter}>
      {(count, hasMatch) => {
        if (isFiltering && !hasMatch) return null;

        return (
          <RailSection
            id='remotes'
            icon={<HardDrivesIcon weight='duotone' />}
            label={messages.repoRail.remotesHeading}
            count={count}
            open={effectiveOpen}
            onOpenChange={(next) => {
              if (!isFiltering) {
                onOpenChange(next);
              }
            }}
          >
            <RemotesSection filter={filter} viewMode={viewMode} />
          </RailSection>
        );
      }}
    </RemotesSectionCount>
  );
}

/**
 * Render-prop helper that reads the tags query to provide the count badge and match flag
 * without duplicating the hook call into every consumer.
 */
function TagsSectionCount({
  filter,
  children,
}: {
  filter: string;
  children: (count: number, hasMatch: boolean) => ReactNode;
}) {
  const { root } = useActiveRepository();
  const { data: tagList } = useTags(root);

  const tags = tagList?.tags ?? [];
  const count = tags.length;
  const lowerFilter = filter.toLowerCase().trim();
  const hasMatch =
    lowerFilter === '' || tags.some((t) => t.name.toLowerCase().includes(lowerFilter));

  return children(count, hasMatch);
}

/**
 * Tags section — uses `RailSection` for the collapsible header with count badge. Always flat —
 * ignores the rail-global flat/tree mode. Auto-expands while a filter is active and there are
 * matches. A section with no matches is hidden while a filter is active.
 */
function TagsSectionShell({
  filter,
  open,
  onOpenChange,
}: {
  filter: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isFiltering = filter.trim() !== '';
  const effectiveOpen = isFiltering ? true : open;

  return (
    <TagsSectionCount filter={filter}>
      {(count, hasMatch) => {
        if (isFiltering && !hasMatch) return null;

        return (
          <RailSection
            id='tags'
            icon={<TagIcon weight='duotone' />}
            label={messages.repoRail.tagsHeading}
            count={count}
            open={effectiveOpen}
            onOpenChange={(next) => {
              if (!isFiltering) {
                onOpenChange(next);
              }
            }}
          >
            <TagsSection filter={filter} />
          </RailSection>
        );
      }}
    </TagsSectionCount>
  );
}

/**
 * Render-prop helper that reads the stashes query to provide the count badge and match flag
 * without duplicating the hook call into every consumer.
 */
function StashesSectionCount({
  filter,
  children,
}: {
  filter: string;
  children: (count: number, hasMatch: boolean) => ReactNode;
}) {
  const { root } = useActiveRepository();
  const { data: stashList } = useStashes(root);

  const stashes = stashList?.stashes ?? [];
  const count = stashes.length;
  const lowerFilter = filter.toLowerCase().trim();
  const hasMatch =
    lowerFilter === '' ||
    stashes.some(
      (s) =>
        s.message.toLowerCase().includes(lowerFilter) ||
        s.branch?.toLowerCase().includes(lowerFilter),
    );

  return children(count, hasMatch);
}

/**
 * Stashes section — uses `RailSection` for the collapsible header with count badge. Always flat —
 * ignores the rail-global flat/tree mode. Auto-expands while a filter is active and there are
 * matches. A section with no matches is hidden while a filter is active.
 */
function StashesSectionShell({
  filter,
  open,
  onOpenChange,
}: {
  filter: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isFiltering = filter.trim() !== '';
  const effectiveOpen = isFiltering ? true : open;

  return (
    <StashesSectionCount filter={filter}>
      {(count, hasMatch) => {
        if (isFiltering && !hasMatch) return null;

        return (
          <RailSection
            id='stashes'
            icon={<StackIcon weight='duotone' />}
            label={messages.repoRail.stashesHeading}
            count={count}
            open={effectiveOpen}
            onOpenChange={(next) => {
              if (!isFiltering) {
                onOpenChange(next);
              }
            }}
          >
            <StashesSection filter={filter} />
          </RailSection>
        );
      }}
    </StashesSectionCount>
  );
}

function ListViewIcon({ className }: { className?: string }) {
  return (
    <svg
      width='141'
      height='141'
      viewBox='0 0 141 141'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
    >
      <title>List View</title>
      <path
        d='M17 19C17 14.0294 21.0294 10 26 10H39C43.9706 10 48 14.0294 48 19V32C48 36.9706 43.9706 41 39 41H26C21.0294 41 17 36.9706 17 32V19Z'
        fill='currentColor'
        fill-opacity='0.2'
      />
      <path
        d='M39 33V41H26L26 33H39ZM40 32V19C40 18.4477 39.5523 18 39 18H26C25.4477 18 25 18.4477 25 19V32C25 32.5523 25.4477 33 26 33L26 41C21.0294 41 17 36.9706 17 32V19C17 14.1847 20.7817 10.2526 25.5371 10.0117L26 10H39L39.4629 10.0117C44.2183 10.2526 48 14.1847 48 19V32L47.9883 32.4629C47.7474 37.2183 43.8153 41 39 41V33C39.5523 33 40 32.5523 40 32Z'
        fill='currentColor'
      />
      <path
        d='M119.5 21C121.985 21 124 23.0147 124 25.5C124 27.9853 121.985 30 119.5 30H47.5C45.0147 30 43 27.9853 43 25.5C43 23.0147 45.0147 21 47.5 21H119.5Z'
        fill='currentColor'
      />
      <path
        d='M17 109C17 104.029 21.0294 100 26 100H39C43.9706 100 48 104.029 48 109V122C48 126.971 43.9706 131 39 131H26C21.0294 131 17 126.971 17 122V109Z'
        fill='currentColor'
        fill-opacity='0.2'
      />
      <path
        d='M39 123V131H26L26 123H39ZM40 122V109C40 108.448 39.5523 108 39 108H26C25.4477 108 25 108.448 25 109V122C25 122.552 25.4477 123 26 123L26 131C21.0294 131 17 126.971 17 122V109C17 104.185 20.7817 100.253 25.5371 100.012L26 100H39L39.4629 100.012C44.2183 100.253 48 104.185 48 109V122L47.9883 122.463C47.7474 127.218 43.8153 131 39 131V123C39.5523 123 40 122.552 40 122Z'
        fill='currentColor'
      />
      <path
        d='M119.5 111C121.985 111 124 113.015 124 115.5C124 117.985 121.985 120 119.5 120H47.5C45.0147 120 43 117.985 43 115.5C43 113.015 45.0147 111 47.5 111H119.5Z'
        fill='currentColor'
      />
      <path
        d='M17 64C17 59.0294 21.0294 55 26 55H39C43.9706 55 48 59.0294 48 64V77C48 81.9706 43.9706 86 39 86H26C21.0294 86 17 81.9706 17 77V64Z'
        fill='currentColor'
        fill-opacity='0.2'
      />
      <path
        d='M39 78V86H26L26 78H39ZM40 77V64C40 63.4477 39.5523 63 39 63H26C25.4477 63 25 63.4477 25 64V77C25 77.5523 25.4477 78 26 78L26 86C21.0294 86 17 81.9706 17 77V64C17 59.1847 20.7817 55.2526 25.5371 55.0117L26 55H39L39.4629 55.0117C44.2183 55.2526 48 59.1847 48 64V77L47.9883 77.4629C47.7474 82.2183 43.8153 86 39 86V78C39.5523 78 40 77.5523 40 77Z'
        fill='currentColor'
      />
      <path
        d='M119.5 66C121.985 66 124 68.0147 124 70.5C124 72.9853 121.985 75 119.5 75H47.5C45.0147 75 43 72.9853 43 70.5C43 68.0147 45.0147 66 47.5 66H119.5Z'
        fill='currentColor'
      />
    </svg>
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
