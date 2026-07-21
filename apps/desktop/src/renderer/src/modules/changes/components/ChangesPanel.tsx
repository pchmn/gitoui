import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from '@gitoui/ui/collapsible';
import {
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useCenterView } from '#renderer/modules/diff/CenterViewContext';
import { useDiffPrimer } from '#renderer/modules/diff/components/DiffBody';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useActiveRepository } from '../../repository/ActiveRepositoryContext';
import { useStaging } from '../hooks/useStaging';
import { useStatus } from '../hooks/useStatus';
import { ChangeRow } from './ChangeRow';
import { CommitComposer } from './CommitComposer';

/**
 * The Inspector's Changes tab (issue #61; file-level staging #62): Staged and Unstaged groups fed by
 * the real `status` collection. A path Staged AND Unstaged (git's two-axis model, CONTEXT.md) appears
 * in BOTH groups, each row carrying only its own axis's stats — not a staged-xor-unstaged partition.
 * Ticking an Unstaged row stages that path; unticking a Staged row unstages it; the group headers
 * carry `Stage all` / `Unstage all`. No optimistic update — mutations invalidate the `status`
 * collection and the checkboxes settle to git's truth (issue #62).
 *
 * Loading/error states mirror `CommitGraph`'s (skeleton rows on pending, no spinner; a centered
 * inline `role="alert"` via `matchError` on error). A clean Working tree shows a quiet empty state
 * instead of two zero-count groups.
 *
 * Layout: the two groups scroll in a `flex-1` region while the commit composer (issue #63) stays
 * pinned as a footer at the bottom (fed the Staged count for its "Commit N files" button), so the
 * primary action keeps a fixed home. Both groups ALWAYS render on a dirty tree — an empty one shows
 * a quiet Muted-Ink hint and its bulk action disabled, so the two buckets keep a stable home while
 * files move between them. Each group header is a sticky one-step tonal band (Muted Surface — the
 * sanctioned Canvas→Surface depth step, no borders) sharing the rail's FULL section-header grammar
 * (RailSection): chevron + leading duotone icon + sentence-case label + mono count chip, and the
 * group collapses on click (persisted per group, like the rail's sections) — so a long Unstaged
 * list can fold away to reach Staged. The dashed circle on Unstaged echoes the graph's dashed WIP
 * node (in flux); the check circle marks Staged as the settled "about to be committed" bucket.
 */
