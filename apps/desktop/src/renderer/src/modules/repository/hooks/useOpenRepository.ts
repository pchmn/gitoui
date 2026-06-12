import { useCallback } from 'react';
import { useActivateRepository } from './useActivateRepository';

/**
 * The picker entry to the open flow (epic decision #5 — the renderer orchestrates it): the OS picker
 * yields a raw path, then the shared activate flow validates + canonicalizes it, records it in
 * recents, and makes it the active Repository. Cancelling the picker is a no-op. Used by the empty
 * state, the Repository view, and the selector's "Open repository…" action.
 */
export function useOpenRepository() {
  const { mutate, isPending } = useActivateRepository();

  const openRepository = useCallback(async () => {
    const picked = await window.desktop.pickRepository();
    if (picked === null) return; // user cancelled the picker
    mutate(picked);
  }, [mutate]);

  return { openRepository, isOpening: isPending };
}
