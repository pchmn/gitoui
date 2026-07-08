import type { ChangeKind, StatusChange } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';

/**
 * Leading glyph per `ChangeKind` (issue #61 — DESIGN.md's `M`/`A`/`D`/`R`/`U`, `untracked` reads as
 * "added" to users; the axis distinction stays internal to the two-axis model). Conflicted entries
 * aren't modeled yet (out of scope until conflict/merge UI), so `U` has no source today.
 */
const GLYPH: Record<ChangeKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'A',
};

/**
 * One Changes-panel row (issue #61): leading status glyph in a small tinted square, the path split
 * into its Muted-Ink directory prefix and medium-weight filename (Label size, DM Sans — mono is
 * reserved for code content, so the mockup's monospace paths are not followed here), and trailing
 * `+N`/`−N` Micro stats in the semantic success/destructive tokens, omitted when both are absent
 * (binary or untracked — DESIGN.md "the panel never lies about non-text content").
 *
 * The filename (and its `/` separator) is pinned; only the directory prefix truncates when the row
 * runs out of width — a filename never gets clipped, matching how other git clients read.
 *
 * Read-only in this slice — no stage/unstage affordance yet (issue #62+).
 */
export function ChangeRow({ path, change }: { path: string; change: StatusChange }) {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const hasStats = change.additions !== undefined || change.deletions !== undefined;

  return (
    <div
      role='option'
      tabIndex={0}
      className='flex h-6 cursor-default select-none items-center gap-2 rounded-sm px-3 text-xs hover:bg-muted'
      title={path}
    >
      <span
        className='flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[0.625rem] font-medium text-muted-foreground'
        aria-hidden='true'
      >
        {GLYPH[change.kind]}
      </span>
      <span className='flex min-w-0 flex-1'>
        {dir !== '' && (
          <>
            <span className='min-w-0 truncate text-muted-foreground'>{dir}</span>
            <span className='shrink-0 text-muted-foreground'>/</span>
          </>
        )}
        <span className='shrink-0 whitespace-nowrap font-medium text-foreground'>{name}</span>
      </span>
      {hasStats && (
        <span className='flex shrink-0 items-center gap-1.5 font-mono text-[0.625rem] tabular-nums'>
          {change.additions !== undefined && (
            <span className={cn(change.additions > 0 && 'text-success')}>+{change.additions}</span>
          )}
          {change.deletions !== undefined && (
            <span className={cn(change.deletions > 0 && 'text-destructive')}>
              −{change.deletions}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
