import { toast } from '@gitoui/ui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GitError } from '#renderer/shared/git/errors';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../ActiveRepositoryContext';
import { RECENT_REPOSITORIES_KEY } from './useRecentRepositories';

/**
 * The shared open/switch flow (epic decision #5): resolve a raw or recent path to its canonical
 * work-tree root, record it (`main` stamps `lastOpenedAt` and returns the updated MRU list), then
 * activate it. Used by the picker (`useOpenRepository`) and by clicking a recent in the selector.
 *
 * The mutation returns the recents list, so `onSuccess` writes it straight into the query cache —
 * no refetch (decision #6). A failed resolve (not a repo, path gone) surfaces a Toast and leaves the
 * active Repository untouched.
 */
export function useActivateRepository() {
  const { setActiveRepository } = useActiveRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (path: string) => {
      const { root } = await window.git.resolveRepository({ path });
      const recents = await window.desktop.addRecentRepository({ path: root });
      return { root, recents };
    },
    onSuccess: ({ root, recents }) => {
      queryClient.setQueryData(RECENT_REPOSITORIES_KEY, recents);
      setActiveRepository(root);
    },
    onError: (error, path) => {
      toast.add({
        type: 'error',
        title: 'Could not open repository',
        description: matchError<GitError<'resolveRepository'>, string>(error, {
          NotARepositoryError: (e) => `${e.path} is not a git repository.`,
          _: () => `${path} could not be opened.`,
        }),
      });
    },
  });
}
