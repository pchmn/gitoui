import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { useBranches } from '../hooks/useBranches';
import { BranchRow } from './BranchRow';
import { BranchTreeView } from './BranchTreeView';

/**
 * Flat list (or recursive tree) of local Branches rendered in the Repository rail (issue #23 +
 * #24 + #25). In flat mode, current Branch is pinned to top. In tree mode, Branches are grouped
 * by `/`-separated prefix; current branch sits at its natural alpha position and its ancestor
 * folders are auto-expanded. The `filter` (case-insensitive substring on name) is owned by the
 * rail's global filter and passed in. Loading shows skeleton rows; empty shows a hint; error shows
 * a quiet inline message; Detached HEAD shows a banner with no current marker.
 *
 * Interactions (issue #24): single-click = select (UI focus, for the future graph), double-click =
 * Switch (move HEAD). "Select" ≠ "Switch" — do not conflate in code or copy.
 */
export function BranchesSection({
  filter,
  viewMode = 'flat',
}: {
  filter: string;
  viewMode?: 'flat' | 'tree';
}) {
  const { root } = useActiveRepository();
  const { data: branchList, isPending, isError, error } = useBranches(root);

  if (root === null) return null;

  // Loading state — show skeleton rows, no spinner.
  if (isPending) {
    return <BranchesSkeleton />;
  }

  // Error state — quiet inline message via matchError.
  if (isError) {
    const message = matchError<GitError<'listBranches'>, string>(error, {
      RepoNotFoundError: (e) => messages.branchesSection.repoNotFound(e.path),
      _: () => messages.branchesSection.failedToLoad,
    });
    return (
      <p className='px-3 py-2 text-xs text-muted-foreground' role='alert'>
        {message}
      </p>
    );
  }

  const { branches, head } = branchList;
  const isDetached = head._tag === 'Detached';

  // Flat sort: current Branch pinned to top, then alpha by name (localeCompare).
  // In tree mode, buildTree handles ordering (leaves first, alpha) — keep this isolated.
  const sorted = [...branches].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Filter: case-insensitive substring on name (flat mode only; tree mode filters inside BranchTreeView).
  const filtered =
    filter.trim() === ''
      ? sorted
      : sorted.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  // Empty state: for tree mode, check the unfiltered set (BranchTreeView handles its own filtering).
  // For flat mode, check the filtered set.
  const treeHasMatches =
    filter.trim() === ''
      ? branches.length > 0
      : branches.some((b) => b.name.toLowerCase().includes(filter.toLowerCase()));
  const isEmpty = viewMode === 'tree' ? !treeHasMatches : filtered.length === 0;

  return (
    <>
      {/* Detached HEAD banner — no branch is current here (all isCurrent are false). The canonical
          `detached @ <sha>` line leads; a quiet hint below explains the state for the CLI-wary. */}
      {isDetached && (
        <div className='mx-2 mb-1 rounded-sm bg-muted px-2 py-1.5 text-xs' aria-live='polite'>
          <span className='font-medium text-foreground'>
            {messages.branchesSection.detached(head.sha.slice(0, 7))}
          </span>
          <span className='mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground'>
            {messages.branchesSection.detachedHint}
          </span>
        </div>
      )}

      {/* Empty state — quiet Muted-Ink hint. */}
      {isEmpty && (
        <p className='px-3 py-1.5 text-xs text-muted-foreground'>
          {branches.length === 0
            ? messages.branchesSection.emptyYet
            : messages.branchesSection.emptyFiltered}
        </p>
      )}

      {/* Tree view (issue #25) or flat list. */}
      {viewMode === 'tree' && !isEmpty ? (
        <BranchTreeView branches={branches} head={head} filter={filter} isDetached={isDetached} />
      ) : viewMode === 'flat' && !isEmpty ? (
        /* Branch list — div[role="listbox"] so child rows can use aria-selected (ARIA 1.2).
           Native <ul> cannot carry role="listbox" per Biome noNoninteractiveElementToInteractiveRole. */
        <div role='listbox' aria-label='Branches' className='flex flex-col'>
          {filtered.map((branch) => (
            <BranchRow key={branch.name} branch={branch} isDetached={isDetached} />
          ))}
        </div>
      ) : null}
    </>
  );
}

// Re-export BranchRow so consumers can import it from this module if preferred.
export { BranchRow } from './BranchRow';

/** Skeleton rows shown during loading (no spinner — skeletons over spinners per issue #23). */
function BranchesSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading branches'>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className='flex h-6 items-center gap-2'>
          <span className='size-1.5 shrink-0 rounded-full bg-muted-foreground/20' />
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${60 + (i % 3) * 20}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
