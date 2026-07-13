import type { StatusChange } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { messages } from '#renderer/shared/messages/messages';
import { CHANGE_LETTER, CHANGE_LETTER_TONE } from './changeGlyph';

/**
 * One Changes-panel row (issue #61, refined #66; staging #62; VSCode-style layout follow-up).
 * The GitKraken-style path+name leads (Muted-Ink directory truncating head-first, filename at Body
 * size so it's what you scan), then a right cluster that stays quiet at rest and, on hover / focus,
 * reveals the `+N` / `−N` stats and a single **stage / unstage** action (`+` when Unstaged, `−` when
 * Staged) — absolutely placed with a gradient fade so they never shift the filename. The trailing
 * **status letter** (`A`/`M`/`D`/`R`/`U`) is always shown, tinted VSCode-style by kind (green
 * add/untracked/renamed, gold modified, red delete — see `CHANGE_LETTER_TONE`).
 *
 * (A leading file-type icon lands with `@pierre/trees` later; omitted for now.)
 */
export function ChangeRow({
  path,
  change,
  checked,
  onToggle,
}: {
  path: string;
  change: StatusChange;
  /** Whether this axis is Staged — drives the action affordance (`−`/unstage vs `+`/stage). */
  checked: boolean;
  /** Toggle staging for this path (stage when currently unchecked, unstage when checked). */
  onToggle: () => void;
}) {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
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
      className='group relative flex h-7 cursor-default select-none items-center gap-2 rounded-sm px-3 hover:bg-muted focus-within:bg-muted'
      title={path}
    >
      {/* The filename owns the space: it never shrinks (only ellipsizing if it alone overruns the
          row), while the Muted-Ink path gives way first — truncating, down to nothing if need be.
          The `/` is pinned between. */}
      <span className='flex min-w-0 flex-1 items-baseline overflow-hidden text-sm'>
        {dir !== '' && <span className='min-w-0 shrink truncate text-muted-foreground'>{dir}</span>}
        {dir !== '' && <span className='shrink-0 text-muted-foreground'>/</span>}
        <span className='max-w-full shrink-0 truncate font-medium text-foreground'>{name}</span>
      </span>

      <span className='relative flex shrink-0 items-center'>
        {/* Hover/focus cluster: stats + the stage/unstage action, absolutely placed just left of the
            status letter so they never shift the filename; the gradient goes solid before the digits
            so they read cleanly over the name's end. */}
        <span className='pointer-events-none absolute inset-y-0 right-full flex items-center gap-2 bg-linear-to-r from-transparent to-muted to-40% pr-2 pl-10 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 motion-safe:transition-opacity motion-safe:duration-150'>
          {hasStats && (
            <span className='flex items-center gap-1.5 font-mono text-[0.625rem] tabular-nums'>
              {showAdditions && <span className='text-git-added'>+{change.additions}</span>}
              {showDeletions && <span className='text-git-deleted'>−{change.deletions}</span>}
            </span>
          )}
          <button
            type='button'
            onClick={onToggle}
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
