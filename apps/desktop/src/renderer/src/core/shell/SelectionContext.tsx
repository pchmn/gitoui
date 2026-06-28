import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';

/**
 * UI selection state for the rail (issue #24). `selectedRef` is a client-only focus signal —
 * it is not server data, never touches TanStack Query. "Select" means the row has UI focus
 * (for the future graph highlight); it is NOT the same as "Switch" (moving HEAD).
 *
 * Scoped to the active Repository: when the repo root changes, selection resets to `null`.
 */
type SelectionContextValue = {
  readonly selectedRef: string | null;
  readonly select: (ref: string | null) => void;
};

const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { root } = useActiveRepository();
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  // Reset selection when the active repository changes.
  useEffect(() => {
    setSelectedRef(null);
  }, [root]);

  const value = useMemo<SelectionContextValue>(
    () => ({ selectedRef, select: setSelectedRef }),
    [selectedRef],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelectedRef(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error('useSelectedRef must be used within a SelectionProvider');
  }
  return context;
}
