import type { Status } from '@gitoui/contracts/git';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { diffKey } from '#renderer/modules/diff/hooks/useDiff';
import { statusKey } from './useStatus';

// Mirrors main's `IpcStreamMsg` (apps/desktop/src/ipc/registry.ts) — the preload's `subscribe`
// forwards it as `unknown`, so the renderer narrows by `_tag` itself; not shared via `@gitoui/contracts`
// because it's IPC transport plumbing, not a git domain type.
type WatchStatusMsg =
  | { _tag: 'Event'; value: Status }
  | { _tag: 'Failure'; error: unknown }
  | { _tag: 'Defect'; defect: { message: string } }
  | { _tag: 'Done' };

/**
 * The real `RepoWatcher` (issue #64), wired into the renderer: while a Repository is active,
 * subscribes via the preload's `watchStatus` and writes every pushed Status straight into the
 * `['status', repoPath]` query-cache entry the `status` collection reads (`useStatus.ts`) via
 * `queryClient.setQueryData` — no extra IPC roundtrip. The StatusBar and the Changes panel both
 * read that one collection, so both go live at once.
 *
 * Re-subscribes on repo change; the effect's cleanup unsubscribes on unmount/repo change, which
 * tears down this side's IPC listener and, in `main`, decrements the `RepoWatcher` refcount for
 * that repo (closing its fs watcher if this was the last subscriber).
 *
 * After this lands, the staging/commit mutations' own `invalidateQueries(statusKey(root))` calls
 * become a fast-path redundancy, not dead code — kept as-is: the watcher's push converges the state
 * regardless of who mutated, but the mutation's own refetch is faster than waiting on the debounce.
 */
export function useLiveStatus(repoPath: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (repoPath === null || repoPath === '') return;

    const unsubscribe = window.git.watchStatus({ repoPath }, (raw) => {
      const msg = raw as WatchStatusMsg;
      if (msg._tag !== 'Event') return;
      queryClient.setQueryData(statusKey(repoPath), [{ ...msg.value, repoPath }]);
      // An external edit may have changed the file underneath an open worktree diff.
      void queryClient.invalidateQueries({ queryKey: diffKey(repoPath) });
    });

    return unsubscribe;
  }, [repoPath, queryClient]);
}
