import type { Commit } from '@gitoui/contracts/git';

/** One open lane in the frontier: the SHA it expects next, or `null` for a freed, reusable slot. */
export type FrontierLane = { expects: string } | null;

/**
 * The carried state of the incremental sweep between pages: which lanes are open and what each
 * expects, plus whether the HEAD-reserved column (0) has already been claimed. `lanes[i] === null`
 * means column `i` is free and reusable from the next row processed against this frontier on.
 */
export type Frontier = {
  lanes: readonly FrontierLane[];
  headSeen: boolean;
  /**
   * Divergence transitions opened by the last row of the previous page (ADR 0007 rule 4) that
   * belong on the *next* row's `above` — i.e. the half of the interstice not yet attached to a
   * row, carried across the page boundary so the incremental sweep matches the single-pass one.
   */
  pendingAbove: readonly Transition[];
};

/** A half-curve within one row's interstice: the lane column above/below it changes. */
export type Transition = { fromCol: number; toCol: number };

/** One row's lane assignment and the row-local segments needed to render it (ADR 0007). */
export type LayoutRow = {
  sha: string;
  /** The Commit's lane. */
  col: number;
  /** `parents.length >= 2`. */
  isMerge: boolean;
  /** Columns whose line passes straight through this row, unaffected by its own transitions. */
  verticals: number[];
  /** Half-curves in the interstice above this row. */
  above: Transition[];
  /** Half-curves in the interstice below this row. */
  below: Transition[];
};

const EMPTY_FRONTIER: Frontier = { lanes: [], headSeen: false, pendingAbove: [] };

/** The subset of `Commit` the sweep needs — no diff/message fields, just the DAG + decoration. */
type LayoutCommit = Pick<Commit, 'sha' | 'parents' | 'refs'>;

function isHeadCommit(commit: LayoutCommit): boolean {
  return commit.refs.some((ref) => ref._tag === 'Head' || (ref._tag === 'Branch' && ref.current));
}

/** Leftmost index `>= minCol` that is `null` (free), extending the array if none exists yet. */
function allocateSlot(lanes: FrontierLane[], minCol: number): number {
  let col = minCol;
  while (col < lanes.length && lanes[col] !== null) col++;
  while (lanes.length < col) lanes.push(null);
  if (col === lanes.length) lanes.push(null);
  return col;
}

/**
 * The pure lane-layout sweep (ADR 0007): walks a page of topo-ordered Commits (children before
 * parents) top-to-bottom, threading a frontier of open lanes, and emits one `LayoutRow` per Commit
 * plus the `frontierOut` to feed into the next page's call. Zero DOM, zero rendering — rendering
 * consumes the row-local segments (`verticals`/`above`/`below`) in a later slice.
 */
export function laneLayout(
  commits: ReadonlyArray<LayoutCommit>,
  frontierIn: Frontier = EMPTY_FRONTIER,
): { rows: LayoutRow[]; frontierOut: Frontier } {
  const lanes: FrontierLane[] = [...frontierIn.lanes];
  let headSeen = frontierIn.headSeen;
  // Divergences opened by the previous row (rule 4), waiting to land on the next row's `above`.
  let pendingAbove: Transition[] = [...frontierIn.pendingAbove];

  const rows: LayoutRow[] = [];

  for (const commit of commits) {
    const above: Transition[] = [...pendingAbove];
    pendingAbove = [];

    // Rule 2/3: claim the leftmost lane already expecting this SHA, or allocate a fresh one.
    let col: number;
    const claimIdx = lanes.findIndex((lane) => lane !== null && lane.expects === commit.sha);
    if (claimIdx !== -1) {
      col = claimIdx;
      // Every *other* lane expecting the same SHA converges into this one (rule 2, rule 6).
      for (let i = 0; i < lanes.length; i++) {
        if (i === col) continue;
        const lane = lanes[i];
        if (lane && lane.expects === commit.sha) {
          above.push({ fromCol: i, toCol: col });
          const previousRow = rows[rows.length - 1];
          previousRow?.below.push({ fromCol: i, toCol: col });
          lanes[i] = null;
        }
      }
    } else if (isHeadCommit(commit) && !headSeen) {
      // Rule 3: lane 0 is reserved for HEAD until the HEAD-decorated Commit is seen.
      col = allocateSlot(lanes, 0);
      headSeen = true;
    } else {
      col = allocateSlot(lanes, headSeen ? 0 : 1);
    }

    // Rule 5: every non-null lane other than this row's own, snapshotted right after convergence
    // freed dying lanes above but before this row's own parent-step opens/moves anything — the
    // lines that pass straight through this row's band untouched by either.
    const verticals = lanes.reduce<number[]>((cols, lane, i) => {
      if (lane !== null && i !== col) cols.push(i);
      return cols;
    }, []);

    const row: LayoutRow = {
      sha: commit.sha,
      col,
      isMerge: commit.parents.length >= 2,
      verticals,
      above,
      below: [],
    };
    rows.push(row);

    // Rule 4: the Commit's lane expects its first parent (branches stay straight); every other
    // parent joins an existing lane or opens a new one, diverging from this row.
    const [firstParent, ...otherParents] = commit.parents;
    if (firstParent === undefined) {
      // No parents: this lane frees after its row.
      lanes[col] = null;
    } else {
      // Rule 6, resolved eagerly (not deferred to when `firstParent` is itself claimed — that
      // would require mutating a row from a page that may already be finalized): if some other
      // lane already expects the same first parent, the two lanes collapse right here. The
      // leftmost of the two columns survives and keeps the expectation; the other one dies.
      const existingIdx = lanes.findIndex((lane) => lane !== null && lane.expects === firstParent);
      if (existingIdx !== -1) {
        const survivor = Math.min(col, existingIdx);
        const dying = Math.max(col, existingIdx);
        const transition: Transition = { fromCol: dying, toCol: survivor };
        row.below.push(transition);
        pendingAbove.push(transition);
        lanes[dying] = null;
        if (survivor === col) lanes[col] = { expects: firstParent };
      } else {
        lanes[col] = { expects: firstParent };
      }

      for (const parent of otherParents) {
        const otherExistingIdx = lanes.findIndex(
          (lane) => lane !== null && lane.expects === parent,
        );
        const toCol = otherExistingIdx !== -1 ? otherExistingIdx : allocateSlot(lanes, 0);
        if (otherExistingIdx === -1) lanes[toCol] = { expects: parent };
        const transition: Transition = { fromCol: col, toCol };
        row.below.push(transition);
        pendingAbove.push(transition);
      }
    }
  }

  // Trim only the trailing free slots — a middle `null` stays (it's a reusable gap whose column
  // index must stay stable for the lanes to its right).
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

  return { rows, frontierOut: { lanes, headSeen, pendingAbove } };
}
