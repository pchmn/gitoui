import type { RefObject } from 'react';

/** A Change row's identity as tagged on the DOM by `ChangeRow` (`data-change-path`/`-kind`). */
type ChangeRowRef = { path: string; kind: string | undefined };

/**
 * `↑`/`↓` handler for a Change listbox: walks the rendered `[data-change-path]` rows (DOM order, so
 * collapsed groups are excluded) from the open file to its neighbour, clamping at both ends (no
 * wrap), then focuses the target so the ring follows and the next arrow stays on the list. Driven by
 * the open-file state, not DOM focus — mirrors `CommitGraph`'s selection-driven nav.
 *
 * Shared by the working-tree Changes panel and the Commit-detail file list: the caller supplies how
 * a row matches the open file and how it opens, since their diff sources differ (axis vs commit).
 */
export function changeListArrowNav<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  matchesOpenFile: (row: ChangeRowRef) => boolean,
  openRow: (row: ChangeRowRef) => void,
) {
  return (event: { key: string; preventDefault: () => void }) => {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const container = containerRef.current;
    if (container === null) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-change-path]'));
    const current = rows.findIndex((row) =>
      matchesOpenFile({ path: row.dataset.changePath ?? '', kind: row.dataset.changeKind }),
    );
    if (current < 0) return;
    const target = rows[current + direction];
    if (target === undefined) return;
    openRow({ path: target.dataset.changePath ?? '', kind: target.dataset.changeKind });
    // The row is already mounted and survives the re-open, so focus it next frame to move the ring
    // and reveal it — keeping the following arrow on the list.
    requestAnimationFrame(() => target.focus());
  };
}
