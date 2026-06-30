import { useQuery } from '@tanstack/react-query';

/** Query key factory for the tag list. Scoped to the repo path so it invalidates correctly on repo switch. */
export const tagsKey = (repoPath: string) => ['tags', repoPath] as const;

/**
 * Fetch the Tag list for the active Repository (issue #35). Mirrors `useBranches` —
 * plain `useQuery` wrapping a `window.git.*` call, no subscription needed for the read-only slice.
 * The query is disabled when `repoPath` is null (no Repository open).
 */
export function useTags(repoPath: string | null) {
  return useQuery({
    queryKey: repoPath !== null ? tagsKey(repoPath) : ['tags', null],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by `enabled`
    queryFn: () => window.git.listTags({ repoPath: repoPath as string }),
    enabled: repoPath !== null,
  });
}
