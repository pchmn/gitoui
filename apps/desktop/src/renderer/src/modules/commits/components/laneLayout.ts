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
};

/**
 * One elbow bend, drawn entirely within one half of one row (elbow routing, ADR 0007 amendment).
 * Which half it lives in determines its shape: a `below` transition *diverges* from the row's node
 * (horizontal at the row's center, quarter-corner, vertical down `toCol`); an `above` transition
 * *converges* into this row (vertical at `fromCol` from the row boundary, quarter-corner,
 * horizontal into `toCol` at the row's center). The rest of each edge is plain verticals, already
 * carried by the rows' vertical segments — every edge is recorded (and drawn) exactly once.
 */
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
  /** Converging edges bending into this row's node (lanes that expected this Commit's SHA). */
  above: Transition[];
  /** Diverging edges leaving this row's node (a merge's non-first parents joining/opening lanes). */
  below: Transition[];
  /**
   * A child's edge arrives straight into this node from above — the Commit was claimed by an open
   * lane. False for a tip (fresh lane): nothing to draw above the node.
   */
  lineAbove: boolean;
  /** The Commit's lane continues straight below toward its first parent. False for a root. */
  lineBelow: boolean;
};

const EMPTY_FRONTIER: Frontier = { lanes: [], headSeen: false };

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

  const rows: LayoutRow[] = [];

  for (const commit of commits) {
    const above: Transition[] = [];

    // Rule 2/3: claim the leftmost lane already expecting this SHA, or allocate a fresh one.
    let col: number;
    const claimIdx = lanes.findIndex((lane) => lane !== null && lane.expects === commit.sha);
    if (claimIdx !== -1) {
      col = claimIdx;
      // Every *other* lane expecting the same SHA converges into this one right here (rule 2) —
      // this row is those branches' fork point, where their lines bend in from their own columns.
      for (let i = 0; i < lanes.length; i++) {
        if (i === col) continue;
        const lane = lanes[i];
        if (lane && lane.expects === commit.sha) {
          above.push({ fromCol: i, toCol: col });
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
      lineAbove: claimIdx !== -1,
      lineBelow: false,
    };
    rows.push(row);

    // Rule 4: the Commit's lane expects its first parent (branches stay straight); every other
    // parent joins an existing lane or opens a new one, diverging from this row.
    const [firstParent, ...otherParents] = commit.parents;
    if (firstParent === undefined) {
      // No parents: this lane frees after its row.
      lanes[col] = null;
    } else {
      // Even when another lane already expects the same first parent, this lane stays open: both
      // ride their own columns down and fold together at the parent's row — the fork point — via
      // the claim-time convergence above (ADR 0007 amendment). Collapsing eagerly here would bend
      // the branch away right below this node, inverting the fork's visual direction.
      lanes[col] = { expects: firstParent };
      row.lineBelow = true;

      for (const parent of otherParents) {
        const otherExistingIdx = lanes.findIndex(
          (lane) => lane !== null && lane.expects === parent,
        );
        const toCol = otherExistingIdx !== -1 ? otherExistingIdx : allocateSlot(lanes, 0);
        if (otherExistingIdx === -1) lanes[toCol] = { expects: parent };
        row.below.push({ fromCol: col, toCol });
      }
    }
  }

  // Trim only the trailing free slots — a middle `null` stays (it's a reusable gap whose column
  // index must stay stable for the lanes to its right).
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

  return { rows, frontierOut: { lanes, headSeen } };
}
