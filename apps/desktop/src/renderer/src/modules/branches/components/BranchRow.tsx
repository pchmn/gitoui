import type { Branch } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useSelection } from '#renderer/core/shell/SelectionContext';
import { messages } from '#renderer/shared/messages/messages';
import { useSwitchBranch } from '../hooks/useSwitchBranch';
import { AheadBehindBadge } from './AheadBehindBadge';

/**
 * Single branch row — Accent Surface + primary dot when current; selected ring when focused via
 * single-click; Muted Surface on hover. Both `isCurrent` and `isSelected` can be true at once.
 *
 * Single-click = select (UI focus); double-click = Switch (move HEAD). Double-click on the current
 * Branch is a no-op (already checked out). No timer or debounce — selecting then switching the same
 * row is harmless. A non-current row also reveals an explicit **Switch** button on hover / focus
 * (mirroring the Changes-row `+`/`−` affordance): it makes the switch gesture discoverable for the
 * mouse and gives keyboard users the path double-click can't (the row's own Enter/Space only ever
 * selects).
 *
 * Shared between flat list (BranchesSection) and tree view (BranchTreeView) as leaves. Flat mode
 * shows the full `branch.name`; tree mode passes `label={segment}` so the leaf reads as just its
 * own path segment under its folder (the full name stays available as the row `title`).
 *
 * Selection is keyed by `{ kind: 'branch', id: branch.name }` so a Tag and a Branch sharing a
 * name don't both highlight (issue #33).
 */
export function BranchRow({
  branch,
  isDetached,
  label,
}: {
  branch: Branch;
  isDetached: boolean;
  label?: string;
}) {
  const { isSelected, select } = useSelection();
  const { mutate: switchBranch } = useSwitchBranch();

  const sel = { kind: 'branch' as const, id: branch.name };

  // In Detached HEAD mode all isCurrent are false — no current marker.
  const isCurrent = !isDetached && branch.isCurrent;
  const isRowSelected = isSelected(sel);

  function handleClick() {
    select(sel);
  }

  function handleDoubleClick() {
    // Double-click on the current branch is a no-op.
    if (isCurrent) return;
    switchBranch(branch.name);
  }

  return (
    // div[role="option"] is valid inside div[role="listbox"]; supports aria-selected + aria-current.
    // Native <li> cannot carry role="option" per Biome noNoninteractiveElementToInteractiveRole.
    // onKeyDown handles keyboard activation (Enter/Space = select) for keyboard-only navigation.
    <div
      role='option'
      className={cn(
        'group relative flex h-7 cursor-default select-none items-center gap-1.5 rounded-sm px-3 text-xs outline-none hover:bg-muted focus-within:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
        isCurrent && 'bg-accent',
        isRowSelected && 'ring-1 ring-inset ring-primary/50',
      )}
      aria-current={isCurrent ? 'true' : undefined}
      aria-selected={isRowSelected}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Status dot — primary color when current, muted otherwise. Wrapped in a size-3 slot
          (the chevron's footprint) so the dot's center aligns with a folder row's caret in tree
          view, and leaf/folder labels line up. */}
      <span className='flex size-3 shrink-0 items-center justify-center' aria-hidden='true'>
        <span
          className={cn(
            'size-1.5 rounded-full',
            isCurrent ? 'bg-primary' : 'bg-muted-foreground/40',
          )}
        />
      </span>
      <span className='min-w-0 flex-1 truncate' title={branch.name}>
        {label ?? branch.name}
      </span>
      <span className='relative flex shrink-0 items-center'>
        {/* Switch action — hidden at rest, revealed on hover / focus just left of the badge with a
            gradient fade so it never shifts the name (mirrors the Changes-row `+`/`−`). It's a real
            focusable button, so it's the keyboard path to switch. Not rendered on the current
            branch (nothing to switch to). */}
        {!isCurrent && (
          <span className='pointer-events-none absolute inset-y-0 right-full flex items-center bg-linear-to-r from-transparent to-muted to-40% pr-1.5 pl-8 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 motion-safe:transition-opacity motion-safe:duration-150'>
            <button
              type='button'
              aria-label={messages.branchesSection.switchAction(branch.name)}
              title={messages.branchesSection.switchAction(branch.name)}
              className='flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40'
              onClick={(e) => {
                e.stopPropagation();
                switchBranch(branch.name);
              }}
            >
              <ArrowRightIcon weight='bold' className='size-3.5' />
            </button>
          </span>
        )}
        <AheadBehindBadge upstream={branch.upstream} ahead={branch.ahead} behind={branch.behind} />
      </span>
    </div>
  );
}
