import type { Commit, Ref, StatusEntry } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { RefPill } from '@gitoui/ui/ref-pill';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { CHANGE_ICON, CHANGE_LETTER_TONE } from '#renderer/modules/changes/components/changeGlyph';
import { useStatus } from '#renderer/modules/changes/hooks/useStatus';
import {
  type CommitSelection,
  useCommitSelection,
} from '#renderer/modules/commits/CommitSelectionContext';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { formatRelativeTime } from '#renderer/shared/utils/relativeTime';
import { useCommits } from '../hooks/useCommits';
import { AuthorAvatar } from './AuthorAvatar';
import type { Frontier, LayoutRow, Transition } from './laneLayout';
import { laneLayout } from './laneLayout';
import { computeLaneRuns, runAt } from './laneRuns';

/** Fixed row height (DESIGN.md dense Label-size row) — `estimateSize` doesn't need to be exact, but this is. */
const ROW_HEIGHT_PX = 32;

/** Request the next page once the loaded window is within this many rows of the visible end. */
const LOAD_MORE_THRESHOLD = 20;

/** Fixed width of the REFS zone (ref pills), left-aligned and truncating, ahead of the lanes zone. */
const REFS_ZONE_WIDTH_PX = 112;

/** Horizontal spacing between lane columns (issue #56, starting constant — to be tuned visually). */
const LANE_PITCH = 16;

/** Commit-node circle radius. */
const NODE_RADIUS = 4.5;

/** Lane line / node-ring stroke width. */
const STROKE_WIDTH = 2;

/**
 * Clearance kept clear of lane lines around a node's center, so the node pops out of its own lane
 * (the gap shows the row's real background — no halo color to mismatch hover/selected fills) and a
 * merge ring stays hollow.
 */
const NODE_CLEARANCE = NODE_RADIUS + 2;

/** Corner radius of a transition's elbow — half the pitch keeps adjacent-column turns round. */
const ELBOW_RADIUS = LANE_PITCH / 2;

/**
 * The lanes zone caps at this many visible columns; a wider graph scrolls horizontally behind a
 * shared scrollbar instead of pushing the COMMIT column away (lanes hold their columns down to
 * their fork point, so a busy repo is honestly wide).
 */
const LANES_MAX_WIDTH_PX = 12 * LANE_PITCH;

/** Lane *lines* rest a touch translucent so the graph reads light; nodes stay full and crisp. */
const LANE_REST_OPACITY = 0.8;

/**
 * Row-tint ladder (% of the row's own lane color over the canvas): a barely-there wash at rest,
 * a lifted step for the armed run's members, a stronger step for the row under the pointer, and
 * the strongest — persistent — step for the selected row. Always the lane's own color, never a
 * neutral: a muted hover or an Accent-Surface selection would be the one neutral fill in a
 * lane-tinted column and break out of a highlighted run instead of reading as part of it (the
 * selection is one of the places saturated color is *spent*, per the Spent Color Rule — in the
 * graph it wears the lane's color, unlike the rail's Accent-Surface selection).
 */
const ROW_TINT_REST = 6;
const ROW_TINT_MEMBER = 16;
const ROW_TINT_HOVER = 26;
const ROW_TINT_SELECTED = 36;

/** While a run is hovered, every other line recedes to this — the hovered branch pops. */
const LANE_DIM_OPACITY = 0.35;

/** Other lanes' nodes recede more gently than their lines — Commits stay locatable. */
const NODE_DIM_OPACITY = 0.5;

/**
 * Hover intent: the run highlight arms only after the pointer rests this long, so sweeping the
 * list (scrolling, reaching for a control) never flickers the whole graph. Leaving a row resets
 * everything immediately — only the arming is deferred.
 */
const HOVER_INTENT_MS = 500;

/** Lane column → CSS custom property, wrapping through the 5 `--lane-*` tokens (ADR 0007). */
function laneColor(col: number): string {
  return `var(--lane-${(col % 5) + 1})`;
}

/** Pixel center of a lane column within the lanes-zone SVG. */
function laneX(col: number): number {
  return col * LANE_PITCH + LANE_PITCH / 2;
}

/** The widest column referenced by any row's node, vertical, or transition endpoint. */
function maxLaneColumn(rows: readonly LayoutRow[]): number {
  let max = 0;
  for (const row of rows) {
    max = Math.max(max, row.col, ...row.verticals);
    for (const t of row.above) max = Math.max(max, t.fromCol, t.toCol);
    for (const t of row.below) max = Math.max(max, t.fromCol, t.toCol);
  }
  return max;
}

/**
 * A diverging edge's bend (elbow routing, ADR 0007 amendment): it leaves the node horizontally at
 * the row's center, turns a rounded quarter-corner down into the target column, and runs vertical
 * to the row boundary — crossings with passing lanes stay perpendicular instead of smearing into
 * shallow diagonals. `fromCol === toCol` degenerates to the straight drop below the node.
 */
function divergePath(fromX: number, toX: number): string {
  const half = ROW_HEIGHT_PX / 2;
  if (fromX === toX) return `M ${toX} ${half + NODE_CLEARANCE} V ${ROW_HEIGHT_PX}`;
  const dir = Math.sign(toX - fromX);
  return [
    `M ${fromX + dir * NODE_CLEARANCE} ${half}`,
    `H ${toX - dir * ELBOW_RADIUS}`,
    `Q ${toX} ${half} ${toX} ${half + ELBOW_RADIUS}`,
    `V ${ROW_HEIGHT_PX}`,
  ].join(' ');
}

