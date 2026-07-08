import type { Ref } from '@gitoui/contracts/git';
import type { LayoutRow } from './laneLayout';

/**
 * One lane run: a contiguous occupation of a column, from the row that opened it (a tip's fresh
 * lane, or the merge row whose diverging edge opened it) down to the row where it folds into its
 * fork point (or the end of the loaded rows). The visual unit "a branch line" the pointer hovers.
 */
export type LaneRun = {
  id: number;
  col: number;
  /** First row index the run covers. */
  fromRow: number;
  /** Last row index the run covers — its fork-point row, its root, or the last loaded row. */
  toRow: number;
  /** Row indexes of the Commits sitting on this run (rows whose own lane is this run). */
  commitRows: number[];
  /**
   * The name shown on hover: the full Ref name carried by the run's topmost decorated Commit,
   * or — for an anonymous line (its Branch merged and deleted, or its tip beyond the loaded
   * window) — a name recovered from a conventional merge subject on or opening the run.
   */
  label: string | null;
};

/** The subset of `Commit` the runs need: the decoration, plus the subject for the merge-name fallback. */
type RunsCommit = { refs: readonly Ref[]; subject?: string };

/** The hover name: a local Branch first, else a remote-tracking one; Tags don't name lines. */
function labelFromRefs(refs: readonly Ref[] | undefined): string | null {
  if (!refs) return null;
  for (const ref of refs) if (ref._tag === 'Branch') return ref.name;
  for (const ref of refs) if (ref._tag === 'RemoteBranch') return ref.name;
  return null;
}

/**
 * Git's conventional merge subject, `Merge [remote-tracking] branch 'X' [into Y]`: X names the
 * merged-in line (the second parent's run), Y the line carrying the merge Commit. Subjects are
 * convention, not truth (they can be reworded), which is acceptable for a hover hint — a real
 * Ref always wins over this fallback.
 */
const MERGE_SUBJECT = /^Merge (?:remote-tracking )?branch '([^']+)'(?: into (.+))?$/;

/**
 * Derives the lane runs from laid-out rows (pure, renderer-side — mirrors the sweep's lane
 * lifecycle without re-running it): a run opens where a Commit lands on a fresh lane or a
 * diverging edge opens/joins a column, extends through verticals, and closes where the lane
 * converges into its fork point (`above`) or its Commit is a root (`lineBelow === false`).
 */
export function computeLaneRuns(
  rows: readonly LayoutRow[],
  commits: readonly RunsCommit[],
): LaneRun[] {
  const runs: LaneRun[] = [];
  const open = new Map<number, LaneRun>();
  // Merge-subject name hints, applied only to runs no Ref ever names (a Ref always wins).
  const hints = new Map<LaneRun, string>();

  const openRun = (col: number, fromRow: number): LaneRun => {
    const run: LaneRun = {
      id: runs.length,
      col,
      fromRow,
      toRow: fromRow,
      commitRows: [],
      label: null,
    };
    runs.push(run);
    open.set(col, run);
    return run;
  };

  rows.forEach((row, r) => {
    // Converging lanes end here — this row is their fork point, the bend included in the range.
    for (const t of row.above) {
      const run = open.get(t.fromCol);
      if (run) {
        run.toRow = r;
        open.delete(t.fromCol);
      }
    }
    for (const col of row.verticals) {
      const run = open.get(col);
      if (run) run.toRow = r;
    }
    // The Commit's own lane: part of an open run, or a tip opening a fresh one.
    const run = open.get(row.col) ?? openRun(row.col, r);
    run.toRow = r;
    run.commitRows.push(r);
    if (run.label === null) run.label = labelFromRefs(commits[r]?.refs);
    // A merge's subject names both sides of the merge: `into Y` names this run (the line the
    // merge Commit rides), `branch 'X'` names the second parent's line it opens below.
    const merge = row.isMerge ? MERGE_SUBJECT.exec(commits[r]?.subject ?? '') : null;
    if (merge?.[2] !== undefined && !hints.has(run)) hints.set(run, merge[2]);
    if (!row.lineBelow) open.delete(row.col);
    // Diverging edges open their target column (a merge edge IS the branch's line), or extend it.
    for (const t of row.below) {
      const target = open.get(t.toCol);
      if (target) target.toRow = r;
      else {
        const opened = openRun(t.toCol, r);
        // Only an unambiguous 2-parent merge names the line it opens (octopus merges name none).
        if (merge?.[1] !== undefined && row.below.length === 1) hints.set(opened, merge[1]);
      }
    }
  });

  // The fallback applies only where no Ref named the run at all.
  for (const run of runs) {
    if (run.label === null) run.label = hints.get(run) ?? null;
  }

  return runs;
}

/** The run occupying `col` at row `rowIndex`, if any — the hover hit-test. */
export function runAt(runs: readonly LaneRun[], rowIndex: number, col: number): LaneRun | null {
  return (
    runs.find((run) => run.col === col && run.fromRow <= rowIndex && rowIndex <= run.toRow) ?? null
  );
}
