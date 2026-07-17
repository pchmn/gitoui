import { useQuery } from '@tanstack/react-query';

/** Query key factory for one Commit's detail. Scoped to repo + sha, like `statusKey`/`tagsKey`. */
export const commitDetailKey = (repoPath: string, sha: string) =>
  ['commitDetail', repoPath, sha] as const;

/**
 * Fetch one Commit's detail (issue #65): plain `useQuery` wrapping `window.git.commitDetail`, like
 * the read-only rail hooks (`useTags`, `useBranches`) — no subscription, no collection. A long
 * `staleTime` since a Commit's own detail never changes once made (history is append-only): unlike
 * `Status`, there's no live-update reason to ever refetch an already-fetched sha. Disabled when
 * either `repoPath` or `sha` is null (no Repository open / no Commit selected).
 */
export function useCommitDetail(repoPath: string | null, sha: string | null) {
  const enabled = repoPath !== null && sha !== null;
  return useQuery({
    queryKey: enabled ? commitDetailKey(repoPath, sha) : ['commitDetail', null],
    // Casts guarded by `enabled` — mirrors `useTags`'s identical seam.
    queryFn: () => window.git.commitDetail({ repoPath: repoPath as string, sha: sha as string }),
    enabled,
    staleTime: Infinity,
  });
}
