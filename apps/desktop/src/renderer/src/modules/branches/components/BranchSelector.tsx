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
import { GitBranchIcon, PlusIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { useBranches } from '../hooks/useBranches';
import { useCreateBranch } from '../hooks/useCreateBranch';
import { useSwitchBranch } from '../hooks/useSwitchBranch';

/**
 * The top-bar Branch selector (issues #15 + #16 + #17): a filterable overlay listing local Branches
 * with the current one highlighted and ahead/behind badges per Branch. Clicking a non-current Branch
 * switches HEAD to it; a dirty Working tree that git refuses to overwrite surfaces a Toast. Detached
 * HEAD shows `detached @ <sha>` as the trigger with nothing highlighted. A "New branch from
 * <current>…" footer (OnBranch only) opens an inline name input that creates + switches in one step.
 * Composed from `@gitoui/ui` Combobox like `RepoSelector`, with no changes to `@gitoui/ui` —
 * ahead/behind badges are app-side spans.
 */
export function BranchSelector() {
  const { root } = useActiveRepository();
  const { data: branchList } = useBranches(root);
  const switchBranch = useSwitchBranch();
  const createBranch = useCreateBranch();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the name input when it mounts (i.e. when `creating` becomes true). Base UI re-asserts
  // focus on its popup while processing the footer-button click, so a synchronous focus here loses
  // the race — defer to the next frame, after Base UI has settled.
  useEffect(() => {
    if (!creating) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [creating]);

  if (root === null || branchList === undefined) return null;

  const { branches, head } = branchList;
  const isDetached = head._tag === 'Detached';
  const currentBranchName = head._tag === 'OnBranch' ? head.branch : null;

  const triggerLabel = isDetached ? `detached @ ${head.sha}` : (currentBranchName ?? '');
  const currentBranch = branches.find((b) => b.isCurrent) ?? null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reset creating state whenever the overlay closes.
    if (!next) setCreating(false);
  }

  function handleCreateClick() {
    // The input is focused by the `creating` effect once it mounts (Base UI focus race — see above).
    setCreating(true);
  }

  function handleCreateKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // The create input lives inside the Combobox alongside the filter input, so keep its keystrokes
    // from reaching Base UI's keyboard handling (type-ahead, list navigation, Escape-to-close).
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      setCreating(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const name = inputRef.current?.value.trim() ?? '';
      if (name.length === 0) return;
      createBranch.mutate(name, {
        onSuccess: () => {
          setOpen(false);
          setCreating(false);
        },
        // On error the hook's onError raises the Toast; leave input open so user can fix name.
      });
    }
  }

  return (
    <Combobox
      items={branches}
      value={currentBranch}
      onValueChange={(branch: Branch | null) => {
        // Ignore null and selecting the already-current Branch — skip the round-trip.
        if (branch === null || branch.isCurrent) return;
        setOpen(false);
        switchBranch.mutate(branch.name);
      }}
      isItemEqualToValue={(a: Branch, b: Branch) => a.name === b.name}
      itemToStringLabel={(b: Branch) => b.name}
      open={open}
      onOpenChange={handleOpenChange}
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
          {/* The group label is hidden when the filter empties the list so it never sits above
              the "No branches found" message. Items render through `ComboboxCollection` (not a
              raw map) so the search input actually filters them — Base UI filters its own
              `items`. */}
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
        {/* Footer: only render when HEAD is on a Branch (Detached HEAD is display-only this
            tranche). The button toggles to an inline name input in place, keeping the filter +
            list visible above as context for the branch-point. Mirrors RepoSelector's
            "Open repository…" footer layout. */}
        {currentBranchName !== null && (
          <div className='border-t border-border p-1'>
            {creating ? (
              <input
                ref={inputRef}
                // Mirror ComboboxInput's visual style so it reads as the same control.
                className='flex h-8 w-full rounded-sm border border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30'
                placeholder={`New branch from ${currentBranchName}…`}
                onKeyDown={handleCreateKeyDown}
              />
            ) : (
              <button
                type='button'
                className='flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs/relaxed text-foreground outline-none select-none hover:bg-muted focus-visible:bg-muted'
                onClick={handleCreateClick}
              >
                <PlusIcon className='size-3.5 text-muted-foreground' />
                New branch from {currentBranchName}…
              </button>
            )}
          </div>
        )}
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
