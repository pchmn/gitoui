import type { Branch } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import type { GitError } from '#renderer/shared/git/errors';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { useBranches } from '../hooks/useBranches';
import { AheadBehindBadge } from './AheadBehindBadge';

/**
 * Flat, read-only list of local Branches rendered in the Repository rail (issue #23).
 * Current Branch is pinned to top with Accent Surface + primary status dot. Branches with an
 * upstream show ahead/behind via `AheadBehindBadge`. The `filter` (case-insensitive substring on
 * name) is owned by the rail's global filter and passed in — the rail filters every section, not
 * just this one. Loading shows skeleton rows; empty shows a hint; error shows a quiet inline
 * message; Detached HEAD shows a banner with no current marker. Interaction (select/switch) is
 * deferred to the next slice.
 */
export function BranchesSection({ filter }: { filter: string }) {
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
      RepoNotFoundError: (e) => `Repository not found: ${e.path}`,
      _: () => 'Failed to load branches.',
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
  // NOTE: tree view (slice #4) sorts differently — keep this isolated.
  const sorted = [...branches].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Filter: case-insensitive substring on name.
  const filtered =
    filter.trim() === ''
      ? sorted
      : sorted.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      {/* Detached HEAD banner — no branch is current here (all isCurrent are false). */}
      {isDetached && (
        <div
          className='mx-2 mb-1 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground'
          aria-live='polite'
        >
          detached @ {head.sha.slice(0, 7)}
        </div>
      )}

      {/* Empty state — quiet Muted-Ink hint. */}
      {filtered.length === 0 && (
        <p className='px-3 py-1.5 text-xs text-muted-foreground'>
          {branches.length === 0 ? 'No branches yet.' : 'No branches match filter.'}
        </p>
      )}

      {/* Branch list */}
      <ul className='flex flex-col'>
        {filtered.map((branch) => (
          <BranchRow key={branch.name} branch={branch} isDetached={isDetached} />
        ))}
      </ul>
    </>
  );
}

/** Single branch row — Accent Surface + primary dot when current; Muted Surface on hover. */
function BranchRow({ branch, isDetached }: { branch: Branch; isDetached: boolean }) {
  // In Detached HEAD mode all isCurrent are false — no current marker.
  const isCurrent = !isDetached && branch.isCurrent;

  return (
    <li
      className={cn(
        'flex h-7 cursor-default select-none items-center gap-2 px-3 text-xs hover:bg-muted',
        isCurrent && 'bg-accent',
      )}
      aria-current={isCurrent ? 'true' : undefined}
    >
      {/* Status dot — primary color when current, muted otherwise */}
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          isCurrent ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1 truncate'>{branch.name}</span>
      <AheadBehindBadge upstream={branch.upstream} ahead={branch.ahead} behind={branch.behind} />
    </li>
  );
}

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
