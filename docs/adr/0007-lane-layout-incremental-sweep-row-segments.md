# Commit-graph lanes: incremental sweep emitting row-local segments

The Commit graph is paginated (issue #44) and its layout is computed in the renderer (ADR 0006), so
the lane algorithm must be incremental: a pure function `(commits, frontierIn) → (rows, frontierOut)`
where the frontier is the ordered list of open lanes and the SHA each one expects next. We chose the
classic **single-pass sweep** (gitk/GitKraken family): walking Commits top-to-bottom in topological
order, a Commit claims the leftmost lane expecting its SHA (other expecting lanes converge into it and
free), or opens a new lane in the leftmost free slot; its **first parent inherits its lane** (branches
stay straight), other parents join or open lanes. **Lane 0 is reserved for HEAD**: until the
HEAD-decorated Commit appears, new lanes allocate from column 1 — a sweep rule, so the pin never
depends on git's tip-emission order.

The function's output is **row-local segments**, not global edges: every edge is decomposed into
per-row pieces (a vertical run in a column, a node, a transition curve), and any column change is
confined to a single row interstice as an S-curve (split at the row boundary at the midpoint column
with vertical tangents, so the join is invisible). This is what makes virtualization trivial —
rendering the visible window means rendering the visible rows' segments, nothing else — and it
decouples the layout from the rendering tech (per-row inline SVG today; a single translated layer or
canvas later would consume the same segments).

## Considered options

- **Global two-pass DAG layout** (crossing minimization) — rejected: better in theory, but its state
  is the whole graph, which is incompatible with per-page incremental layout under pagination.
- **Direct diagonal edges** — rejected: an edge spanning k rows is local to none of them, which breaks
  windowed rendering and reads as noise across lanes.
- **Canvas / single-SVG-layer rendering** — deferred, not rejected: per-row SVG composes with TanStack
  Virtual for free (mount/scroll/theme via `var(--lane-N)`), and ~30 visible rows need no more. The
  segment output keeps the escape hatch open.

## Consequences

- A freed column is reusable from the next row on, so graph width is bounded by *concurrent* branch
  width; two different branches may occupy the same column (and color) at different heights —
  accepted, since legibility rests on position + lightness + ref label, not "one color = one branch".
- Lane color is keyed to the column: `lane-((col % 5) + 1)`, stable across pages via the frontier. An
  edge segment takes the color of the column of its vertical run (the line it belongs to).
- The sweep requires strict children-before-parents order, so `listCommits` with `scope: 'allRefs'`
  **implies `--topo-order`** in `core` (scope semantics, not an extra option); the default `'head'`
  scope keeps today's date-ordered behavior. "All Refs" is the explicit
  `HEAD --branches --remotes --tags` — not `--all`, which would drag in `refs/stash`/`refs/notes`
  (not Refs in the glossary). The walk stays fully local; `--topo-order` buffers it, mitigated by
  git's commit-graph file.

## Amendment: elbow routing and fork-point convergence (issue #56 legibility pass)

Two changes over the original model, made together because the second is what gives the first its
meaning:

**Elbow routing replaces the midpoint S-curve.** The S-curve read as a shallow diagonal once real
merges spanned several columns (~90px of horizontal travel over a 32px row crosses every
intermediate lane at a near-flat angle — spaghetti). Transitions are now routed **orthogonally**
(the transit-map elbow): the bend is a compact rounded quarter-corner confined to one half-row,
everything else is vertical, so crossings with passing lanes stay perpendicular. Which half a
transition sits in determines its shape:

- **`below` = diverge** — the edge starts at the row's node (a merge's non-first parents). It
  bends immediately: horizontal at the node's row center, corner, vertical down the target column.
- **`above` = converge** — a branch lane folds into the row's node. It stays vertical down its own
  column and bends at the destination row's center.

**Eager first-parent collapse (the old rule 6) is removed.** It bent a branch away from its column
right below its last commit, which drew the fork with the *inverted* angle: a branch that forks
off main should visually leave main at the fork-point commit, not dive into main's column at its
own tip. A lane now stays open — riding its own column — until its expected SHA is claimed, and
folds in at that row via claim-time convergence (rule 2): the bend lands exactly on the fork
point, the GitKraken-familiar shape. The cost is honest width: a branch holds its column down to
its fork point, so width is bounded by branches *concurrently visible*, not concurrently alive.

This also *simplifies* the incremental contract. Each transition is recorded (and drawn) exactly
once, on the row whose half-interstice contains the bend; the rest of every edge is plain
verticals already carried by `verticals`/own-column segments. No half ever lands on an
already-emitted row, so the `pendingAbove` carry disappears from the `Frontier` and the sweep
never mutates a previous page. `LayoutRow` gained `lineAbove`/`lineBelow` (does the own column
connect straight up/down?) so tips carry no stub above the node, roots none below, and the node
sits in a small clearance gap that keeps it legible over any row background.
