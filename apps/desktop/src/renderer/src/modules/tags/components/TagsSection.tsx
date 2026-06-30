import { cn } from '@gitoui/ui/lib/utils';
import { TagIcon } from '@phosphor-icons/react';
import { useSelection } from '#renderer/core/shell/SelectionContext';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useTags } from '../hooks/useTags';

/**
 * Flat read-only Tags section for the Repository rail (issue #35). Always flat — ignores the
 * rail-global flat/tree mode. Rows are selectable: `{ kind: 'tag', id: name }`.
 *
 * Filter matches on tag name and auto-expands the section. Loading shows skeleton rows; "No tags"
 * empty state mirrors `BranchesSection`. No annotated/lightweight distinction; no target sha.
 */
export function TagsSection({ filter }: { filter: string }) {
  const { root } = useActiveRepository();
  const { data: tagList, isPending, isError, error } = useTags(root);

  if (root === null) return null;

  // Loading state — show skeleton rows, no spinner.
  if (isPending) {
    return <TagsSkeleton />;
  }

  // Error state — quiet inline message via matchError.
  if (isError) {
    const message = matchError<GitError<'listTags'>, string>(error, {
      RepoNotFoundError: (e) => messages.tagsSection.repoNotFound(e.path),
      _: () => messages.tagsSection.failedToLoad,
    });
    return (
      <p className='px-3 py-2 text-xs text-muted-foreground' role='alert'>
        {message}
      </p>
    );
  }

  const { tags } = tagList;
  const lowerFilter = filter.toLowerCase().trim();

  // Filter: case-insensitive substring on name.
  const filtered =
    lowerFilter === '' ? tags : tags.filter((t) => t.name.toLowerCase().includes(lowerFilter));

  const isEmpty = filtered.length === 0;

  return (
    <>
      {/* Empty state — quiet Muted-Ink hint. */}
      {isEmpty && (
        <p className='px-3 py-1.5 text-xs text-muted-foreground'>
          {tags.length === 0 ? messages.tagsSection.emptyYet : messages.tagsSection.emptyFiltered}
        </p>
      )}

      {/* Flat tag list — always flat, ignores the rail-global flat/tree mode. */}
      {!isEmpty && (
        // px-2 inset mirrors RemotesSection/BranchTreeView so a tag row aligns with a remote row
        // (e.g. `origin`) rather than the section header.
        <div role='listbox' aria-label='Tags' className='flex flex-col px-2'>
          {filtered.map((tag) => (
            <TagRow key={tag.name} name={tag.name} />
          ))}
        </div>
      )}
    </>
  );
}

/** Single tag row — read-only, single-click = select. */
function TagRow({ name }: { name: string }) {
  const { isSelected, select } = useSelection();
  const sel = { kind: 'tag' as const, id: name };
  const isRowSelected = isSelected(sel);

  function handleClick() {
    select(sel);
  }

  return (
    <div
      role='option'
      className={cn(
        'flex h-7 cursor-default select-none items-center gap-1.5 px-3 text-xs hover:bg-muted rounded-sm',
        isRowSelected && 'ring-1 ring-inset ring-primary/50',
      )}
      aria-selected={isRowSelected}
      tabIndex={0}
      title={name}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Tag icon in a size-3 slot (the chevron/dot footprint) so it aligns with branch rows. */}
      <span className='flex size-3 shrink-0 items-center justify-center' aria-hidden='true'>
        <TagIcon className='size-3 text-muted-foreground/60' weight='fill' />
      </span>
      <span className='min-w-0 flex-1 truncate'>{name}</span>
    </div>
  );
}

/** Skeleton rows shown during loading (no spinner — skeletons over spinners per issue #23). */
function TagsSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading tags'>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className='flex h-6 items-center gap-2'>
          <span className='size-1.5 shrink-0 rounded-full bg-muted-foreground/20' />
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${55 + (i % 3) * 20}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
