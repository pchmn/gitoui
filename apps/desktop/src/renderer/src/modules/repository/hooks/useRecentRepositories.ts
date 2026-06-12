import { useQuery } from '@tanstack/react-query';

/** Query key for the persisted recents list (shared so mutations can set the data directly). */
export const RECENT_REPOSITORIES_KEY = ['recentRepositories'] as const;

/**
 * The persisted recents, most-recently-used first. Reads stored entries only — no git is spawned
 * per recent when the selector opens (epic decision #3). Mutations keep this fresh by writing the
 * returned MRU list straight into the cache (see `useActivateRepository`), so a refetch is rare.
 */
export function useRecentRepositories() {
  return useQuery({
    queryKey: RECENT_REPOSITORIES_KEY,
    queryFn: () => window.desktop.recentRepositories(),
  });
}
