import type { Ref } from '@gitoui/contracts/git';
import { IdentityAvatar } from '@gitoui/ui/identity-avatar';
import { RefPill } from '@gitoui/ui/ref-pill';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { formatRelativeTime } from '#renderer/shared/utils/relativeTime';
import { useCommits } from '../hooks/useCommits';

/** Fixed row height (DESIGN.md dense Label-size row) — `estimateSize` doesn't need to be exact, but this is. */
const ROW_HEIGHT_PX = 32;

/** Request the next page once the loaded window is within this many rows of the visible end. */
const LOAD_MORE_THRESHOLD = 20;

/**
 * The Commit graph: history for the current Branch (HEAD), one dense row per Commit, virtualized
 * (TanStack Virtual — only visible rows mount) and paged incrementally (issue #44): `useCommits`
 * loads a first page instantly, and scrolling toward the loaded end requests the next one. Columns
 * per DESIGN.md `GRAPH · REFS` / `COMMIT` / `AUTHOR` — GRAPH · REFS carries the Refs sitting on each
 * Commit as pills (issue #43; lanes come in a later slice), COMMIT shows the subject, AUTHOR shows
 * the author's circular avatar + name + a relative date. No row selection — that lands with the
 * lanes slice.
 *
 * Mirrors `BranchesSection`'s loading/error/empty states, adapted to the center column: skeleton
 * rows on pending (no spinner), a centered "No commits yet" empty state, and — since the primary
 * content here is what failed, not an out-of-band event — a centered inline `role="alert"` message
 * via `matchError` with a retry, never a toast.
 */
export function CommitGraph({ root }: { root: string }) {
  const {
    data: commits,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    retry,
  } = useCommits(root);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount = commits?.length ?? 0;
  // One extra virtual row for the discreet loader / end-of-history terminus, shown only when there's
  // something to say — an idle "more pages available, not fetching yet" state renders nothing.
  const showFooterRow = isFetchingNextPage || !hasNextPage;
  const virtualizer = useVirtualizer({
    count: rowCount + (showFooterRow ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // A different Commit at the head of the list means a different history (repo or Branch switch —
  // load-more appends never touch the head), so a scroll offset retained from the previous one
  // would be meaningless: snap back to the top. `scrollToOffset` (not a bare `scrollTop` write)
  // so the virtualizer's internal offset updates in the same tick.
  const headSha = commits?.[0]?.sha;
  const lastHeadSha = useRef(headSha);
  useEffect(() => {
    if (lastHeadSha.current === headSha) return;
    lastHeadSha.current = headSha;
    virtualizer.scrollToOffset(0);
  }, [headSha, virtualizer]);

  // Trigger the next page once the viewport nears the end of the loaded set.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const lastItem = virtualItems.at(-1);
    if (!lastItem) return;
    if (lastItem.index >= rowCount - 1 - LOAD_MORE_THRESHOLD) {
      fetchNextPage();
    }
  }, [virtualItems, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Loading state — show skeleton rows, no spinner. Only without data: growing the loaded window
  // recompiles the live query, and the already-loaded rows must keep showing through it.
  if (isLoading && (commits === undefined || commits.length === 0)) {
    return <CommitGraphSkeleton />;
  }

  // Error state — inline (not a toast: the primary content here IS what failed, so the user is
  // already looking at it) and centered, with the typed error phrased via `matchError` and a retry
  // that clears the collection's error state and re-fetches the failing subset.
  if (isError) {
    const message = matchError<GitError<'listCommits'>, string>(error, {
      RepoNotFoundError: (e) => messages.commitGraph.repoNotFound(e.path),
      _: () => messages.commitGraph.failedToLoad,
    });
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2 px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground' role='alert'>
          {message}
        </p>
        <button
          type='button'
          onClick={retry}
          className='rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted'
        >
          {messages.commitGraph.retry}
        </button>
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <div className='flex h-full items-center justify-center px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground'>{messages.commitGraph.emptyYet}</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className='h-full overflow-auto'>
      <ul
        className='relative w-full'
        style={{ height: virtualizer.getTotalSize() }}
        aria-label='Commits'
      >
        {virtualItems.map((virtualRow) => {
          const style = {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: virtualRow.size,
            transform: `translateY(${virtualRow.start}px)`,
          };

          // The trailing virtual row (only present when `showFooterRow`) carries the load-more
          // indicator or the quiet end-of-history terminus — no fanfare either way.
          if (virtualRow.index >= rowCount) {
            return (
              <li
                key='footer'
                style={style}
                className='flex items-center justify-center text-xs text-muted-foreground'
                aria-live='polite'
              >
                {isFetchingNextPage
                  ? messages.commitGraph.loadingMore
                  : messages.commitGraph.endOfHistory}
              </li>
            );
          }

          const commit = commits[virtualRow.index];
          if (!commit) return null;

          return (
            <li
              key={commit.sha}
              style={style}
              className='flex items-center gap-3 border-b border-border/50 px-3 text-xs'
            >
              {/* GRAPH · REFS column — ref pills on decorated Commits (lanes come in a later slice). */}
              {commit.refs.length === 0 ? (
                <span className='w-4 shrink-0' aria-hidden='true' />
              ) : (
                <span className='flex shrink-0 items-center gap-1'>
                  {commit.refs.map((ref) => (
                    <RefPill
                      key={`${ref._tag}:${refLabel(ref)}`}
                      emphasis={refEmphasis(ref)}
                      title={refLabel(ref)}
                    >
                      {refLabel(ref)}
                    </RefPill>
                  ))}
                </span>
              )}
              <span className='min-w-0 flex-1 truncate' title={commit.subject}>
                {commit.subject}
              </span>
              <span className='flex shrink-0 items-center gap-1.5 text-muted-foreground'>
                <IdentityAvatar
                  name={commit.author.name}
                  seed={commit.author.email}
                  shape='circle'
                />
                <span className='max-w-32 truncate'>{commit.author.name}</span>
                <span className='shrink-0'>{formatRelativeTime(commit.authoredAt)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Pill text for a Ref. `Head` is the Detached-HEAD marker; every other variant carries its name. */
function refLabel(ref: Ref): string {
  return ref._tag === 'Head' ? 'HEAD' : ref.name;
}

/**
 * DESIGN §Ref pills: the current Branch and Detached HEAD take the stronger tint; remote-tracking
 * Branches and Tags read quieter; other local Branches sit on the default Accent Surface.
 */
function refEmphasis(ref: Ref): 'strong' | 'default' | 'quiet' {
  switch (ref._tag) {
    case 'Branch':
      return ref.current ? 'strong' : 'default';
    case 'Head':
      return 'strong';
    case 'RemoteBranch':
    case 'Tag':
      return 'quiet';
  }
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
