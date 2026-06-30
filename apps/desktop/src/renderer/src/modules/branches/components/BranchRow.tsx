import type { Branch } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { useSelection } from '#renderer/core/shell/SelectionContext';
import { useSwitchBranch } from '../hooks/useSwitchBranch';
import { AheadBehindBadge } from './AheadBehindBadge';

/**
 * Single branch row — Accent Surface + primary dot when current; selected ring when focused via
 * single-click; Muted Surface on hover. Both `isCurrent` and `isSelected` can be true at once.
 *
 * Single-click = select (UI focus); double-click = Switch (move HEAD). Double-click on the current
 * Branch is a no-op (already checked out). No timer or debounce — selecting then switching the same
 * row is harmless.
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
        'flex h-7 cursor-default select-none items-center gap-2 px-3 text-xs hover:bg-muted rounded-sm',
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
      {/* Status dot — primary color when current, muted otherwise */}
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          isCurrent ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1 truncate' title={branch.name}>
        {label ?? branch.name}
      </span>
      <AheadBehindBadge upstream={branch.upstream} ahead={branch.ahead} behind={branch.behind} />
    </div>
  );
}
