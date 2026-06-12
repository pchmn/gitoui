import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

/**
 * The active Repository as renderer app state (epic decision 1 — TanStack Router is deferred to the
 * graph tranche, so "which repo am I in" lives in an ambient React context, not a route). Holds the
 * canonical work-tree root (`git rev-parse --show-toplevel`); `null` means no Repository is open.
 */
type ActiveRepositoryContextValue = {
  readonly root: string | null;
  readonly setActiveRepository: (root: string | null) => void;
};

const ActiveRepositoryContext = createContext<ActiveRepositoryContextValue | undefined>(undefined);

export function ActiveRepositoryProvider({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<string | null>(null);
  const value = useMemo<ActiveRepositoryContextValue>(
    () => ({ root, setActiveRepository: setRoot }),
    [root],
  );
  return (
    <ActiveRepositoryContext.Provider value={value}>{children}</ActiveRepositoryContext.Provider>
  );
}

export function useActiveRepository(): ActiveRepositoryContextValue {
  const context = useContext(ActiveRepositoryContext);
  if (context === undefined) {
    throw new Error('useActiveRepository must be used within an ActiveRepositoryProvider');
  }
  return context;
}
