import { IdentityAvatar } from '@gitoui/ui/identity-avatar';
import { messages } from '#renderer/shared/messages/messages';
import { formatRelativeTime } from '#renderer/shared/utils/relativeTime';
import { useCommits } from '../hooks/useCommits';

/**
 * The Commit graph's walking skeleton (issue #42): a flat, non-virtualized list of the current
 * Branch's history (HEAD), one dense row per Commit. Columns per DESIGN.md `GRAPH · REFS` /
 * `COMMIT` / `AUTHOR` — in this slice GRAPH · REFS is empty (no lanes, no ref pills yet), COMMIT
 * shows the subject, AUTHOR shows the author's circular avatar + name + a relative date. No row
 * selection — that lands with the lanes/ref-pills slices.
 *
 * Mirrors `BranchesSection`'s loading/error/empty states: skeleton rows on pending, a quiet
 * `role="alert"` inline message via `matchError` on error, an empty hint when the Repository has
 * no commits.
 */
export function CommitGraph({ root }: { root: string }) {
  const { data: commits, isLoading, isError } = useCommits(root);

  // Loading state — show skeleton rows, no spinner.
  if (isLoading) {
    return <CommitGraphSkeleton />;
  }

  // Error state — quiet inline message. The collection surfaces the underlying `unknown` error,
  // so this stays a generic message rather than a `matchError` narrowing (TanStack DB wraps the
  // thrown error rather than passing it through verbatim).
  if (isError) {
    return (
      <p className='px-3 py-2 text-xs text-muted-foreground' role='alert'>
        {messages.commitGraph.failedToLoad}
      </p>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <p className='px-3 py-2 text-xs text-muted-foreground'>{messages.commitGraph.emptyYet}</p>
    );
  }

  return (
    <ul className='flex flex-col' aria-label='Commits'>
      {commits.map((commit) => (
        <li
          key={commit.sha}
          className='flex h-8 items-center gap-3 border-b border-border/50 px-3 text-xs'
        >
          {/* GRAPH · REFS column — empty in this slice (no lanes, no ref pills yet). */}
          <span className='w-4 shrink-0' aria-hidden='true' />
          <span className='min-w-0 flex-1 truncate' title={commit.subject}>
            {commit.subject}
          </span>
          <span className='flex shrink-0 items-center gap-1.5 text-muted-foreground'>
            <IdentityAvatar name={commit.author.name} seed={commit.author.email} shape='circle' />
            <span className='max-w-32 truncate'>{commit.author.name}</span>
            <span className='shrink-0'>{formatRelativeTime(commit.authoredAt)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Skeleton rows shown during loading (no spinner — skeletons over spinners per the rail convention). */
function CommitGraphSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading commits'>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className='flex h-8 items-center gap-3'>
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${40 + (i % 4) * 15}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
