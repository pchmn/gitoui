import { toast } from '@gitoui/ui/toast';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { GitError } from '#renderer/shared/git/errors';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../ActiveRepositoryContext';

/**
 * The pick → resolve → activate flow (epic decision 5 — the renderer orchestrates it). The OS
 * picker yields a raw path; `core` validates + canonicalizes it to the work-tree root; that root
 * becomes the active Repository. A failed resolve surfaces a Toast and leaves the active Repository
 * untouched.
 *
 * The resolve step is a TanStack mutation: it owns the `try/catch` the boundary forces (Style A
 * re-throw) and the pending state. `matchError` narrows the thrown `unknown` against the
 * contract-derived error union (decision #8) — exhaustive, so a new error variant breaks the build.
 */
export function useOpenRepository() {
  const { setActiveRepository } = useActiveRepository();

  const { mutate, isPending } = useMutation({
    mutationFn: (path: string) => window.git.resolveRepository({ path }),
    onSuccess: ({ root }) => setActiveRepository(root),
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

  const openRepository = useCallback(async () => {
    const picked = await window.desktop.pickRepository();
    if (picked === null) return; // user cancelled the picker
    mutate(picked);
  }, [mutate]);

  return { openRepository, isOpening: isPending };
}
