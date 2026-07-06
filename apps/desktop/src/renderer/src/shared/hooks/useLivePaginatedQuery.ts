import type {
  Context,
  InferResultType,
  InitialQueryBuilder,
  QueryBuilder,
} from '@tanstack/react-db';
import { useLiveQuery } from '@tanstack/react-db';
import { useIsFetching } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

/**
 * A paginated live query over an on-demand collection: the query's `limit` is the pagination
 * cursor. `fetchNextPage` bumps a page counter, the live query recompiles with `limit = pages ×
 * pageSize`, and the recompile pushes the grown window down to the on-demand sync layer, which
 * fetches the missing rows.
 *
 * The API mirrors `@tanstack/react-db`'s `useLiveInfiniteQuery` on purpose — that hook is the
 * intended tool for this, but in the pinned `@tanstack/db` 0.6.x its `setWindow` path never asks
 * the on-demand sync layer for more rows (upstream #968/#820, fixed on `main` but unreleased; see
 * docs/decisions.md §6). When the fix ships, callers migrate by swapping the hook.
 *
 * @param queryFn Builds the query (`from`/`where`/`orderBy` — an `orderBy` is required for a
 *   deterministic window). The hook appends the growing `.limit()` itself.
 * @param config.pageSize Rows per page.
 * @param config.fetchingKey TanStack Query key (prefix) of the underlying source queries — used
 *   to derive `isFetchingNextPage` from in-flight fetches.
 * @param deps Recompile deps, exactly like `useLiveQuery`'s — everything the query closure reads.
 *   When they change, the window resets to one page *synchronously* (an effect-based reset would
 *   let one render through with the previous window's possibly-deep `limit`, firing a wasteful
 *   oversized fetch at the new query).
 */
export function useLivePaginatedQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  config: { pageSize: number; fetchingKey: readonly unknown[] },
  deps: unknown[] = [],
): {
  data: InferResultType<TContext> | undefined;
  /** The initial (or post-reset) load — nothing to show yet. Load-more never flips this. */
  isLoading: boolean;
  /** `true` while the loaded window is full — the list *may* extend past it. */
  hasNextPage: boolean;
  /** A page is in flight for the load-more path (not the initial/reset load — that's `isLoading`). */
  isFetchingNextPage: boolean;
  /** Grow the loaded window by one page. No-op while fetching or once the list is exhausted. */
  fetchNextPage: () => void;
} {
  const depsKey = JSON.stringify(deps);
  const [pageWindow, setPageWindow] = useState({ depsKey, pages: 1 });
  const pages = pageWindow.depsKey === depsKey ? pageWindow.pages : 1;
  const requested = pages * config.pageSize;

  // `[...deps, requested]` is load-bearing: `useLiveQuery`'s builder form only recompiles when
  // its deps change, and each recompile is what pushes the new predicates down to the on-demand
  // sync layer.
  const live = useLiveQuery((q) => queryFn(q).limit(requested), [...deps, requested]);

  // A recompile (load-more growing `requested`) starts a fresh live query that reports empty for
  // a tick before it syncs the rows already in the collection. Letting that flash through would
  // bounce consumers back to their loading state (unmounting lists, losing scroll position) — so
  // while the new query loads, keep exposing the previous window's rows. Only for the *same*
  // deps: a deps change is a different list, which must show its loading state instead.
  const settled = useRef<{ depsKey: string; data: InferResultType<TContext> | undefined }>({
    depsKey,
    data: undefined,
  });
  if (!live.isLoading) {
    settled.current = { depsKey, data: live.data };
  }
  const holdPrevious =
    live.isLoading && settled.current.depsKey === depsKey && settled.current.data !== undefined;
  const data = holdPrevious ? settled.current.data : live.data;
  const isLoading = live.isLoading && !holdPrevious;

  // Any in-flight fetch under the source's key prefix, reactive. Combined with "the window isn't
  // full yet" this is exactly the load-more path — a refetch-in-place (e.g. an invalidation) runs
  // with a *full* window, so it doesn't read as "fetching next page".
  const fetching = useIsFetching({ queryKey: config.fetchingKey });
  const loaded = data?.length ?? 0;
  const hasNextPage = loaded === requested;
  const isFetchingNextPage = fetching > 0 && data !== undefined && loaded < requested;

  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    setPageWindow((prev) =>
      prev.depsKey === depsKey ? { depsKey, pages: prev.pages + 1 } : { depsKey, pages: 2 },
    );
  }, [depsKey, hasNextPage, isFetchingNextPage]);

  return { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage };
}
