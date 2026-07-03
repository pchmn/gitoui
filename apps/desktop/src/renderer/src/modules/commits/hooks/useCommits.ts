import type { Commit } from '@gitoui/contracts/git';
import type { QueryCollectionUtils } from '@tanstack/query-db-collection';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import type { Collection } from '@tanstack/react-db';
import { createCollection, useLiveQuery } from '@tanstack/react-db';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Query key factory for the commit list. Scoped to the repo path so it invalidates correctly on repo/branch switch. */
export const commitsKey = (repoPath: string) => ['commits', repoPath] as const;

/** Page size for both the initial load and every subsequent load-more request (issue #44). */
export const PAGE_LIMIT = 300;

/**
 * TanStack DB's `queryCollectionOptions` (no `schema` given) wants a mutable item type — `Commit`
 * (from `effect/Schema`, all-`readonly`) doesn't satisfy that structurally. A local mutable mirror,
 * not a redefinition: assignable both ways, so `window.git.listCommits`'s readonly result still
 * flows in unchanged.
 */
type CommitRow = { -readonly [K in keyof Commit]: Commit[K] };

/**
 * The offset cursor for the *next* page, kept alongside the collection instance rather than in the
 * component (issue #44, the query-backed-collection glue, docs/decisions.md §6/§8). A plain mutable
 * object (not React state) because it's an implementation detail of "what to ask for next" — the
 * loaded rows themselves are the collection; `hasNextPage`/`isFetchingNextPage` are the only bits
 * the UI needs to react to, so those alone are state.
 */
type Cursor = { skip: number };

/**
 * The `commits` collection (`queryCollectionOptions`), fed page-by-page from `listCommits`. The
 * `queryFn` always fetches **page 1** (`skip: 0`) — mounting and `invalidateQueries(commitsKey)`
 * (repo/Branch switch, decision kept from issue #42) both replace the collection's entire contents
 * with that first page, which is exactly the "reset the loaded window" rule. `fetchNextPage` is the
 * separate, additive path: it fetches one more page at the current cursor and `writeUpsert`s it
 * into the collection directly (bypassing TanStack Query, per `QueryCollectionUtils`), so pages
 * accumulate (append, dedup by `sha`) instead of replacing.
 *
 * Mirrors `useBranches` in shape — disabled when no Repository is open.
 */
export function useCommits(repoPath: string | null): {
  data: CommitRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** `false` once a page has come back shorter than `PAGE_LIMIT` — the real end of history. */
  hasNextPage: boolean;
  /** A page is in flight for the load-more path (not the initial/reset load — that's `isLoading`). */
  isFetchingNextPage: boolean;
  /** Request the next page at the current cursor. No-op while fetching or once history is exhausted. */
  fetchNextPage: () => void;
  /**
   * Bumps every time a fresh page 1 replaces the loaded window (mount, repo switch, branch-switch
   * invalidation) — the signal that a retained scroll offset now points into rows that may no
   * longer exist. Load-more appends never bump it.
   */
  resetToken: number;
} {
  const queryClient = useQueryClient();
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  // A repo switch resets the window optimistically (before the new page-1 fetch resolves) so the
  // previous repo's `hasNextPage`/`isFetchingNextPage` never leaks into the new one, even briefly.
  useEffect(() => {
    setHasNextPage(true);
    setIsFetchingNextPage(false);
  }, [repoPath]);

  const page = useMemo((): {
    collection: Collection<CommitRow, string | number, QueryCollectionUtils<CommitRow>>;
    cursor: Cursor;
  } | null => {
    if (repoPath === null) return null;
    const cursor: Cursor = { skip: 0 };
    const collection = createCollection(
      queryCollectionOptions<CommitRow>({
        queryKey: commitsKey(repoPath),
        // Always page 1 — both the initial mount and every `invalidateQueries(commitsKey)` refetch
        // land here, and `queryCollectionOptions` treats the result as the *complete* collection
        // state, so this doubles as the "reset to page 1" behavior for free.
        queryFn: async () => {
          const rows: CommitRow[] = [
            ...(await window.git.listCommits({ repoPath, skip: 0, limit: PAGE_LIMIT })),
          ];
          cursor.skip = rows.length;
          setHasNextPage(rows.length === PAGE_LIMIT);
          setIsFetchingNextPage(false);
          setResetToken((token) => token + 1);
          return rows;
        },
        getKey: (commit) => commit.sha,
        queryClient,
      }),
    );
    return { collection, cursor };
  }, [repoPath, queryClient]);

  const collection = page?.collection ?? null;

  const fetchNextPage = useCallback(() => {
    if (page === null || repoPath === null || !hasNextPage || isFetchingNextPage) return;
    const { collection, cursor } = page;
    setIsFetchingNextPage(true);
    void (async () => {
      try {
        const rows: CommitRow[] = [
          ...(await window.git.listCommits({ repoPath, skip: cursor.skip, limit: PAGE_LIMIT })),
        ];
        collection.utils.writeUpsert(rows);
        cursor.skip += rows.length;
        setHasNextPage(rows.length === PAGE_LIMIT);
      } catch {
        // Leave `hasNextPage` untouched — a transient failure can be retried by scrolling again.
      } finally {
        setIsFetchingNextPage(false);
      }
    })();
  }, [page, repoPath, hasNextPage, isFetchingNextPage]);

  // A collection is an unordered key→value store keyed by `sha`, so a bare `q.from` iterates in the
  // collection's internal (sha) order, *not* `git log`'s order — hence the explicit `orderBy`. We
  // sort by `committedAt` desc to mirror `git log`, which orders by commit date (the row still shows
  // the *authored* date, exactly as `git log`'s `Date:` line does). Topological ordering comes with
  // the lanes slice; commit-date desc is the right approximation for this flat skeleton.
  //
  // `[collection]` is load-bearing: `useLiveQuery`'s builder form only recompiles when its deps
  // array changes (default `[]` ⇒ compiled once, frozen onto the first collection). On a repo
  // switch `useMemo` mints a *new* collection, so without this dep the live query keeps reading the
  // previous repo's collection and the graph never updates. A branch switch keeps the same
  // collection instance and refreshes via `invalidateQueries(commitsKey)` instead (see the branch
  // mutations) — that path drives the collection's own QueryObserver, no recompile needed.
  const { data, isLoading } = useLiveQuery(
    (q) =>
      collection
        ? q.from({ commits: collection }).orderBy(({ commits }) => commits.committedAt, 'desc')
        : undefined,
    [collection],
  );

  // `useLiveQuery`'s own `isError` only reflects the live-query collection's own sync (always
  // succeeds — it just relays the source); the underlying `listCommits` query's failure surfaces
  // on the source collection's `utils.isError` instead (the query-db-collection glue, decisions §6/§8).
  return {
    data,
    isLoading,
    isError: collection?.utils.isError ?? false,
    hasNextPage: page === null ? false : hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    resetToken,
  };
}