/**
 * A converging edge's bend (elbow routing): the branch's lane stays vertical from the row
 * boundary, turns a rounded quarter-corner at the row's center, and runs horizontally into the
 * fork-point node — trimmed at the node's clearance when the destination is this row's own node.
 */
function convergePath(fromX: number, toX: number, intoNode: boolean): string {
  const half = ROW_HEIGHT_PX / 2;
  const dir = Math.sign(toX - fromX);
  return [
    `M ${fromX} 0`,
    `V ${half - ELBOW_RADIUS}`,
    `Q ${fromX} ${half} ${fromX + dir * ELBOW_RADIUS} ${half}`,
    `H ${intoNode ? toX - dir * NODE_CLEARANCE : toX}`,
  ].join(' ');
}

/** The subset of `Commit` the sweep needs — mirrors `laneLayout`'s own `LayoutCommit`. */
type LayoutCommit = Pick<Commit, 'sha' | 'parents' | 'refs'>;

/**
 * Incremental lane layout across pages (ADR 0006/0007, issue #56): a page-append only runs
 * `laneLayout` over the newly-arrived Commits, feeding the previous call's `frontierOut` back in —
 * never recomputing earlier pages. A different head Commit (repo or Branch switch) invalidates the
 * whole cache, mirroring `CommitGraph`'s own snap-to-top detection.
 */
function useLaneLayout(commits: readonly LayoutCommit[]): LayoutRow[] {
  const cache = useRef<{
    headSha: string | undefined;
    rows: LayoutRow[];
    frontier: Frontier | undefined;
  }>({ headSha: undefined, rows: [], frontier: undefined });

  const headSha = commits[0]?.sha;
  if (cache.current.headSha !== headSha) {
    cache.current = { headSha, rows: [], frontier: undefined };
  }

  if (commits.length > cache.current.rows.length) {
    const newCommits = commits.slice(cache.current.rows.length);
    const { rows, frontierOut } = laneLayout(newCommits, cache.current.frontier);
    cache.current = {
      headSha,
      rows: cache.current.rows.length === 0 ? rows : cache.current.rows.concat(rows),
      frontier: frontierOut,
    };
  }

  return cache.current.rows;
}

/** Stable empty array so `useLaneLayout` doesn't see a "new" input every render while loading. */
const NO_COMMITS: readonly LayoutCommit[] = [];

/**
 * The WIP row's change summary (issue #66) in one pass over the Status:
 *
 * - **File counts by type** — how many files, grouped `modified` (incl. renamed) / `added` (incl.
 *   untracked) / `deleted`. Each entry is one path counted once, by its working-tree face (the
 *   Unstaged kind if present, else the Staged one) — so the buckets sum to the changed-file count.
 * - **Aggregate lines** `+N −N` — the sum of every per-axis `additions` / `deletions`, BOTH axes,
 *   so a path Staged AND Unstaged contributes twice, exactly as the Inspector's panel counts it (a
 *   both-axes path shows one row per group). Entries without stats (binary, untracked) add 0.
 */
function summarizeWip(entries: readonly StatusEntry[] | undefined): {
  additions: number;
  deletions: number;
  modified: number;
  added: number;
  deleted: number;
} {
  let additions = 0;
  let deletions = 0;
  let modified = 0;
  let added = 0;
  let deleted = 0;
  for (const entry of entries ?? []) {
    additions += (entry.staged?.additions ?? 0) + (entry.unstaged?.additions ?? 0);
    deletions += (entry.staged?.deletions ?? 0) + (entry.unstaged?.deletions ?? 0);
    const kind = entry.unstaged?.kind ?? entry.staged?.kind;
    if (kind === 'deleted') deleted++;
    else if (kind === 'added' || kind === 'untracked') added++;
    else modified++;
  }
  return { additions, deletions, modified, added, deleted };
}

/** The armed hover: which run is lifted. */
type HoverState = {
  runId: number;
};

/**
 * The Commit graph: history for the current Branch (HEAD), one dense row per Commit, virtualized
 * (TanStack Virtual — only visible rows mount) and paged incrementally (issue #44): `useCommits`
 * loads a first page instantly, and scrolling toward the loaded end requests the next one. Columns
 * per DESIGN.md `GRAPH · REFS` / `COMMIT` / `AUTHOR` — GRAPH · REFS carries a fixed-width REFS zone
 * (ref pills, issue #43) followed by the lanes zone at a fixed origin (colored lanes, nodes, and
 * merge/branch edges, issue #56, over `laneLayout` from #55), COMMIT shows the subject, AUTHOR
 * rests as just a relative date + the author's circular avatar pinned at the row's right edge —
 * the name is hidden until the row is hovered or selected, then appears to the avatar's right,
 * nudging the date + avatar left (the avatar's identity color carries "who" down the column at
 * rest). Clicking a row selects its
 * Commit (issue
 * #46, via `CommitSelectionContext`) — every row fill is a step of the lane-tint ladder, selection
 * being the strongest, persistent one (it outranks hover), per DESIGN.md's Commit-Graph spec.
 * Keyboard navigation through Commits is out of scope here.
 *
 * Mirrors `BranchesSection`'s loading/error/empty states, adapted to the center column: skeleton
 * rows on pending (no spinner), a centered "No commits yet" empty state, and — since the primary
 * content here is what failed, not an out-of-band event — a centered inline `role="alert"` message
 * via `matchError` with a retry, never a toast.
 */
