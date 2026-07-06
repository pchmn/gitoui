import type { Commit } from '@gitoui/contracts/git';
import type { QueryCollectionUtils } from '@tanstack/query-db-collection';
import { parseLoadSubsetOptions, queryCollectionOptions } from '@tanstack/query-db-collection';
import type { Collection } from '@tanstack/react-db';
import { createCollection, eq } from '@tanstack/react-db';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useReducer } from 'react';
import { useLivePaginatedQuery } from '#renderer/shared/hooks/useLivePaginatedQuery';

/**
 * Query key factory for one Repository's commit subsets. `['commits']` is the collection's base
 * prefix (`queryKey({})`), and every derived subset key starts `['commits', repoPath, ...]` — so
 * `invalidateQueries(commitsKey(root))` on a Branch switch reaches all of that repo's loaded
 * subsets by TanStack Query's prefix matching, and no other repo's.
 */
export const commitsKey = (repoPath: string) => ['commits', repoPath] as const;

/** Page size for the infinite live query (issue #44). */
export const PAGE_LIMIT = 300;

/**
 * A `Commit` row in the collection. Two deltas from the contract type: mutable (TanStack DB's
 * `queryCollectionOptions` without a `schema` wants a mutable item type — `effect/Schema` types
 * are all-`readonly`), and tagged with the `repoPath` it belongs to, because the collection holds
 * *all* repos' commits and live queries narrow by `where(eq(commits.repoPath, …))`.
 */
type CommitRow = { -readonly [K in keyof Commit]: Commit[K] } & { repoPath: string };

type CommitsCollection = Collection<CommitRow, string | number, QueryCollectionUtils<CommitRow>>;

/**
 * The single `commits` collection — one module-scope, long-lived store for every Repository (the
 * TanStack DB model: one logical collection serving different subsets, docs/decisions.md §6/§8),
 * never a per-render or per-repo object. `syncMode: 'on-demand'` pushes each live query's
 * predicates down to the `queryFn` via `ctx.meta.loadSubsetOptions`: the `where` filter names the
 * repo, `offset`/`limit` become `listCommits`'s `skip`/`limit`. TanStack DB reconciles by
 * per-subset row ownership, so a Branch-switch refetch evicts the Commits its subset no longer
 * returns instead of merging over them.
 *
 * Memoized per `QueryClient` purely so each test's isolated client gets its own collection; the
 * app has exactly one client, hence exactly one collection.
 */
const collections = new WeakMap<QueryClient, CommitsCollection>();

function commitsCollection(queryClient: QueryClient): CommitsCollection {
  const existing = collections.get(queryClient);
  if (existing) return existing;

  const repoPathOf = (
    filters: { field: (string | number)[]; operator: string; value?: unknown }[],
  ) =>
    filters.find((f) => f.field[0] === 'repoPath' && f.operator === 'eq')?.value as
      | string
      | undefined;

  const collection = createCollection(
    queryCollectionOptions<CommitRow>({
      // `offset` is read off the raw options: this version's `parseLoadSubsetOptions` doesn't
      // surface it yet (it's on `LoadSubsetOptions` itself).
      queryKey: (opts) => {
        const { filters, limit } = parseLoadSubsetOptions(opts);
        const key: (string | number)[] = ['commits'];
        const repoPath = repoPathOf(filters);
        if (repoPath !== undefined) key.push(repoPath);
        if (opts?.offset) key.push(`skip-${opts.offset}`);
        if (limit) key.push(`limit-${limit}`);
        return key;
      },
      syncMode: 'on-demand',
      queryFn: async (ctx) => {
        const opts = ctx.meta?.loadSubsetOptions;
        const { filters, limit } = parseLoadSubsetOptions(opts);
        const repoPath = repoPathOf(filters);
        // No repo in the predicate (or the "no Repository open" sentinel): nothing to fetch —
        // an empty subset owns no rows, so it evicts nothing.
        if (repoPath === undefined || repoPath === '') return [];
        const commits = await window.git.listCommits({
          repoPath,
          skip: opts?.offset ?? 0,
          limit: limit ?? PAGE_LIMIT,
        });
        return commits.map((commit) => ({ ...commit, repoPath }));
      },
      // A sha alone isn't unique across Repositories (clones, forks) — scope the key by repo.
      getKey: (commit) => `${commit.repoPath}:${commit.sha}`,
      queryClient,
    }),
  );
  collections.set(queryClient, collection);
  return collection;
}

