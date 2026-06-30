import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';

/**
 * A discriminated key that uniquely identifies a rail row across all section kinds. Using `(kind,
 * id)` prevents a Tag and a Branch that share a name from both highlighting.
 *
 * UI selection state for the rail (issue #24, extended in issue #33). `selection` is a
 * client-only focus signal — it is not server data, never touches TanStack Query. "Select" means
 * the row has UI focus (for the future graph highlight); it is NOT the same as "Switch" (moving
 * HEAD).
 *
 * Scoped to the active Repository: when the repo root changes, selection resets to `null`.
 */
export type RailSelection = {
  kind: 'branch' | 'remote' | 'remote-branch' | 'tag' | 'stash';
  id: string;
};

type SelectionContextValue = {
  readonly selection: RailSelection | null;
  readonly select: (sel: RailSelection | null) => void;
  readonly isSelected: (sel: RailSelection) => boolean;
};

const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { root } = useActiveRepository();
  const [selection, setSelection] = useState<RailSelection | null>(null);

  // Reset selection when the active repository changes.
  useEffect(() => {
    setSelection(null);
  }, [root]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      selection,
      select: setSelection,
      isSelected: (sel) =>
        selection !== null && selection.kind === sel.kind && selection.id === sel.id,
    }),
    [selection],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
}

/**
 * @deprecated Use `useSelection` instead. Kept temporarily while migrating call sites.
 */
export function useSelectedRef(): SelectionContextValue {
  return useSelection();
}
