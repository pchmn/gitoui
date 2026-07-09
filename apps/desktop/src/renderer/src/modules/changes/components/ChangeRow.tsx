import type { StatusChange } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { CHANGE_ICON, CHANGE_TONE } from './changeGlyph';

/**
 * One Changes-panel row (issue #61, refined #66): a leading status **icon** (small, duotone; color
 * spent only on added / deleted, per `changeGlyph`), then a single dense line, GitKraken-style — the
 * Muted-Ink directory path on the left (truncating head-first, so it gives way before the name) and
 * the filename at Body size (medium weight) on the right, so the filename is what you scan — the name
 * itself ellipsizes only if it alone overruns the row. Trailing `+N` / `−N` Micro stats (semantic
 * success / destructive; a side is shown only when it moved — a one-sided change shows just its
 * side, a `+0` / `−0` is noise, binary / untracked show none) reveal on hover / focus, absolutely
 * placed so they never nudge the filename — the resting row stays quiet.
 *
 * Read-only in this slice — no stage / unstage affordance yet (issue #62+).
 */
export function ChangeRow({ path, change }: { path: string; change: StatusChange }) {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const showAdditions = change.additions !== undefined && change.additions > 0;
  const showDeletions = change.deletions !== undefined && change.deletions > 0;
  const hasStats = showAdditions || showDeletions;
  const Glyph = CHANGE_ICON[change.kind];

  return (
    <div
      role='option'
      tabIndex={0}
      className='group relative flex h-7 cursor-default select-none items-center gap-2 rounded-sm px-3 hover:bg-muted'
      title={path}
    >
      <span
        className={cn('flex shrink-0 items-center', CHANGE_TONE[change.kind])}
        data-kind={change.kind}
        aria-hidden='true'
      >
        <Glyph className='size-3.5' weight={change.kind === 'modified' ? 'duotone' : 'regular'} />
      </span>
      {/* The filename owns the space: it never shrinks (only ellipsizing if it alone overruns the
          row, capped at the identity width), while the Muted-Ink path gives way first — truncating,
          down to nothing if need be — so a short name reads in full. The `/` is pinned between. */}
      <span className='flex min-w-0 flex-1 items-baseline overflow-hidden text-sm'>
        {dir !== '' && <span className='min-w-0 shrink truncate text-muted-foreground'>{dir}</span>}
        {dir !== '' && <span className='shrink-0 text-muted-foreground'>/</span>}
        <span className='max-w-full shrink-0 truncate font-medium text-foreground'>{name}</span>
      </span>
      {/* Stats reveal on hover / focus, absolutely placed so they never shift the filename; the
          gradient goes solid by the halfway point so the digits read cleanly over the name's end. */}
      {hasStats && (
        <span className='pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1.5 bg-linear-to-r from-transparent to-muted to-50% pr-3 pl-10 font-mono text-xs tabular-nums opacity-0 group-focus:opacity-100 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-150'>
          {showAdditions && <span className='text-success'>+{change.additions}</span>}
          {showDeletions && <span className='text-destructive'>−{change.deletions}</span>}
        </span>
      )}
    </div>
  );
}
