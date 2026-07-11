import type { Status } from '@gitoui/contracts/git';
import type { QueryCollectionUtils } from '@tanstack/query-db-collection';
import { parseLoadSubsetOptions, queryCollectionOptions } from '@tanstack/query-db-collection';
import type { Collection } from '@tanstack/react-db';
import { createCollection, eq, useLiveQuery } from '@tanstack/react-db';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useReducer } from 'react';

/**
 * Query key factory for one Repository's `status` row. `['status']` is the collection's base
 * prefix (`queryKey({})`), and every subset key is `['status', repoPath]`. Every consumer — the
 * Changes panel AND the StatusBar — reads this ONE collection (never a competing plain
 * `useQuery(['status', …])`): a second query on the same key with a different result shape (object
 * vs the collection's array) would collide and make `invalidateQueries(statusKey(root))` throw. So a
 * single `invalidateQueries(statusKey(root))` refreshes the whole app's status after any mutation.
 */
export const statusKey = (repoPath: string) => ['status', repoPath] as const;

/**
 * A `Status` row in the collection. Mutable (TanStack DB's `queryCollectionOptions` without a
 * `schema` wants a mutable item type — `effect/Schema` types are all-`readonly`) and tagged with
 * the `repoPath` it belongs to: unlike `commits`, Status is a single snapshot (not a paged list),
 * so the collection holds exactly one row per repo and live queries narrow with
 * `where(eq(status.repoPath, root))` (docs/decisions.md §6).
 */
type StatusRow = { -readonly [K in keyof Status]: Status[K] } & { repoPath: string };

type StatusCollection = Collection<StatusRow, string | number, QueryCollectionUtils<StatusRow>>;

/**
 * The single `status` collection — one module-scope, long-lived store for every Repository, never
 * a per-render or per-repo object. `syncMode: 'on-demand'` pushes the live query's `repoPath`
 * predicate down to the `queryFn` via `ctx.meta.loadSubsetOptions`, mirroring `commits`
 * (`useCommits.ts`) minus the pagination machinery Status doesn't need — it's one row, not a page.
 *
 * Memoized per `QueryClient` purely so each test's isolated client gets its own collection; the
 * app has exactly one client, hence exactly one collection.
 */
const collections = new WeakMap<QueryClient, StatusCollection>();

export function statusCollection(queryClient: QueryClient): StatusCollection {
  const existing = collections.get(queryClient);
  if (existing) return existing;

  const repoPathOf = (
    filters: { field: (string | number)[]; operator: string; value?: unknown }[],
  ) =>
    filters.find((f) => f.field[0] === 'repoPath' && f.operator === 'eq')?.value as
      | string
      | undefined;

  const collection = createCollection(
    queryCollectionOptions<StatusRow>({
      queryKey: (opts) => {
        const { filters } = parseLoadSubsetOptions(opts);
        const repoPath = repoPathOf(filters);
        return repoPath === undefined ? ['status'] : statusKey(repoPath);
      },
      syncMode: 'on-demand',
      queryFn: async (ctx) => {
        const opts = ctx.meta?.loadSubsetOptions;
        const { filters } = parseLoadSubsetOptions(opts);
        const repoPath = repoPathOf(filters);
        // No repo in the predicate (or the "no Repository open" sentinel): nothing to fetch — an
        // empty subset owns no rows, so it evicts nothing.
        if (repoPath === undefined || repoPath === '') return [];
        const status = await window.git.status({ repoPath });
        return [{ ...status, repoPath }];
      },
      // One row per repo — the repo path alone is the row's identity.
      getKey: (row) => row.repoPath,
      queryClient,
    }),
  );
  collections.set(queryClient, collection);
  return collection;
}

/**
 * The Working tree Status for a Repository: a live query over the shared `status` collection,
 * narrowed by `where(eq(repoPath))`. Mirrors `useCommits`'s shape (loading/error/retry), minus
 * pagination — Status is always the whole snapshot, never a page.
 */
export function useStatus(repoPath: string | null): {
  data: StatusRow | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The error thrown by `status` for the failing subset (undefined while not in error). */
  error: unknown;
  /** Clears the collection's error state and refetches — the error state's retry action. */
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const collection = statusCollection(queryClient);

  // See `useCommits`'s identical comment: `utils.isError`/`utils.lastError` are plain mutable
  // fields nothing subscribes React to — this re-read bump is what makes a settled retry re-render.
  const [, rereadErrorState] = useReducer((epoch: number) => epoch + 1, 0);

  const { data, isLoading } = useLiveQuery(
    (q) =>
      q.from({ status: collection }).where(({ status }) => eq(status.repoPath, repoPath ?? '')),
    [repoPath],
  );

  return {
    data: data?.[0],
    isLoading,
    isError: collection.utils.isError,
    error: collection.utils.lastError,
    retry: () =>
      void collection.utils
        .clearError()
        .catch(() => {})
        .finally(() => setTimeout(rereadErrorState, 0)),
  };
}