export function CommitGraph({ root }: { root: string }) {
  const {
    data: commits,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    retry,
  } = useCommits(root);
  const { selection, select } = useCommitSelection();

  // The dirty Working tree as a synthetic top row (issue #66): fed from the SAME status collection
  // the Inspector reads, so the row and the panel never disagree. Purely presentational — it never
  // enters the lane sweep or the frontier (below); it just overlays the lane renderer above row 0.
  const { data: status } = useStatus(root);
  const wip = useMemo(() => summarizeWip(status?.entries), [status?.entries]);
  const hasWip = (status?.entries.length ?? 0) > 0;

  const layoutRows = useLaneLayout(commits ?? NO_COMMITS);
  const maxLaneCol = useMemo(() => maxLaneColumn(layoutRows), [layoutRows]);
  const lanesWidth = (maxLaneCol + 1) * LANE_PITCH;
  const lanesViewportWidth = Math.min(lanesWidth, LANES_MAX_WIDTH_PX);
  const lanesOverflow = lanesWidth > LANES_MAX_WIDTH_PX;
  // The WIP node rides the HEAD Commit's lane column (row 0's own column) so its short dashed
  // connector drops straight into row 0's node; column 0 is the fallback before any row loads.
  const headCol = layoutRows[0]?.col ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesScrollRef = useRef<HTMLDivElement>(null);

  // Hovering a Commit row highlights its Branch's whole lane run (GitKraken-familiar): the run's
  // Commits get a stronger row tint, its line goes fully opaque while the rest recedes, and on an
  // undecorated row the run's Branch name surfaces at the left. (Rows with refs reveal their full
  // names by extending their pills — pure CSS on the REFS zone's own hover, no arming involved.)
  // Pointer-only enhancement — everything it reveals is reachable without it.
  const runs = useMemo(
    () => computeLaneRuns(layoutRows, commits ?? NO_COMMITS),
    [layoutRows, commits],
  );
  const [hover, setHover] = useState<HoverState | null>(null);
  // Hover intent (tooltip-style): arming is deferred until the pointer rests — a newer intent
  // cancels the pending one, so fast sweeps never fire. Once armed, moving along the highlighted
  // run's own rows hands the highlight over seamlessly (no reset, no re-arm delay); leaving the
  // run — any other row, or out of the rows entirely — resets immediately. `hoverRef` mirrors the
  // state *synchronously*: a row-to-row move is one native mouseout whose leave + enter React
  // dispatches in the same batch, so the enter must read the just-updated armed state, never a
  // stale render.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef<HoverState | null>(null);
  function cancelPendingHover() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function applyHover(next: HoverState | null) {
    hoverRef.current = next;
    setHover(next);
  }
  function scheduleHover(next: HoverState) {
    cancelPendingHover();
    hoverTimer.current = setTimeout(() => applyHover(next), HOVER_INTENT_MS);
  }
  function clearHover() {
    cancelPendingHover();
    applyHover(null);
  }
  useEffect(() => cancelPendingHover, []);
  const hoveredRun = hover === null ? null : (runs[hover.runId] ?? null);
  const hoveredCommitRows = useMemo(
    () => (hoveredRun === null ? null : new Set(hoveredRun.commitRows)),
    [hoveredRun],
  );
  const rowCount = commits?.length ?? 0;
  // The WIP row is prepended above the virtualized list in normal flow, so the list starts one row
  // height down: `scrollMargin` tells the virtualizer that offset (its item `start`s absorb it, its
  // `getTotalSize` doesn't) so the range math stays exact rather than leaning on overscan slack.
  const wipOffset = hasWip ? ROW_HEIGHT_PX : 0;
  // One extra virtual row for the discreet loader / end-of-history terminus, shown only when there's
  // something to say — an idle "more pages available, not fetching yet" state renders nothing.
  const showFooterRow = isFetchingNextPage || !hasNextPage;
  const virtualizer = useVirtualizer({
    count: rowCount + (showFooterRow ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
    scrollMargin: wipOffset,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // A different Commit at the head of the list means a different history (repo or Branch switch —
  // load-more appends never touch the head), so a scroll offset retained from the previous one
  // would be meaningless: snap back to the top. `scrollToOffset` (not a bare `scrollTop` write)
  // so the virtualizer's internal offset updates in the same tick.
  const headSha = commits?.[0]?.sha;
  const lastHeadSha = useRef(headSha);
  useEffect(() => {
    if (lastHeadSha.current === headSha) return;
    lastHeadSha.current = headSha;
    virtualizer.scrollToOffset(0);
    // A retained horizontal lanes offset or lane hover would be meaningless against the new
    // history too.
    scrollRef.current?.style.removeProperty('--lanes-scroll');
    if (lanesScrollRef.current) lanesScrollRef.current.scrollLeft = 0;
    clearHover();
  }, [headSha, virtualizer]);

  // Trigger the next page once the viewport nears the end of the loaded set.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const lastItem = virtualItems.at(-1);
    if (!lastItem) return;
    if (lastItem.index >= rowCount - 1 - LOAD_MORE_THRESHOLD) {
      fetchNextPage();
    }
  }, [virtualItems, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Esc clears the selection (issue #66) — graph-level, so it works wherever focus sits once a row
  // is selected. Only armed while something IS selected, and it stands down for an already-handled
  // Esc (`defaultPrevented`): the Code & Diff slice layers its own Esc-to-close ahead of this one,
  // so closing the diff never also drops the selection in the same keystroke (cascade).
  useEffect(() => {
    if (selection === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) select(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selection, select]);

  // Arrow-key navigation: ↑/↓ move the selection to the previous/next Commit instead of scrolling
  // the viewport. Driven off `selection` (app state), not DOM focus, so it survives rows
  // virtualizing in and out. The WIP row sits at the top of the sequence and both ends clamp — no
  // wrap. The handler lives on the scroll container (below) so it fires whether focus is on the WIP
  // button or a Commit row, and only when the graph itself holds focus (arrows elsewhere untouched).
  function selectAndReveal(next: CommitSelection) {
    select(next);
    if (next.kind === 'workingTree') {
      virtualizer.scrollToOffset(0);
    } else {
      const idx = (commits ?? NO_COMMITS).findIndex((c) => c.sha === next.sha);
      if (idx >= 0) virtualizer.scrollToIndex(idx);
    }
    // The target may have only just mounted after scrolling — pull focus on the next frame so the
    // focus ring follows the selection and the next key still lands on the graph. `preventScroll`
    // leaves scrolling to the virtualizer above.
    requestAnimationFrame(() => {
      const el =
        next.kind === 'workingTree'
          ? scrollRef.current?.querySelector('[data-slot="wip-row"]')
          : scrollRef.current?.querySelector(`[data-commit-sha="${next.sha}"]`);
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    });
  }

  function moveSelection(direction: 1 | -1) {
    const list = commits ?? NO_COMMITS;
    const firstSha = list[0]?.sha;
    if (firstSha === undefined) return;
    const first: CommitSelection = { kind: 'commit', sha: firstSha };
    // The top of the sequence: the WIP row when the tree is dirty, else the first Commit.
    const top: CommitSelection = hasWip ? { kind: 'workingTree' } : first;

    if (selection === null) return selectAndReveal(top);

    if (direction === -1) {
      if (selection.kind === 'workingTree') return; // already at the top — clamp
      const i = list.findIndex((c) => c.sha === selection.sha);
      if (i <= 0) return selectAndReveal(top); // from the first Commit → WIP (or clamp on a clean tree)
      const prev = list[i - 1];
      if (prev) return selectAndReveal({ kind: 'commit', sha: prev.sha });
      return;
    }

    // direction === 1 (down)
    if (selection.kind === 'workingTree') return selectAndReveal(first);
    const i = list.findIndex((c) => c.sha === selection.sha);
    if (i < 0) return selectAndReveal(first);
    if (i >= list.length - 1) return; // last loaded Commit — clamp
    const nextCommit = list[i + 1];
    if (nextCommit) return selectAndReveal({ kind: 'commit', sha: nextCommit.sha });
  }

  // Attached to the role-bearing surfaces (the listbox and the WIP button — not the static scroll
  // container, which a11y rules rightly forbid interaction handlers on): ↑/↓ move the selection,
  // preventDefault stops the native scroll. Structural param type so one handler fits both a div's
  // and a button's `onKeyDown`.
  const onArrowKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
    }
  };

  // Loading state — show skeleton rows, no spinner. Only without data: growing the loaded window
  // recompiles the live query, and the already-loaded rows must keep showing through it.
  if (isLoading && (commits === undefined || commits.length === 0)) {
    return <CommitGraphSkeleton />;
  }

  // Error state — inline (not a toast: the primary content here IS what failed, so the user is
  // already looking at it) and centered, with the typed error phrased via `matchError` and a retry
  // that clears the collection's error state and re-fetches the failing subset.
  if (isError) {
    const message = matchError<GitError<'listCommits'>, string>(error, {
      RepoNotFoundError: (e) => messages.commitGraph.repoNotFound(e.path),
      _: () => messages.commitGraph.failedToLoad,
    });
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2 px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground' role='alert'>
          {message}
        </p>
        <button
          type='button'
          onClick={retry}
          className='rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted'
        >
          {messages.commitGraph.retry}
        </button>
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <div className='flex h-full items-center justify-center px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground'>{messages.commitGraph.emptyYet}</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className='h-full overflow-auto'
      // A horizontal trackpad swipe over the rows pans the lanes viewport (the vertical axis
      // stays native): the shared scrollbar proxy is the single scroll owner, rows follow it
      // through the `--lanes-scroll` variable.
      onWheel={(e) => {
        if (!lanesOverflow || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        const proxy = lanesScrollRef.current;
        if (proxy) proxy.scrollLeft += e.deltaX;
      }}
    >
      {hasWip && (
        <WipRow
          col={headCol}
          lanesWidth={lanesWidth}
          lanesViewportWidth={lanesViewportWidth}
          summary={wip}
          selected={selection?.kind === 'workingTree'}
          onSelect={() => select({ kind: 'workingTree' })}
          onKeyDown={onArrowKeyDown}
        />
      )}
      {/* role="listbox" (on a div, not <ul>, per Biome's noNoninteractiveElementToInteractiveRole —
          same reason BranchesSection uses a div): the commit rows are selectable options, so they
          need list semantics + a keyboard path, not a static list. */}
      <div
        role='listbox'
        className='relative w-full'
        style={{ height: virtualizer.getTotalSize() }}
        aria-label='Commits'
        onKeyDown={onArrowKeyDown}
      >
        {virtualItems.map((virtualRow) => {
          const style = {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: virtualRow.size,
            // `start` is measured from the scroll container's top (it includes `scrollMargin`); the
            // `<ul>` itself already sits `scrollMargin` down (below the WIP row), so subtract it to
            // place items relative to the list's own top.
            transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
          };

          // The trailing virtual row (only present when `showFooterRow`) carries the load-more
          // indicator or the quiet end-of-history terminus — no fanfare either way.
          if (virtualRow.index >= rowCount) {
            return (
              <div
                key='footer'
                style={style}
                className='flex items-center justify-center text-xs text-muted-foreground'
                aria-live='polite'
              >
                {isFetchingNextPage
                  ? messages.commitGraph.loadingMore
                  : messages.commitGraph.endOfHistory}
              </div>
            );
          }

          const commit = commits[virtualRow.index];
          const layoutRow = layoutRows[virtualRow.index];
          if (!commit || !layoutRow) return null;

          const sha = commit.sha;
          const isRowSelected = selection?.kind === 'commit' && selection.sha === sha;
          const isRunMember = hoveredCommitRows?.has(virtualRow.index) ?? false;
          // While a run is hovered, only its own Commits stay fully legible — the other rows'
          // subject + author recede a touch so the branch reads as the foreground set.
          // Selection outranks hover (DESIGN §Commit Graph): the selected row stays fully legible
          // even while another run is hover-highlighted — it never recedes into the dimmed set.
          const isContentDimmed = hover !== null && !isRunMember && !isRowSelected;
          const highlightCol =
            hoveredRun !== null &&
            virtualRow.index >= hoveredRun.fromRow &&
            virtualRow.index <= hoveredRun.toRow
              ? hoveredRun.col
              : null;

          // The run this Commit rides — what hovering the row highlights.
          const rowRun = runAt(runs, virtualRow.index, layoutRow.col);

          function handleSelect() {
            select({ kind: 'commit', sha });
          }

          // Arm with intent when nothing is highlighted yet. Once armed, staying on the SAME run
          // (row → row along the highlighted branch) hands the highlight over seamlessly — no
          // reset, no re-arm delay; entering a row of a DIFFERENT run resets the old highlight
          // immediately and arms the new one with intent, exactly as if the pointer had left the
          // rows and come back.
          function armHover(next: HoverState | null) {
            if (next === null) {
              clearHover();
              return;
            }
            const armed = hoverRef.current;
            if (armed !== null) {
              if (armed.runId === next.runId) {
                // Same run: nothing changes — just make sure no pending re-arm survives.
                cancelPendingHover();
              } else {
                applyHover(null);
                scheduleHover(next);
              }
              return;
            }
            scheduleHover(next);
          }

          function hoverRow() {
            armHover(rowRun === null ? null : { runId: rowRun.id });
          }

          // The Branch name of the run this undecorated row rides, as a GHOST pill in the REFS
          // zone (GitKraken-familiar): always in the DOM, revealed by CSS the moment the row is
          // hovered — no hover-intent delay, the run highlight is a separate slower layer.
          // Truncated with an ellipsis like any pill and faded, so it reads as contextual info
          // rather than a real ref and never covers the lanes; hovering the zone extends it in
          // full, exactly like a real pill. A row with refs reveals its own pills instead.
          const ghostLabel = commit.refs.length === 0 ? (rowRun?.label ?? null) : null;

          return (
            <div
              key={commit.sha}
              role='option'
              tabIndex={0}
              aria-selected={isRowSelected}
              data-commit-sha={sha}
              // DESIGN §Commit Graph: every row fill is the row's own lane color at a step of
              // the tint ladder — rest, run member, hover, selected (strongest, persistent) —
              // so a selected row reads as part of a highlighted run rather than breaking out
              // of it as the column's one neutral fill. Selection outranks hover.
              style={
                {
                  ...style,
                  '--row-tint': `color-mix(in oklab, ${laneColor(layoutRow.col)} ${
                    isRunMember ? ROW_TINT_MEMBER : ROW_TINT_REST
                  }%, transparent)`,
                  '--row-tint-hover': `color-mix(in oklab, ${laneColor(layoutRow.col)} ${ROW_TINT_HOVER}%, transparent)`,
                  '--row-tint-selected': `color-mix(in oklab, ${laneColor(layoutRow.col)} ${ROW_TINT_SELECTED}%, transparent)`,
                } as CSSProperties
              }
              className={cn(
                'group relative flex cursor-default items-center gap-3 border-b border-border/50 px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                isRowSelected
                  ? 'bg-(--row-tint-selected)'
                  : 'bg-(--row-tint) hover:bg-(--row-tint-hover)',
              )}
              data-selected={isRowSelected}
              data-run-member={isRunMember}
              onClick={handleSelect}
              onMouseEnter={hoverRow}
              // Leaving toward another Commit row (they all carry data-run-member) defers the
              // decision to that row's enter, which fires in the same batch: a same-run move
              // keeps the highlight, anything else resets there. Leaving the rows entirely
              // (footer, scrollbar, out of the list) resets immediately.
              onMouseLeave={(e) => {
                if (
                  e.relatedTarget instanceof Element &&
                  e.relatedTarget.closest('[data-run-member]')
                ) {
                  return;
                }
                clearHover();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect();
                }
              }}
            >
              {/* GRAPH · REFS column: a fixed-width REFS zone (ref pills) so the lanes zone that
                  follows starts at the same origin on every row, regardless of how many/long the
                  pills on this Commit are (issue #56). At rest the zone clips; hovering the ZONE
                  itself (not the whole row — a row-wide trigger would blanket the graph on every
                  sweep across the list) lets the pills extend past it and float over the lanes
                  (GitKraken-familiar) so a truncated Branch name reads in full: covering the
                  lanes is then a deliberate, momentary act of reading the ref. Immediate, no
                  hover-intent delay; pill fills are opaque so lane lines never bleed through,
                  and the extended pill keeps the zone's hover (it's a child), so walking along
                  the name never flickers. */}
              <span
                className='group/refs relative flex shrink-0 items-center gap-1 overflow-hidden hover:z-10 hover:overflow-visible'
                style={{ width: REFS_ZONE_WIDTH_PX }}
              >
                {/* `min-w-0 shrink` lets a pill give way inside the zone so its own `truncate`
                    ellipsizes (instead of the zone hard-cropping it mid-letter); the zone's
                    hover restores natural width for the extension. */}
                {commit.refs.map((ref) => (
                  <RefPill
                    key={`${ref._tag}:${refLabel(ref)}`}
                    emphasis={refEmphasis(ref)}
                    className='min-w-0 shrink group-hover/refs:shrink-0 group-hover/refs:max-w-none'
                  >
                    {refLabel(ref)}
                  </RefPill>
                ))}
                {/* Hidden until the row is hovered; faded at rest (it's a hint, not a real ref);
                    solid while the zone extends it over the lanes, so the lines never bleed
                    through the name being read. */}
                {ghostLabel !== null && (
                  <RefPill
                    emphasis='strong'
                    className='hidden min-w-0 shrink opacity-60 group-hover:inline-block group-hover/refs:shrink-0 group-hover/refs:max-w-none group-hover/refs:opacity-100'
                  >
                    {ghostLabel}
                  </RefPill>
                )}
              </span>
              {/* The lanes viewport: full lane width, clipped to the cap; every row shifts in
                  lockstep with the shared scrollbar via `--lanes-scroll` (no per-row scrolling). */}
              <span
                className='shrink-0 overflow-hidden'
                style={{ width: lanesViewportWidth }}
                data-slot='lanes-viewport'
              >
                <GraphLanesRow
                  row={layoutRow}
                  width={lanesWidth}
                  highlightCol={highlightCol}
                  dimmed={hover !== null}
                  // The dashed WIP connector continues into row 0's node: the WIP row draws the
                  // top half, this row draws from its top edge down to its own node so the dots
                  // run unbroken from the WIP node into the first Commit (issue #66).
                  wipConnector={hasWip && virtualRow.index === 0}
                />
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate motion-safe:transition-opacity motion-safe:duration-150',
                  isContentDimmed && 'opacity-50',
                )}
                title={commit.subject}
              >
                {commit.subject}
              </span>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1.5 text-muted-foreground motion-safe:transition-opacity motion-safe:duration-150',
                  isContentDimmed && 'opacity-50',
                )}
              >
                <span className='shrink-0'>{formatRelativeTime(commit.authoredAt)}</span>
                •
                <AuthorAvatar name={commit.author.name} email={commit.author.email} />
                {/* Hidden at rest — the avatar's identity color already answers "who" down the
                    column; the name is the on-demand layer, revealed to the avatar's right when
                    the row is hovered or selected, nudging the `1d • avatar` cluster left while
                    the subject (already truncating) absorbs the squeeze. Capped so a
                    pathological name can't eat the row. */}
                <span className='hidden max-w-48 truncate group-hover:inline group-data-[selected=true]:inline'>
                  {commit.author.name}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {lanesOverflow && (
        <div
          ref={lanesScrollRef}
          className='sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden'
          // Aligned under the lanes viewport: row padding (px-3) + REFS zone + one gap-3.
          style={{ marginLeft: 12 + REFS_ZONE_WIDTH_PX + 12, width: lanesViewportWidth }}
          data-slot='lanes-scrollbar'
          aria-hidden='true'
          onScroll={(e) => {
            scrollRef.current?.style.setProperty(
              '--lanes-scroll',
              `${-e.currentTarget.scrollLeft}px`,
            );
          }}
        >
          <div style={{ width: lanesWidth, height: 8 }} />
        </div>
      )}
    </div>
  );
}

/**
 * One row's lanes: verticals, elbow transitions, and the Commit's node (issue #56, elbow routing
 * per the ADR 0007 amendment) painted into a per-row inline `<svg>` — composition with TanStack
 * Virtual is free by construction, the SVG mounts and scrolls with its row.
 *
 * Each edge is drawn exactly once: `below` holds the diverging bends (a merge's non-first parents
 * leaving this node), `above` the converging ones (branch lanes folding into this fork-point
 * node); the rest of every edge is plain verticals, already carried by the rows' verticals or
 * own-column segments. The own column draws half-verticals gated by `lineAbove` / `lineBelow`, so
 * a tip has no dangling stub above and a root none below, and the gap of `NODE_CLEARANCE` around
 * the node center lets the node punch out of its lane against any row background.
 *
 * Color is keyed to the column of the segment's *vertical run* (ADR 0007): a vertical uses its own
 * column, a converge uses `fromCol`, a diverge uses `toCol`, the node the row's own `col`.
 *
 * `highlightCol` is the hovered lane run's column (the parent gates it to the run's row range):
 * the run's own segments go fully opaque while every other segment recedes (`dimmed` is set on
 * all rows whenever a run is hovered) — the opacity spread alone makes the hovered line read
 * across crossings; stroke weight never changes, so the geometry stays put and the 150ms opacity
 * fade covers the whole transition. At rest, lines sit at a light translucency instead of full
 * strength.
 */
function GraphLanesRow({
  row,
  width,
  highlightCol = null,
  dimmed = false,
  wipConnector = false,
}: {
  row: LayoutRow;
  width: number;
  highlightCol?: number | null;
  dimmed?: boolean;
  wipConnector?: boolean;
}) {
  const half = ROW_HEIGHT_PX / 2;
  const nodeX = laneX(row.col);
  const opacityFor = (col: number) => {
    if (highlightCol !== null) return col === highlightCol ? 1 : LANE_DIM_OPACITY;
    return dimmed ? LANE_DIM_OPACITY : LANE_REST_OPACITY;
  };
  // Nodes rest fully opaque (they ARE the Commits); they only recede — gently — under hover.
  const nodeOpacity =
    (highlightCol !== null || dimmed) && row.col !== highlightCol ? NODE_DIM_OPACITY : 1;

  return (
    <svg
      width={width}
      height={ROW_HEIGHT_PX}
      viewBox={`0 0 ${width} ${ROW_HEIGHT_PX}`}
      className='block motion-safe:[&>*]:transition-opacity motion-safe:[&>*]:duration-150'
      style={{ transform: 'translateX(var(--lanes-scroll, 0px))' }}
      aria-hidden='true'
      data-slot='lane-graph'
    >
      {row.verticals.map((col) => (
        <line
          key={`v-${col}`}
          x1={laneX(col)}
          y1={0}
          x2={laneX(col)}
          y2={ROW_HEIGHT_PX}
          stroke={laneColor(col)}
          strokeWidth={STROKE_WIDTH}
          opacity={opacityFor(col)}
          data-slot='lane-vertical'
          data-col={col}
        />
      ))}
      {wipConnector && !row.lineAbove && (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={half - NODE_CLEARANCE}
          stroke={laneColor(row.col)}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray='2 3'
          data-slot='wip-connector'
          data-half='top'
        />
      )}
      {row.lineAbove && (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={half - NODE_CLEARANCE}
          stroke={laneColor(row.col)}
          strokeWidth={STROKE_WIDTH}
          opacity={opacityFor(row.col)}
          data-slot='lane-vertical'
          data-col={row.col}
          data-half='top'
        />
      )}
      {row.lineBelow && (
        <line
          x1={nodeX}
          y1={half + NODE_CLEARANCE}
          x2={nodeX}
          y2={ROW_HEIGHT_PX}
          stroke={laneColor(row.col)}
          strokeWidth={STROKE_WIDTH}
          opacity={opacityFor(row.col)}
          data-slot='lane-vertical'
          data-col={row.col}
          data-half='bottom'
        />
      )}
      {row.below.map((t: Transition) => (
        <path
          key={`below-${t.fromCol}-${t.toCol}`}
          d={divergePath(laneX(t.fromCol), laneX(t.toCol))}
          fill='none'
          stroke={laneColor(t.toCol)}
          strokeWidth={STROKE_WIDTH}
          opacity={opacityFor(t.toCol)}
          data-slot='lane-transition'
          data-direction='below'
          data-from-col={t.fromCol}
          data-to-col={t.toCol}
        />
      ))}
      {row.above.map((t: Transition) => (
        <path
          key={`above-${t.fromCol}-${t.toCol}`}
          d={convergePath(laneX(t.fromCol), laneX(t.toCol), t.toCol === row.col)}
          fill='none'
          stroke={laneColor(t.fromCol)}
          strokeWidth={STROKE_WIDTH}
          opacity={opacityFor(t.fromCol)}
          data-slot='lane-transition'
          data-direction='above'
          data-from-col={t.fromCol}
          data-to-col={t.toCol}
        />
      ))}
      {row.isMerge ? (
        <circle
          cx={nodeX}
          cy={half}
          r={NODE_RADIUS}
          fill='none'
          stroke={laneColor(row.col)}
          strokeWidth={STROKE_WIDTH}
          opacity={nodeOpacity}
          data-slot='lane-node'
          data-merge='true'
        />
      ) : (
        <circle
          cx={nodeX}
          cy={half}
          r={NODE_RADIUS}
          fill={laneColor(row.col)}
          opacity={nodeOpacity}
          data-slot='lane-node'
          data-merge='false'
        />
      )}
    </svg>
  );
}

/** A file-count chip for the WIP summary: the shared change icon + a count, in the same pastel
    `--git-*` tone as the Changes panel's status letters — one hue per kind, everywhere. */
function WipCount({ kind, count }: { kind: 'modified' | 'added' | 'deleted'; count: number }) {
  const Icon = CHANGE_ICON[kind];
  return (
    <span
      className={cn('flex items-center gap-0.5', CHANGE_LETTER_TONE[kind])}
      data-slot='wip-filecount'
      data-kind={kind}
    >
      <Icon className='size-3' weight='duotone' />
      {count}
    </span>
  );
}

/**
 * The WIP row (issue #66): the dirty Working tree as a synthetic top row, mirroring a Commit row's
 * columns — no ref pill (the dotted node + a persistent stronger tint carry it), a HOLLOW DASHED
 * node in the HEAD Commit's lane column with a short dashed connector dropping toward row 0 (a purely
 * presentational overlay, never part of the lane sweep or frontier), the "Uncommitted changes"
 * subject, and — right beside the subject, not pushed to the row's far edge — its change
 * **summary**: file counts by type (the same icons AND pastel `--git-*` tones as the Changes
 * panel) and the aggregate `+N −N` lines. No timestamp: the row is always "now". Selecting it
 * anchors the Inspector's Changes mode; selected styling mirrors a Commit row's (the strongest
 * tint step).
 */
function WipRow({
  col,
  lanesWidth,
  lanesViewportWidth,
  summary,
  selected,
  onSelect,
  onKeyDown,
}: {
  col: number;
  lanesWidth: number;
  lanesViewportWidth: number;
  summary: {
    additions: number;
    deletions: number;
    modified: number;
    added: number;
    deleted: number;
  };
  selected: boolean;
  onSelect: () => void;
  /** ↑/↓ arrow navigation shared with the Commit listbox (the WIP row is the top of the sequence). */
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
}) {
  const { additions, deletions, modified, added, deleted } = summary;
  const half = ROW_HEIGHT_PX / 2;
  const nodeX = laneX(col);
  const laneCol = laneColor(col);

  return (
    // A native button: focus + Enter/Space activation for free, and it reads as the Working-tree
    // selection anchor to assistive tech (`aria-label`, since the row's own text is stats noise).
    <button
      type='button'
      style={
        {
          // The live Working-tree state sits a step above the resting graph at all times: its base
          // tint is the run-member step (not the 6% rest), so the row reads as "current" even when
          // nothing is selected (DESIGN.md — "the current row is highlighted with a stronger tint").
          // Hover and selection escalate exactly like a Commit row.
          '--row-tint': `color-mix(in oklab, ${laneCol} ${ROW_TINT_MEMBER}%, transparent)`,
          '--row-tint-hover': `color-mix(in oklab, ${laneCol} ${ROW_TINT_HOVER}%, transparent)`,
          '--row-tint-selected': `color-mix(in oklab, ${laneCol} ${ROW_TINT_SELECTED}%, transparent)`,
        } as CSSProperties
      }
      className={cn(
        'group relative flex h-8 w-full cursor-default items-center gap-3 border-b border-border/50 px-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
        selected ? 'bg-(--row-tint-selected)' : 'bg-(--row-tint) hover:bg-(--row-tint-hover)',
      )}
      data-slot='wip-row'
      data-selected={selected}
      aria-label={messages.commitGraph.wipSubject}
      // macOS doesn't focus a <button> on click (unlike the Commit rows' focusable <div>s), so pull
      // focus explicitly — otherwise the row's own onKeyDown never fires and ↓ scrolls instead of
      // stepping to the first Commit. preventScroll leaves any scrolling to the arrow handler.
      onClick={(e) => {
        onSelect();
        e.currentTarget.focus({ preventScroll: true });
      }}
      onKeyDown={onKeyDown}
    >
      {/* Empty REFS zone — the WIP row wears no pill (the dotted node + the persistent stronger
          tint carry it; "WIP" is dev jargon the subject already says plainly). Its fixed width keeps
          the lanes zone at the same origin as every Commit row. */}
      <span className='shrink-0' style={{ width: REFS_ZONE_WIDTH_PX }} aria-hidden='true' />
      <span
        className='shrink-0 overflow-hidden'
        style={{ width: lanesViewportWidth }}
        data-slot='lanes-viewport'
      >
        <svg
          width={lanesWidth}
          height={ROW_HEIGHT_PX}
          viewBox={`0 0 ${lanesWidth} ${ROW_HEIGHT_PX}`}
          className='block'
          style={{ transform: 'translateX(var(--lanes-scroll, 0px))' }}
          aria-hidden='true'
          data-slot='lane-graph'
        >
          {/* Short dashed connector dropping toward row 0's node in the same column. */}
          <line
            x1={nodeX}
            y1={half + NODE_CLEARANCE}
            x2={nodeX}
            y2={ROW_HEIGHT_PX}
            stroke={laneCol}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray='2 3'
            data-slot='wip-connector'
          />
          {/* Hollow, dashed node — distinct from a Commit's filled dot and a merge's solid ring. */}
          <circle
            cx={nodeX}
            cy={half}
            r={NODE_RADIUS}
            fill='none'
            stroke={laneCol}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray='1.75 1.75'
            data-slot='wip-node'
          />
        </svg>
      </span>
      <span className='shrink-0 font-medium'>{messages.commitGraph.wipSubject}</span>
      {/* Change summary: file counts by type, then a hairline dot, then the aggregate lines — worn
          in the Changes panel's pastel `--git-*` tones and sitting right beside the subject (the
          row's one piece of content reads as a unit; the right edge stays quiet). Any zero bucket /
          axis is omitted. No timestamp — the WIP row is always "now". */}
      <span className='flex min-w-0 shrink items-center gap-2 ml-2 overflow-hidden font-mono text-[0.625rem] tabular-nums'>
        {(modified > 0 || added > 0 || deleted > 0) && (
          <span className='flex items-center gap-2'>
            {modified > 0 && <WipCount kind='modified' count={modified} />}
            {added > 0 && <WipCount kind='added' count={added} />}
            {deleted > 0 && <WipCount kind='deleted' count={deleted} />}
          </span>
        )}
        {(additions > 0 || deletions > 0) && (
          <>
            <span aria-hidden='true' className='text-muted-foreground/40'>
              ·
            </span>
            <span className='flex items-center gap-1.5'>
              {additions > 0 && <span className='text-git-added'>+{additions}</span>}
              {deletions > 0 && <span className='text-git-deleted'>−{deletions}</span>}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/** Pill text for a Ref. `Head` is the Detached-HEAD marker; every other variant carries its name. */
function refLabel(ref: Ref): string {
  return ref._tag === 'Head' ? 'HEAD' : ref.name;
}

/**
 * DESIGN §Ref pills: the current Branch and Detached HEAD take the stronger tint; remote-tracking
 * Branches and Tags read quieter; other local Branches sit on the default Accent Surface.
 */
function refEmphasis(ref: Ref): 'strong' | 'default' | 'quiet' {
  switch (ref._tag) {
    case 'Branch':
      return ref.current ? 'strong' : 'default';
    case 'Head':
      return 'strong';
    case 'RemoteBranch':
    case 'Tag':
      return 'quiet';
  }
}

/** Skeleton rows shown during loading (no spinner — skeletons over spinners per the rail convention). */
function CommitGraphSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading commits'>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className='flex h-8 items-center gap-3'>
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${40 + (i % 4) * 15}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
