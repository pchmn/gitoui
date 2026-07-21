import type { StatusEntry } from '@gitoui/contracts/git';
import { toast } from '@gitoui/ui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { diffKey } from '#renderer/modules/diff/hooks/useDiff';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { stageAllEntries, stageOne, unstageAllEntries, unstageOne } from '../optimisticStaging';
import { statusCollection, statusKey } from './useStatus';

/**
 * The four file-level staging mutations (issue #62): stage/unstage a single path, and stage/unstage
 * everything. Mirrors `useSwitchBranch`'s shape.
 *
 * Optimistic (the `git status` recompute is slow on a large Repository, so we don't wait for it): on
 * click, `onMutate` rewrites the shared `status` collection's row IN PLACE (`utils.writeUpdate`) via
 * the pure `optimisticStaging` transforms, so the checkbox moves to the other group INSTANTLY. Then
 * `onSettled` invalidates `statusKey(root)` — the collection refetches and reconciles to git's truth
 * (also refreshing the StatusBar, which reads the same collection). This doubles as the rollback: on
 * failure the refetch restores the real Status, so no manual undo is needed. On error, a Toast shows
 * git's OWN message (`GitCommandError.message`, e.g. `fatal: pathspec '…' did not match any files`)
 * rather than a misleading catch-all.
 */
export function useStaging() {
  const { root } = useActiveRepository();
  const queryClient = useQueryClient();

  // Optimistically rewrite the one `status` row's entries so the live query (Changes panel +
  // StatusBar) re-renders immediately, before the git call and refetch complete. No-op until the
  // row exists (status not loaded yet) — the refetch will still show the result.
  const optimistic = (transform: (entries: readonly StatusEntry[]) => StatusEntry[]) => {
    if (root === null) return;
    const collection = statusCollection(queryClient);
    const current = collection.get(root);
    if (current === undefined) return;
    collection.utils.writeUpdate({
      repoPath: root,
      branch: current.branch,
      ahead: current.ahead,
      behind: current.behind,
      entries: transform(current.entries),
    });
  };

  // Reconcile the optimistic guess with git's truth (and restore it on failure). Runs on both
  // success and error via `onSettled`. Also invalidates every open worktree diff for this repo
  // (issue #67's wiring: staging moves the unstaged/staged boundary, so an open diff on either axis
  // may now be stale) — `diffKey`'s base prefix reaches commit diffs too, a harmless extra refetch of
  // otherwise-immutable data.
  const reconcile = () => {
    if (root === null) return;
    void queryClient.invalidateQueries({ queryKey: statusKey(root) });
    void queryClient.invalidateQueries({ queryKey: diffKey(root) });
  };

  // All four share the same error taxonomy (GitCommandError); `title` is the per-action override,
  // the description is git's own message (falling back to a generic phrase if git said nothing).
  const onError = (title: string) => (error: unknown) => {
    toast.add({
      type: 'error',
      title,
      description: matchError<GitError<'stageFile'>, string>(error, {
        GitCommandError: (e) => e.message || messages.errors.byTag.gitCommandFailed,
        _: () => messages.errors.byTag.unexpected,
      }),
    });
  };

  const stageFile = useMutation({
    mutationFn: async (path: string) => {
      if (root === null) return;
      await window.git.stageFile({ repoPath: root, path });
    },
    onMutate: (path: string) => optimistic((entries) => stageOne(entries, path)),
    onError: onError(messages.errors.stageFile.title),
    onSettled: reconcile,
  });

  const unstageFile = useMutation({
    mutationFn: async (path: string) => {
      if (root === null) return;
      await window.git.unstageFile({ repoPath: root, path });
    },
    onMutate: (path: string) => optimistic((entries) => unstageOne(entries, path)),
    onError: onError(messages.errors.unstageFile.title),
    onSettled: reconcile,
  });

  const stageAll = useMutation({
    mutationFn: async () => {
      if (root === null) return;
      await window.git.stageAll({ repoPath: root });
    },
    onMutate: () => optimistic(stageAllEntries),
    onError: onError(messages.errors.stageAll.title),
    onSettled: reconcile,
  });

  const unstageAll = useMutation({
    mutationFn: async () => {
      if (root === null) return;
      await window.git.unstageAll({ repoPath: root });
    },
    onMutate: () => optimistic(unstageAllEntries),
    onError: onError(messages.errors.unstageAll.title),
    onSettled: reconcile,
  });

  return { stageFile, unstageFile, stageAll, unstageAll };
}
