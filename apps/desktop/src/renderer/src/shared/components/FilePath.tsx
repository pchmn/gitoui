import { cn } from '@gitoui/ui/lib/utils';

/**
 * A repo-relative path, GitKraken-style: the directory recedes in Muted-Ink and gives way first
 * (truncating, down to nothing), the filename leads in foreground and never shrinks (only ellipsizing
 * if it alone overruns). Shared by the Changes rows and the Code & Diff header so a path reads
 * identically wherever it appears. `oldPath` prepends a Muted-Ink `old → ` rename marker.
 *
 * A leaf presentational span — size and flex behavior come from the caller's `className`.
 */
export function FilePath({
  path,
  oldPath,
  title,
  className,
}: {
  path: string;
  oldPath?: string;
  title?: string;
  className?: string;
}) {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);

  return (
    <span className={cn('flex min-w-0 items-baseline overflow-hidden', className)} title={title}>
      {oldPath !== undefined && (
        <span className='shrink truncate text-muted-foreground'>{oldPath}&nbsp;→&nbsp;</span>
      )}
      {dir !== '' && <span className='min-w-0 shrink truncate text-muted-foreground'>{dir}</span>}
      {dir !== '' && <span className='shrink-0 text-muted-foreground'>/</span>}
      <span className='max-w-full shrink-0 truncate font-medium text-foreground'>{name}</span>
    </span>
  );
}
