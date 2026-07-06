import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';

/**
 * UI selection state for the Commit graph (issue #46): the selected Commit's SHA, held in one
 * place. It is the seam the future Commit-detail view, route, and "launch the app on a specific
 * Commit" deep-link will read from — one serializable identifier (the SHA), in one location, not
 * state scattered across components.
 *
 * Distinct from `RailSelection` (`SelectionContext`): focusing a rail row and selecting a Commit in
 * the graph are different axes — they are never merged.
 *
 * Scoped to the active Repository: when the repo root changes, selection resets to `null` (mirrors
 * `SelectionContext`'s reset-on-repo-change).
 */
type CommitSelectionContextValue = {
  readonly selectedSha: string | null;
  readonly selectCommit: (sha: string | null) => void;
};

const CommitSelectionContext = createContext<CommitSelectionContextValue | undefined>(undefined);

export function CommitSelectionProvider({ children }: { children: ReactNode }) {
  const { root } = useActiveRepository();
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  // Reset selection when the active repository changes.
  useEffect(() => {
    setSelectedSha(null);
  }, [root]);

  const value = useMemo<CommitSelectionContextValue>(
    () => ({ selectedSha, selectCommit: setSelectedSha }),
    [selectedSha],
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