export function ChangesPanel() {
  const { root } = useActiveRepository();
  const { data: status, isLoading, isError, error, retry } = useStatus(root);
  const { stageFile, unstageFile, stageAll, unstageAll } = useStaging();
  const { open: openDiff, file: openFile } = useCenterView();
  const primeDiff = useDiffPrimer(root);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ↑/↓ move the open file to the previous/next Change — Unstaged then Staged as one sequence.
  // Reads the rows in DOM order (a collapsed group contributes none) so the target is always a
  // visible, focusable row; both ends clamp, no wrap. Mirrors CommitGraph's selection-driven nav.
  function moveOpenFile(direction: 1 | -1) {
    const container = scrollRef.current;
    if (container === null || openFile === null || openFile.source.kind === 'commit') return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-change-path]'));
    const current = rows.findIndex(
      (row) =>
        row.dataset.changeKind === openFile.source.kind && row.dataset.changePath === openFile.path,
    );
    if (current < 0) return;
    const target = rows[current + direction];
    const kind = target?.dataset.changeKind;
    const path = target?.dataset.changePath;
    if ((kind !== 'staged' && kind !== 'unstaged') || path === undefined) return;
    openDiff({ path, source: { kind } });
    // The row is already mounted and survives the re-open, so focus it next frame to move the ring
    // and reveal it — keeping the following arrow on the list.
    requestAnimationFrame(() => target?.focus());
  }

  // Structural param (like CommitGraph's) so one handler fits a div's `onKeyDown` without importing
  // React's event type; `preventDefault` stops the list's native scroll.
  const onListKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveOpenFile(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveOpenFile(-1);
    }
  };

  // Staging folds a path's change onto the other axis (Unstaged→Staged, the reverse for unstaging),
  // emptying the axis the Code & Diff view was reading. If the open file crosses over, re-target it
  // to where the same content now lives so the diff keeps showing it instead of going blank. `path`
  // omitted = a bulk (Stage all / Unstage all) that moves every file on that axis.
  const followOpenFile = (to: 'staged' | 'unstaged', path?: string) => {
    if (openFile === null || openFile.source.kind === 'commit') return;
    const movedFrom = to === 'staged' ? 'unstaged' : 'staged';
    if (openFile.source.kind !== movedFrom) return;
    if (path !== undefined && openFile.path !== path) return;
    openDiff({ path: openFile.path, source: { kind: to } });
  };

  if (root === null) return null;

  if (isLoading) {
    return <ChangesPanelSkeleton />;
  }

  if (isError) {
    const message = matchError<GitError<'status'>, string>(error, {
      RepoNotFoundError: (e) => messages.changesPanel.repoNotFound(e.path),
      _: () => messages.changesPanel.failedToLoad,
    });
    return (
      <div className='flex flex-col items-center gap-2 px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground' role='alert'>
          {message}
        </p>
        <button
          type='button'
          onClick={retry}
          className='rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted'
        >
          {messages.changesPanel.retry}
        </button>
      </div>
    );
  }

  const entries = status?.entries ?? [];
  // Map (not filter) so each group's rows carry their OWN axis's `StatusChange` without a
  // non-null assertion — a path Staged AND Unstaged contributes one row to each group.
  // Sort each group by path so untracked files sit beside their siblings — git lists them last.
  const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);
  const staged = entries
    .flatMap((e) => (e.staged ? [{ path: e.path, change: e.staged }] : []))
    .sort(byPath);
  const unstaged = entries
    .flatMap((e) => (e.unstaged ? [{ path: e.path, change: e.unstaged }] : []))
    .sort(byPath);

  if (staged.length === 0 && unstaged.length === 0) {
    return (
      <div className='flex h-full items-center justify-center px-3 py-2 text-center'>
        <p className='text-xs text-muted-foreground'>{messages.changesPanel.clean}</p>
      </div>
    );
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div ref={scrollRef} className='min-h-0 flex-1 overflow-y-auto'>
        <ChangeGroup
          id='unstaged'
          onListKeyDown={onListKeyDown}
          icon={<CircleDashedIcon weight='duotone' />}
          heading={messages.changesPanel.unstagedHeading}
          count={unstaged.length}
          emptyHint={messages.changesPanel.emptyUnstaged}
          action={{
            label: messages.changesPanel.stageAll,
            onClick: () => {
              stageAll.mutate();
              followOpenFile('staged');
            },
            disabled: stageAll.isPending,
          }}
        >
          {unstaged.map((row) => (
            <ChangeRow
              key={`unstaged:${row.path}`}
              path={row.path}
              change={row.change}
              checked={false}
              navKind='unstaged'
              selected={openFile?.source.kind === 'unstaged' && openFile.path === row.path}
              onToggle={() => {
                stageFile.mutate(row.path);
                followOpenFile('staged', row.path);
              }}
              onOpen={() => openDiff({ path: row.path, source: { kind: 'unstaged' } })}
              onPrefetch={() => primeDiff(row.path, { kind: 'unstaged' })}
            />
          ))}
        </ChangeGroup>
        <ChangeGroup
          id='staged'
          onListKeyDown={onListKeyDown}
          icon={<CheckCircleIcon weight='duotone' />}
          heading={messages.changesPanel.stagedHeading}
          count={staged.length}
          emptyHint={messages.changesPanel.emptyStaged}
          action={{
            label: messages.changesPanel.unstageAll,
            onClick: () => {
              unstageAll.mutate();
              followOpenFile('unstaged');
            },
            disabled: unstageAll.isPending,
          }}
        >
          {staged.map((row) => (
            <ChangeRow
              key={`staged:${row.path}`}
              path={row.path}
              change={row.change}
              checked
              navKind='staged'
              selected={openFile?.source.kind === 'staged' && openFile.path === row.path}
              onToggle={() => {
                unstageFile.mutate(row.path);
                followOpenFile('unstaged', row.path);
              }}
              onOpen={() => openDiff({ path: row.path, source: { kind: 'staged' } })}
              onPrefetch={() => primeDiff(row.path, { kind: 'staged' })}
            />
          ))}
        </ChangeGroup>
      </div>
      <CommitComposer stagedCount={staged.length} />
    </div>
  );
}

