import { toast } from '@gitoui/ui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { branchesKey } from './useBranches';

/**
 * Mutation to create a new Branch from the current HEAD and switch onto it (issue #17). Mirrors
 * `useSwitchBranch`.
 *
 * On success, invalidates `['branches', root]` and `['status', root]` so the BranchSelector and
 * StatusBar both refresh to show the new HEAD. On error, a Toast via `matchError` narrows the typed
 * error: a name collision → clear message; an invalid git name → clear message; everything else →
 * generic.
 */
export function useCreateBranch() {
  const { root } = useActiveRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (root === null) return;
      await window.git.createBranch({ repoPath: root, name });
    },
    onSuccess: () => {
      if (root === null) return;
      void queryClient.invalidateQueries({ queryKey: branchesKey(root) });
      void queryClient.invalidateQueries({ queryKey: ['status', root] });
    },
    onError: (error) => {
      toast.add({
        type: 'error',
        title: messages.errors.createBranch.title,
        description: matchError<GitError<'createBranch'>, string>(error, {
          BranchExistsError: (e) => messages.errors.byTag.branchExists(e.name),
          InvalidBranchNameError: (e) => messages.errors.byTag.invalidBranchName(e.name),
          RepoNotFoundError: () => messages.errors.byTag.repoNotFound,
          _: () => messages.errors.byTag.unexpected,
        }),
      });
    },
  });
}
