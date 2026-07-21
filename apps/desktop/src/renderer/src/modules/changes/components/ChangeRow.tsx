import type { StatusChange } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { FilePath } from '#renderer/shared/components/FilePath';
import { messages } from '#renderer/shared/messages/messages';
import { CHANGE_LETTER, CHANGE_LETTER_TONE } from './changeGlyph';

/**
 * One Changes-panel row (issue #61, refined #66; staging #62; VSCode-style layout follow-up;
 * read-only variant for Commit detail, issue #65). The GitKraken-style path+name leads (Muted-Ink
 * directory truncating head-first, filename at Body size so it's what you scan), then a right
 * cluster with the `+N` / `−N` stats and, when `onToggle` is passed, a single **stage / unstage**
 * action (`+` when Unstaged, `−` when Staged). The trailing **status letter** (`A`/`M`/`D`/`R`/`U`)
 * is always shown, tinted VSCode-style by kind (green add/untracked/renamed, gold modified, red
 * delete — see `CHANGE_LETTER_TONE`).
 *
 * Omitting `onToggle` (Commit detail's read-only Changes: no staging affordance, per CONTEXT.md's
 * glossary) drops the action button and its hover-gating — the stats sit always-visible instead,
 * since nothing else competes for that space without the toggle.
 *
 * (A leading file-type icon lands with `@pierre/trees` later; omitted for now.)
 *
 * `onOpen` (issue #67) opens this row's Change in the Code & Diff view — the row itself is the
 * click target; the stage/unstage action button stops propagation so it never also opens the diff.
 */
export function ChangeRow({
  path,
  change,
  checked,
  selected,
  navKind,
  onToggle,
  onOpen,
  onPrefetch,
}: {
  path: string;
  change: StatusChange;
  /** Whether this axis is Staged — drives the action affordance (`−`/unstage vs `+`/stage). Ignored (and unused) when `onToggle` is omitted. */
  checked?: boolean;
  /** Marks this row as the one currently open in the Code & Diff view — Accent-Surface fill + `aria-selected`. */
  selected?: boolean;
  /** This row's axis, tagged onto the DOM so arrow-key navigation can find and focus the target row. */
  navKind?: 'staged' | 'unstaged';
  /** Toggle staging for this path (stage when currently unchecked, unstage when checked). Omit for a read-only row (Commit detail). */
  onToggle?: () => void;
  /** Open this row's diff in the Code & Diff view. Omit to keep the row inert. */
  onOpen?: () => void;
  /** Warm this row's diff (data + highlight) ahead of an open — fired on hover/focus. */
  onPrefetch?: () => void;
}) {
  const readOnly = onToggle === undefined;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const showAdditions = change.additions !== undefined && change.additions > 0;
  const showDeletions = change.deletions !== undefined && change.deletions > 0;
  const hasStats = showAdditions || showDeletions;
  const actionLabel = checked
    ? messages.changesPanel.unstageRowAria(name)
    : messages.changesPanel.stageRowAria(name);

  return (
    <div
      role='option'
      tabIndex={0}
      aria-selected={selected}
      data-change-path={path}
      data-change-kind={navKind}
      onClick={onOpen}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onOpen) {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group relative flex h-7 shrink-0 cursor-default select-none items-center gap-2 px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
        selected ? 'bg-accent' : 'hover:bg-muted focus-within:bg-muted',
      )}
      title={path}
    >
      <FilePath path={path} className='flex-1 text-sm' />

      <span className='relative flex shrink-0 items-center'>
        {readOnly ? (
          hasStats && (
            <span className='mr-2 flex items-center gap-1.5 font-mono text-[0.625rem] tabular-nums'>
              {showAdditions && <span className='text-git-added'>+{change.additions}</span>}
              {showDeletions && <span className='text-git-deleted'>−{change.deletions}</span>}
            </span>
          )
        ) : (
          // Hover/keyboard cluster: stats + the stage/unstage action, absolutely placed just left of
          // the status letter so they never shift the filename; the gradient goes solid before the
          // digits so they read cleanly over the name's end. Revealed on hover and on KEYBOARD focus
          // only (`focus-visible`) — a mouse click (which selects/opens the row) leaves it hidden so
          // the selected filename stays fully readable, while Tab still surfaces it (row or button).
          <span className='pointer-events-none absolute inset-y-0 right-full flex items-center gap-2 bg-linear-to-r from-transparent to-muted to-40% pr-2 pl-10 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150'>
            {hasStats && (
              <span className='flex items-center gap-1.5 font-mono text-[0.625rem] tabular-nums'>
                {showAdditions && <span className='text-git-added'>+{change.additions}</span>}
                {showDeletions && <span className='text-git-deleted'>−{change.deletions}</span>}
              </span>
            )}
            <button
              type='button'
              onClick={(event) => {
                event.stopPropagation();
                onToggle?.();
              }}
              aria-label={actionLabel}
              className='flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40'
            >
              {checked ? (
                <MinusIcon weight='bold' className='size-4' />
              ) : (
                <PlusIcon weight='bold' className='size-4' />
              )}
            </button>
          </span>
        )}
        {/* Status letter — always visible, tinted VSCode-style by kind. Fixed-width + centered so the
            letters line up down the column. */}
        <span
          data-kind={change.kind}
          className={cn(
            'w-3.5 text-center font-semibold text-xs tabular-nums',
            CHANGE_LETTER_TONE[change.kind],
          )}
          aria-hidden='true'
        >
          {CHANGE_LETTER[change.kind]}
        </span>
      </span>
    </div>
  );
}
