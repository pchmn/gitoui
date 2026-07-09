import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';

/**
 * What the Commit graph has selected (issue #66): a specific Commit (by SHA) or the dirty Working
 * tree (the WIP row) — `null` when nothing is selected. One serializable value, held in one place:
 * it is the seam the Commit-detail view, route, and "launch the app on a specific Commit" deep-link
 * read from, and the WIP row / Changes-mode anchor the Inspector reads from. For the Inspector,
 * `workingTree` and `null` are equivalent (both Changes mode) — Commit detail shows only for
 * `kind: 'commit'`.
 */
export type CommitSelection =
  | { readonly kind: 'commit'; readonly sha: string }
  | { readonly kind: 'workingTree' };

/**
 * UI selection state for the Commit graph, held in one place.
 *
 * Distinct from `RailSelection` (`SelectionContext`): focusing a rail row and selecting a Commit in
 * the graph are different axes — they are never merged.
 *
 * Scoped to the active Repository: when the repo root changes, selection resets to `null` (mirrors
 * `SelectionContext`'s reset-on-repo-change).
 */
type CommitSelectionContextValue = {
  readonly selection: CommitSelection | null;
  readonly select: (selection: CommitSelection | null) => void;
};

const CommitSelectionContext = createContext<CommitSelectionContextValue | undefined>(undefined);

export function CommitSelectionProvider({ children }: { children: ReactNode }) {
  const { root } = useActiveRepository();
  const [selection, setSelection] = useState<CommitSelection | null>(null);

  // Reset selection when the active repository changes.
  useEffect(() => {
    setSelection(null);
  }, [root]);

  const value = useMemo<CommitSelectionContextValue>(
    () => ({ selection, select: setSelection }),
    [selection],
  );

  return (
    <CommitSelectionContext.Provider value={value}>{children}</CommitSelectionContext.Provider>
  );
}

export function useCommitSelection(): CommitSelectionContextValue {
  const context = useContext(CommitSelectionContext);
  if (context === undefined) {
    throw new Error('useCommitSelection must be used within a CommitSelectionProvider');
  }
  return context;
}
