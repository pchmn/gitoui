import type { ChangeKind, StatusEntry } from '@gitoui/contracts/git';

/**
 * Optimistic axis moves for staging (issue #62). Staging folds a path's Working-tree change into the
 * index, so the path ends up Staged only; unstaging moves the index change back, so it ends up
 * Unstaged only (git's two-axis model, CONTEXT.md). These are best-effort approximations of what the
 * next `git status` will report — enough to move the row to the right group INSTANTLY on click; the
 * real Status refetch reconciles kind/stats a moment later. Pure functions — no IO — so they can be
 * unit-tested and reused by the mutation hook's optimistic `onMutate`.
 *
 * Kind mapping across the axis boundary: staging an Untracked path shows it as `added`; unstaging an
 * `added` path shows it as Untracked again. Anything else keeps its kind. Existing line-count stats
 * are carried over (they may be slightly off until the refetch settles — the row position is what
 * matters for perceived speed).
 */
export function toStaged(entry: StatusEntry): StatusEntry {
  // Already Staged-only — staging is a no-op (also the already-staged rows during "Stage all").
  if (entry.staged && !entry.unstaged) return entry;
  const kind: ChangeKind =
    entry.staged?.kind ??
    (entry.unstaged?.kind === 'untracked' ? 'added' : (entry.unstaged?.kind ?? 'modified'));
  return { ...entry, staged: { ...(entry.staged ?? entry.unstaged), kind }, unstaged: undefined };
}

export function toUnstaged(entry: StatusEntry): StatusEntry {
  // Already Unstaged-only — unstaging is a no-op.
  if (entry.unstaged && !entry.staged) return entry;
  const kind: ChangeKind =
    entry.unstaged?.kind ??
    (entry.staged?.kind === 'added' ? 'untracked' : (entry.staged?.kind ?? 'modified'));
  return { ...entry, unstaged: { ...(entry.unstaged ?? entry.staged), kind }, staged: undefined };
}

/** Stage one path: move just that entry onto the Staged axis. */
export const stageOne = (entries: readonly StatusEntry[], path: string): StatusEntry[] =>
  entries.map((e) => (e.path === path ? toStaged(e) : e));

/** Unstage one path: move just that entry onto the Unstaged axis. */
export const unstageOne = (entries: readonly StatusEntry[], path: string): StatusEntry[] =>
  entries.map((e) => (e.path === path ? toUnstaged(e) : e));

/** Stage everything: every entry ends up Staged-only. */
export const stageAllEntries = (entries: readonly StatusEntry[]): StatusEntry[] =>
  entries.map(toStaged);

/** Unstage everything: every entry ends up Unstaged-only. */
export const unstageAllEntries = (entries: readonly StatusEntry[]): StatusEntry[] =>
  entries.map(toUnstaged);
