# Commit-graph lane layout is computed in the renderer, not `core`

The IPC contract for the Commit graph carries **topology** — each `Commit` ships its `parents` and the
`refs` sitting on it — but **no presentation**: no lane index, column, or edge. The renderer derives
lane positions and the edges to draw as a **pure function over the `commits` collection**, recomputed as
a memoized/derived view. `core` stays a git engine; it never becomes a layout engine.

Rationale: layout is a derived view of the same data, so it belongs where the views live (the renderer,
on TanStack DB). Keeping it there means re-layout on filter / collapse / load-more is **instant and
local — zero IPC round-trip** — and the frozen `Commit` contract (topology, not presentation) is the
correct boundary. It also honors the architecture invariant that the renderer is plain data + TanStack
and `core` is the typed git engine.

## Considered options

- **`core` computes the layout and ships lane positions over IPC** — rejected. It would force the
  contract to carry presentation (lane index, edges), so we'd have frozen it the wrong way; every
  re-layout (filter, collapse, load-more) would need an IPC round-trip; and it pushes presentation logic
  into the git engine. The main process is not a free thread either — IPC and git already run there.

## Consequences / accepted trade-offs

- The layout algorithm runs in the renderer (single-threaded JS). On very large graphs this risks UI
  jank. Mitigated by computing **incrementally per loaded page** (carry the open-lanes state forward as
  pages stream in) and, only if needed later, moving the computation to a **Web Worker** — an
  optimization, not a paradigm change.
- Lane layout must be incremental/stateful across pages because the graph is paginated: a page's lanes
  depend on the topology of the rows above it.
