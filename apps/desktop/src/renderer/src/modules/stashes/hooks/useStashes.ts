import { useQuery } from '@tanstack/react-query';

/** Query key factory for the stash list. Scoped to the repo path so it invalidates correctly on repo switch. */
export const stashesKey = (repoPath: string) => ['stashes', repoPath] as const;

/**
 * Fetch the Stash list for the active Repository (issue #36). Mirrors `useTags` —
 * plain `useQuery` wrapping a `window.git.*` call, no subscription needed for the read-only slice.
 * The query is disabled when `repoPath` is null (no Repository open).
 */
export function useStashes(repoPath: string | null) {
  return useQuery({
    queryKey: repoPath !== null ? stashesKey(repoPath) : ['stashes', null],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by `enabled`
    queryFn: () => window.git.listStashes({ repoPath: repoPath as string }),
    enabled: repoPath !== null,
  });
}
