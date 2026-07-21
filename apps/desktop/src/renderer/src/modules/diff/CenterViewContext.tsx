import type { DiffSource } from '@gitoui/contracts/git';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';

/**
 * The Code & Diff view's target (issue #67): a path plus which axis of its history to read — mirrors
 * `CommitSelection`'s shape. Non-null swaps the app shell's center from the Commit graph to the
 * Code & Diff view; `null` shows the graph.
 */
export type CenterViewFile = {
  readonly path: string;
  readonly source: DiffSource;
};

type CenterViewContextValue = {
  readonly file: CenterViewFile | null;
  readonly open: (file: CenterViewFile) => void;
  readonly close: () => void;
};

const CenterViewContext = createContext<CenterViewContextValue | undefined>(undefined);

export function CenterViewProvider({ children }: { children: ReactNode }) {
  const { root } = useActiveRepository();
  const [file, setFile] = useState<CenterViewFile | null>(null);

  // Reset when the active repository changes — mirrors `CommitSelectionContext`'s identical reset.
  useEffect(() => {
    setFile(null);
  }, [root]);

  const value = useMemo<CenterViewContextValue>(
    () => ({ file, open: setFile, close: () => setFile(null) }),
    [file],
  );

  return <CenterViewContext.Provider value={value}>{children}</CenterViewContext.Provider>;
}

export function useCenterView(): CenterViewContextValue {
  const context = useContext(CenterViewContext);
  if (context === undefined) {
    throw new Error('useCenterView must be used within a CenterViewProvider');
  }
  return context;
}
