import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RECENT_REPOSITORIES_KEY } from './useRecentRepositories';

/**
 * Manual removal of a recent (issue #10): drop the entry by its canonical path. `main` returns the
 * updated MRU list, which we write straight into the query cache so the selector updates without a
 * refetch (decision #6). This is the only path that evicts an entry — a recent that fails to resolve
 * is kept (decision #7), so removal is always this explicit, user-initiated action.
 */
export function useRemoveRecentRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => window.desktop.removeRecentRepository({ path }),
    onSuccess: (recents) => {
      queryClient.setQueryData(RECENT_REPOSITORIES_KEY, recents);
    },
  });
}
