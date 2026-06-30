import { useQuery } from '@tanstack/react-query';

/** Query key factory for the remotes list. Scoped to the repo path so it invalidates correctly on repo switch. */
export const remotesKey = (repoPath: string) => ['remotes', repoPath] as const;

/**
 * Fetch the Remotes list for the active Repository (issue #34). Mirrors `useBranches` —
 * plain `useQuery` wrapping a `window.git.*` call, no subscription needed for the read-only slice.
 * The query is disabled when `repoPath` is null (no Repository open).
 */
export function useRemotes(repoPath: string | null) {
  return useQuery({
    queryKey: repoPath !== null ? remotesKey(repoPath) : ['remotes', null],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by `enabled`
    queryFn: () => window.git.listRemotes({ repoPath: repoPath as string }),
    enabled: repoPath !== null,
  });
}
