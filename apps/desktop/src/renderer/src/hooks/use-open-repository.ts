import { toast } from '@gitoui/ui/toast';
import { useCallback, useState } from 'react';
import { useActiveRepository } from '../active-repository';

/** A failed resolve crosses the IPC boundary as this plain tagged object (Style A re-throw). */
function isNotARepositoryError(
  error: unknown,
): error is { _tag: 'NotARepositoryError'; path: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { _tag?: unknown })._tag === 'NotARepositoryError'
  );
}

/**
 * The pick → resolve → activate flow (epic decision 5 — the renderer orchestrates it). The OS
 * picker yields a raw path; `core` validates + canonicalizes it to the work-tree root; that root
 * becomes the active Repository. A failed resolve surfaces a Toast and leaves the active Repository
 * untouched.
 */
export function useOpenRepository() {
  const { setActiveRepository } = useActiveRepository();
  const [isOpening, setIsOpening] = useState(false);

  const openRepository = useCallback(async () => {
    const picked = await window.desktop.pickRepository();
    if (picked === null) return; // user cancelled the picker

    setIsOpening(true);
    try {
      const { root } = await window.git.resolveRepository({ path: picked });
      setActiveRepository(root);
    } catch (error) {
      toast.add({
        type: 'error',
        title: 'Could not open repository',
        description: isNotARepositoryError(error)
          ? `${error.path} is not a git repository.`
          : `${picked} could not be opened.`,
      });
    } finally {
      setIsOpening(false);
    }
  }, [setActiveRepository]);

  return { openRepository, isOpening };
}
