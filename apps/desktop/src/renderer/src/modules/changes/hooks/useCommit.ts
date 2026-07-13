import { toast } from '@gitoui/ui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { commitsKey } from '../../commits/hooks/useCommits';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { statusKey } from './useStatus';

/**
 * Mutation to commit the Staged set (issue #63): plain `git commit -m <message>` semantics — never
 * `-a` — so exactly what's staged lands in the new Commit; the message crosses verbatim. Mirrors
 * `useCreateBranch`'s shape. Unlike the staging mutations (`useStaging`), this is NOT optimistic —
 * the commit itself is the state change the user is waiting to see land, not a fast local toggle.
 *
 * On success, invalidates `statusKey(root)` (the Staged/Unstaged lists settle to git's truth — now
 * empty) AND `commitsKey(root)` (the prefix key, so every paginated subset of the graph refreshes
 * and gains the new Commit). On error — including the race where the Staged set emptied between
 * render and click, which git reports as "nothing to commit" — a Toast shows git's own message via
 * the shared `GitCommandError` taxonomy.
 */
export function useCommit() {
  const { root } = useActiveRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string) => {
      if (root === null) return;
      return await window.git.commit({ repoPath: root, message });
    },
    onSuccess: () => {
      if (root === null) return;
      void queryClient.invalidateQueries({ queryKey: statusKey(root) });
      void queryClient.invalidateQueries({ queryKey: commitsKey(root) });
    },
    onError: (error) => {
      toast.add({
        type: 'error',
        title: messages.errors.commit.title,
        description: matchError<GitError<'commit'>, string>(error, {
          GitCommandError: (e) => e.message || messages.errors.byTag.gitCommandFailed,
          _: () => messages.errors.byTag.unexpected,
        }),
      });
    },
  });
}
