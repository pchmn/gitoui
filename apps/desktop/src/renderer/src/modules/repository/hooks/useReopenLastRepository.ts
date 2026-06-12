import { useEffect, useRef, useState } from 'react';
import { useActiveRepository } from '../ActiveRepositoryContext';
import { useRecentRepositories } from './useRecentRepositories';

/**
 * Reopen-on-launch (issue #10): restore the last active Repository when the app boots. There's no
 * separate `activeRepository` key — MRU[0] *is* the last active one (decision #7) — so we re-validate
 * MRU[0] via `resolveRepository` and activate it on success. A failure (moved / deleted / unmounted)
 * falls back to the empty state **silently** and **keeps** the entry — no toast (that's reserved for
 * an explicit click) and no eviction (an unmounted drive may come back).
 *
 * Validation stays lazy: only MRU[0] is touched, never the whole list, so no git is spawned for the
 * other recents. `isRestoring` lets the shell hold a blank content region until the one attempt
 * settles, instead of flashing the empty-state CTA before the repo view appears.
 */
export function useReopenLastRepository(): { readonly isRestoring: boolean } {
  const { setActiveRepository } = useActiveRepository();
  const { data: recents, isPending } = useRecentRepositories();
  const [isRestoring, setIsRestoring] = useState(true);
  const attempted = useRef(false);

  useEffect(() => {
    // Run once the recents query has settled (success or error); the ref also guards StrictMode's
    // double-invoke. Gating on `isPending` rather than the data means a failed read still releases
    // the blank content region to the empty state instead of hanging on it.
    if (attempted.current || isPending) return;
    attempted.current = true;

    const mru = recents?.[0];
    if (mru === undefined) {
      setIsRestoring(false); // empty (or unreadable) list → nothing to restore, show the empty state
      return;
    }

    void window.git
      .resolveRepository({ path: mru.path })
      .then(({ root }) => setActiveRepository(root))
      .catch(() => {
        // MRU[0] no longer resolves: keep the entry, fall through to the empty state (no toast).
      })
      .finally(() => setIsRestoring(false));
  }, [isPending, recents, setActiveRepository]);

  return { isRestoring };
}