/**
 * The Commit history for a Repository: a paginated live query over the shared `commits`
 * collection, narrowed by `where(eq(repoPath))` (issue #44). `useLivePaginatedQuery` owns the
 * pagination mechanics (growing `limit`, `hasNextPage`, held rows across recompiles); a Branch
 * switch refreshes in place via `invalidateQueries(commitsKey)` (decision kept from issue #42) —
 * the loaded window keeps its size and the subsets refetch against the new HEAD.
 *
 * Mirrors `useBranches` in shape — disabled (empty) when no Repository is open.
 */
export function useCommits(repoPath: string | null): {
  data: CommitRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The error thrown by `listCommits` for the failing subset (undefined while not in error). */
  error: unknown;
  /** `true` while the loaded window is full — history *may* extend past it. */
  hasNextPage: boolean;
  /** A page is in flight for the load-more path (not the initial/reset load — that's `isLoading`). */
  isFetchingNextPage: boolean;
  /** Grow the loaded window by one page. No-op while fetching or once history is exhausted. */
  fetchNextPage: () => void;
  /** Clear the collection's error state and refetch — the error state's retry action. */
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const collection = commitsCollection(queryClient);

  // `utils.isError`/`utils.lastError` are plain mutable fields on the collection — nothing
  // subscribes React to them. Reads below stay correct only because *something else* re-renders
  // the component; a retry that settles without changing any row (success against an empty
  // Repository, or failing again) emits no live-query change, so the error UI would sit stale
  // forever. `rereadErrorState` is that missing subscription, bumped when a retry settles.
  const [, rereadErrorState] = useReducer((epoch: number) => epoch + 1, 0);

  // A collection is an unordered key→value store, so a bare `q.from` iterates in the collection's
  // internal (key) order, *not* `git log`'s order — hence the explicit `orderBy`. We sort by
  // `committedAt` desc to mirror `git log`, which orders by commit date (the row still shows the
  // *authored* date, exactly as `git log`'s `Date:` line does). Topological ordering comes with
  // the lanes slice. `''` is the "no Repository open" sentinel — it matches no rows and the
  // `queryFn` fetches nothing for it. (The collection stays out of the deps — it's stable per
  // QueryClient.)
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useLivePaginatedQuery(
    (q) =>
      q
        .from({ commits: collection })
        .where(({ commits }) => eq(commits.repoPath, repoPath ?? ''))
        .orderBy(({ commits }) => commits.committedAt, 'desc'),
    {
      pageSize: PAGE_LIMIT,
      fetchingKey: repoPath === null ? ['commits'] : commitsKey(repoPath),
    },
    [repoPath],
  );

  // The live query's own `isError` only reflects its own sync (always succeeds — it just relays
  // the source); the underlying `listCommits` query's failure surfaces on the source collection's
  // `utils.isError`/`utils.lastError` instead (decisions §6/§8). `lastError` is TanStack Query's
  // `QueryObserverResult.error`, i.e. whatever `listCommits` rejected with, untouched — so the
  // typed `RepoNotFoundError` (or any other tagged error) survives for `matchError` upstream.
  return {
    data,
    isLoading,
    isError: collection.utils.isError,
    error: collection.utils.lastError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    // `clearError` resets the collection's error state and refetches the failing subset — the
    // retry action for the inline error state. Its rejection is swallowed (the re-read below shows
    // the fresh `lastError` instead). The macrotask hop matters: TanStack Query notifies its
    // observers through `notifyManager`'s microtask batches, so by `setTimeout 0` the collection's
    // error state has settled either way — re-reading in `.finally` directly can race a failed
    // retry and briefly render "no error, no rows" as the empty state.
    retry: () =>
      void collection.utils
        .clearError()
        .catch(() => {})
        .finally(() => setTimeout(rereadErrorState, 0)),
  };
}
