import { toast } from '@gitoui/ui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GitError } from '#renderer/shared/git/errors';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { branchesKey } from './useBranches';

/**
 * Mutation to switch HEAD to a different local Branch (issue #16). Mirrors `useActivateRepository`.
 *
 * On success, invalidates `['branches', root]` and `['status', root]` so the BranchSelector and
 * StatusBar both refresh to show the new HEAD. On error, a Toast via `matchError` narrows the typed
 * error: a dirty Working tree that git refuses to overwrite → "Commit or stash your changes first.";
 * everything else → a generic message.
 */
export function useSwitchBranch() {
  const { root } = useActiveRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (branch: string) => {
      if (root === null) return;
      await window.git.switchBranch({ repoPath: root, branch });
    },
    onSuccess: () => {
      if (root === null) return;
      void queryClient.invalidateQueries({ queryKey: branchesKey(root) });
      void queryClient.invalidateQueries({ queryKey: ['status', root] });
    },
    onError: (error) => {
      toast.add({
        type: 'error',
        title: 'Could not switch branch',
        description: matchError<GitError<'switchBranch'>, string>(error, {
          UncommittedChangesError: () =>
            'Working tree has uncommitted changes. Commit or stash them first.',
          RepoNotFoundError: () => 'Repository not found.',
          _: () => 'An unexpected error occurred.',
        }),
      });
    },
  });
}
