import type { Branch } from '@gitoui/contracts/git';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@gitoui/ui/combobox';
import { cn } from '@gitoui/ui/lib/utils';
import { GitBranchIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { useBranches } from '../hooks/useBranches';

/**
 * The top-bar Branch selector (issue #15): a filterable overlay listing local Branches with the
 * current one highlighted and ahead/behind badges per Branch. Read-only in this slice — clicking a
 * Branch does nothing (Switch lands in a later tranche). Detached HEAD shows `detached @ <sha>` as
 * the trigger with nothing highlighted. Composed from `@gitoui/ui` Combobox like `RepoSelector`,
 * with no changes to `@gitoui/ui` — ahead/behind badges are app-side spans.
 */
export function BranchSelector() {
  const { root } = useActiveRepository();
  const { data: branchList } = useBranches(root);
  const [open, setOpen] = useState(false);

  if (root === null || branchList === undefined) return null;

  const { branches, head } = branchList;
  const isDetached = head._tag === 'Detached';
  const currentBranchName = head._tag === 'OnBranch' ? head.branch : null;

  const triggerLabel = isDetached ? `detached @ ${head.sha}` : (currentBranchName ?? '');
  const currentBranch = branches.find((b) => b.isCurrent) ?? null;

  return (
    <Combobox
      items={branches}
      value={currentBranch}
      onValueChange={() => {
        // Switch lands in a later tranche — no-op for now.
      }}
      isItemEqualToValue={(a: Branch, b: Branch) => a.name === b.name}
      itemToStringLabel={(b: Branch) => b.name}
      open={open}
      onOpenChange={setOpen}
    >
      <ComboboxTrigger
        className={cn(
          'no-drag flex h-8 max-w-48 items-center gap-2 rounded-md px-2 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-muted',
          isDetached ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        <GitBranchIcon className='size-3.5 shrink-0' />
        <span className='min-w-0 truncate'>{triggerLabel}</span>
      </ComboboxTrigger>

      <ComboboxContent className='w-72'>
        <ComboboxInput placeholder='Filter branches…' />
        <ComboboxEmpty>No branches found.</ComboboxEmpty>
        <ComboboxList>
          {/* The group label is hidden when the filter empties the list so it never sits above the
              "No branches found" message. Items render through `ComboboxCollection` (not a raw map)
              so the search input actually filters them — Base UI filters its own `items`. */}
          <ComboboxGroup className='group-data-empty/combobox-content:hidden'>
            <ComboboxGroupLabel>LOCAL</ComboboxGroupLabel>
            <ComboboxCollection>
              {(branch: Branch) => (
                <ComboboxItem key={branch.name} value={branch} className='gap-2'>
                  <span className='min-w-0 flex-1 truncate'>{branch.name}</span>
                  <AheadBehindBadge ahead={branch.ahead} behind={branch.behind} />
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** App-side ahead/behind badge — no `@gitoui/ui` change (issue #15 constraint). */
function AheadBehindBadge({ ahead, behind }: { ahead: number; behind: number }) {
  if (ahead === 0 && behind === 0) return null;
  return (
    <span className='ml-auto flex shrink-0 items-center gap-0.5 text-[0.625rem] text-muted-foreground'>
      {ahead > 0 && <span>↑{ahead}</span>}
      {behind > 0 && <span>↓{behind}</span>}
    </span>
  );
}
