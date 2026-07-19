import type { DiffSource } from '@gitoui/contracts/git';
import { useQuery } from '@tanstack/react-query';

/**
 * Query key factory for `diff` (issue #67). `diffKey(repoPath)` is the base prefix a status
 * mutation/watcher push invalidates (clears every open worktree diff for that repo in one call,
 * mirroring `statusKey`/`commitsKey`); the full per-call key adds `path`/`source`.
 */
export const diffKey = (repoPath: string) => ['diff', repoPath] as const;

/**
 * Fetch one path's diff (issue #67): plain `useQuery` wrapping `window.git.diff`, like
 * `useCommitDetail` — no collection, no subscription. Disabled until a Repository is open and a
 * file is targeted (the Code & Diff view is closed).
 */
export function useDiff(repoPath: string | null, path: string | null, source: DiffSource | null) {
  const enabled = repoPath !== null && path !== null && source !== null;
  return useQuery({
    queryKey: enabled ? [...diffKey(repoPath), path, source] : ['diff', null],
    // Casts guarded by `enabled` — mirrors `useCommitDetail`'s identical seam.
    queryFn: () =>
      window.git.diff({
        repoPath: repoPath as string,
        path: path as string,
        source: source as DiffSource,
      }),
    enabled,
  });
}
