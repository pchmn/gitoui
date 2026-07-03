import type { Commit } from '@gitoui/contracts/git';
import type { QueryCollectionUtils } from '@tanstack/query-db-collection';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import type { Collection } from '@tanstack/react-db';
import { createCollection, useLiveQuery } from '@tanstack/react-db';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

/** Query key factory for the commit list. Scoped to the repo path so it invalidates correctly on repo/branch switch. */
export const commitsKey = (repoPath: string) => ['commits', repoPath] as const;

/** First page only in this slice — no load-more yet (issue #42). */
const PAGE_LIMIT = 300;

/**
 * TanStack DB's `queryCollectionOptions` (no `schema` given) wants a mutable item type — `Commit`
 * (from `effect/Schema`, all-`readonly`) doesn't satisfy that structurally. A local mutable mirror,
 * not a redefinition: assignable both ways, so `window.git.listCommits`'s readonly result still
 * flows in unchanged.
 */
type CommitRow = { -readonly [K in keyof Commit]: Commit[K] };

/**
 * The first TanStack DB collection (`commits`), fed from a `listCommits` query via
 * `queryCollectionOptions` (the query-backed-collection glue, docs/decisions.md §6/§8). Mirrors
 * `useBranches` in shape — disabled when no Repository is open — but exposes a live-query-backed
 * collection instead of a bare `useQuery` result, scoped to HEAD (issue #42, the commit graph's
 * walking skeleton).
 */
export function useCommits(repoPath: string | null): {
  data: CommitRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const queryClient = useQueryClient();

  const collection = useMemo((): Collection<
    CommitRow,
    string | number,
    QueryCollectionUtils<CommitRow>
  > | null => {
    if (repoPath === null) return null;
    return createCollection(
      queryCollectionOptions<CommitRow>({
        queryKey: commitsKey(repoPath),
        queryFn: async () => [...(await window.git.listCommits({ repoPath, limit: PAGE_LIMIT }))],
        getKey: (commit) => commit.sha,
        queryClient,
      }),
    );
  }, [repoPath, queryClient]);

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
  return { data, isLoading, isError: collection?.utils.isError ?? false };
}