/** localStorage key for per-group open/closed state (mirrors the rail's SECTION_OPEN_KEY). */
const GROUP_OPEN_KEY = (id: string) => `gitoui:changes-group-${id}-open`;

/**
 * An `Unstaged n` / `Staged n` group plus its rows — ALWAYS rendered, so both buckets keep a stable
 * home while files move between them (an empty group shows a quiet Muted-Ink hint instead of its
 * listbox, and its bulk action disables). The header shares the rail's full section-header grammar
 * (RailSection): chevron + leading duotone icon + sentence-case label + mono count chip, and the
 * group **collapses on click** — so a long Unstaged list folds away to reach Staged. Open state
 * persists per group. Unlike RailSection this is uncontrolled (no rail-filter auto-expand to
 * override), so the group owns its own state. The bulk action (Stage all / Unstage all) sits as a
 * SIBLING of the trigger, not inside it — a button cannot nest a button.
 *
 * The header is a sticky one-step tonal band (opaque Muted Surface, so scrolled rows never bleed
 * through) — the Canvas→Surface depth mechanism doing the group separation the old whole-group
 * fill was too faint for. No borders: tone alone marks the seam (flat-at-rest). The count chip
 * drops to Canvas (`bg-background`) so it stays visible on the Muted band.
 */
function ChangeGroup({
  id,
  icon,
  heading,
  count,
  emptyHint,
  action,
  onListKeyDown,
  children,
}: {
  id: string;
  icon: ReactNode;
  heading: string;
  count: number;
  emptyHint: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** Arrow-key handler for the group's listbox — moves the open file across both groups' rows. */
  onListKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(GROUP_OPEN_KEY(id));
    return stored === null ? true : stored === 'true';
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    localStorage.setItem(GROUP_OPEN_KEY(id), String(next));
  }

  return (
    <CollapsibleRoot open={open} onOpenChange={handleOpenChange}>
      <div className='sticky top-0 z-10 flex h-8 shrink-0 items-center bg-muted pr-3 pl-3 text-xs font-semibold text-muted-foreground'>
        <CollapsibleTrigger className='flex h-full min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground'>
          {open ? (
            <CaretDownIcon className='size-3 shrink-0' aria-hidden='true' />
          ) : (
            <CaretRightIcon className='size-3 shrink-0' aria-hidden='true' />
          )}
          <span className='size-3.5 shrink-0 [&>svg]:size-3.5' aria-hidden='true'>
            {icon}
          </span>
          <span>{heading}</span>
          <span className='rounded-sm bg-background px-1 py-0.5 font-mono text-[0.625rem] leading-none text-muted-foreground tabular-nums'>
            {count}
          </span>
        </CollapsibleTrigger>
        {action && (
          <button
            type='button'
            onClick={action.onClick}
            disabled={action.disabled || count === 0}
            className='ml-auto shrink-0 pl-2 font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
          >
            {action.label}
          </button>
        )}
      </div>
      <CollapsiblePanel>
        {count === 0 ? (
          <p className='px-3 py-1.5 text-xs text-muted-foreground'>{emptyHint}</p>
        ) : (
          <div
            role='listbox'
            aria-label={heading}
            onKeyDown={onListKeyDown}
            className='flex flex-col py-1'
          >
            {children}
          </div>
        )}
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}

/** Skeleton rows shown during loading (no spinner — matches BranchesSection/CommitGraph). */
function ChangesPanelSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading status'>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className='flex h-6 items-center gap-2'>
          <span className='size-4 shrink-0 rounded-sm bg-muted-foreground/20' />
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${50 + (i % 3) * 20}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
