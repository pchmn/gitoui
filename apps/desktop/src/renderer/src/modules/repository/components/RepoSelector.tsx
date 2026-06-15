import type { RecentRepository } from '@gitoui/contracts/desktop';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@gitoui/ui/combobox';
import { IdentityAvatar } from '@gitoui/ui/identity-avatar';
import { cn } from '@gitoui/ui/lib/utils';
import { FolderOpenIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useActiveRepository } from '../ActiveRepositoryContext';
import { useActivateRepository } from '../hooks/useActivateRepository';
import { useOpenRepository } from '../hooks/useOpenRepository';
import { useRecentRepositories } from '../hooks/useRecentRepositories';
import { useRemoveRecentRepository } from '../hooks/useRemoveRecentRepository';

/** The Repository's display name = the basename of its canonical root (epic decision #3). */
function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

/**
 * The top-bar Repository selector (issue #9), composed from the reusable Combobox; it stays app-side
 * because it knows recents + IPC. The trigger shows the active Repository's avatar + name (a muted
 * "Open repository" CTA when none); the dropdown filters recents in MRU order (avatar, name, path
 * subtitle, a check on the active one) with an "Open repository…" footer. Clicking a recent switches
 * the active Repository (resolve → activate → touch); no git is spawned for inactive recents.
 */
export function RepoSelector() {
  const { root } = useActiveRepository();
  const { data: recents = [] } = useRecentRepositories();
  const { mutate: activate } = useActivateRepository();
  const { mutate: removeRecent } = useRemoveRecentRepository();
  const { openRepository } = useOpenRepository();
  const [open, setOpen] = useState(false);

  const active = recents.find((repo) => repo.path === root) ?? null;
  const activeName = root === null ? null : basename(root);

  return (
    <Combobox
      items={recents}
      value={active}
      onValueChange={(repo: RecentRepository | null) => {
        if (repo && repo.path !== root) activate(repo.path);
      }}
      isItemEqualToValue={(a: RecentRepository, b: RecentRepository) => a.path === b.path}
      itemToStringLabel={(repo: RecentRepository) => `${basename(repo.path)} ${repo.path}`}
      open={open}
      onOpenChange={setOpen}
    >
      <ComboboxTrigger
        className={cn(
          'no-drag flex h-8 max-w-64 items-center gap-2 rounded-md px-2 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-muted',
          activeName === null ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {activeName === null ? (
          <>
            <FolderOpenIcon className='size-3.5' />
            <span>Open repository</span>
          </>
        ) : (
          <>
            <IdentityAvatar name={activeName} seed={root ?? activeName} className='size-4' />
            <span className='min-w-0 truncate'>{activeName}</span>
          </>
        )}
      </ComboboxTrigger>

      <ComboboxContent className='w-72'>
        <ComboboxInput placeholder='Filter repositories…' />
        <ComboboxEmpty>No repositories found.</ComboboxEmpty>
        <ComboboxList>
          {(repo: RecentRepository) => {
            const name = basename(repo.path);
            return (
              <ComboboxItem
                key={repo.path}
                value={repo}
                className="group gap-2.5 [&[data-highlighted]_[data-slot='combobox-item-indicator']]:hidden"
              >
                <IdentityAvatar name={name} seed={repo.path} />
                <span className='flex min-w-0 flex-col'>
                  <span className='truncate text-foreground'>{name}</span>
                  <span className='truncate text-[0.625rem] text-muted-foreground'>
                    {repo.path}
                  </span>
                </span>
                {/* Manual remove (issue #10): revealed on hover / keyboard highlight, takes the
                    active check's slot. stopPropagation keeps the click from selecting the row
                    (which would re-resolve and re-add the very entry we're dropping). */}
                <button
                  type='button'
                  aria-label={`Remove ${name} from recents`}
                  tabIndex={-1}
                  className='ml-auto hidden size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground group-data-highlighted:flex hover:bg-muted hover:text-foreground'
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeRecent(repo.path);
                  }}
                >
                  <XIcon className='size-3' />
                </button>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
        <div className='border-t border-border p-1'>
          <button
            type='button'
            className='flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs/relaxed text-foreground outline-none select-none hover:bg-muted focus-visible:bg-muted'
            onClick={() => {
              setOpen(false);
              openRepository();
            }}
          >
            <FolderOpenIcon className='size-3.5 text-muted-foreground' />
            Open repository…
          </button>
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
