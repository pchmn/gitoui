import { useQuery } from '@tanstack/react-query';

/** Query key factory for the branch list. Scoped to the repo path so it invalidates correctly on repo switch. */
export const branchesKey = (repoPath: string) => ['branches', repoPath] as const;

/**
 * Fetch the local Branch list for the active Repository (issue #15). Mirrors `useRecentRepositories`
 * — plain `useQuery` wrapping a `window.git.*` call, no subscription needed for the read-only tracer.
 * The query is disabled when `repoPath` is null (no Repository open).
 */
export function useBranches(repoPath: string | null) {
  return useQuery({
    queryKey: repoPath !== null ? branchesKey(repoPath) : ['branches', null],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by `enabled`
    queryFn: () => window.git.listBranches({ repoPath: repoPath as string }),
    enabled: repoPath !== null,
  });
}
