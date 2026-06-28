/**
 * Shared ahead/behind badge used by both `BranchSelector` and `BranchRow` (issue #23 seam).
 * Renders only when `upstream` is set and at least one of `ahead` or `behind` is non-zero.
 * No `@gitoui/ui` change — app-side spans (issue #15 constraint).
 */
export function AheadBehindBadge({
  upstream,
  ahead,
  behind,
}: {
  upstream: string | undefined;
  ahead: number;
  behind: number;
}) {
  if (!upstream || (ahead === 0 && behind === 0)) return null;
  return (
    <span className='ml-auto flex shrink-0 items-center gap-0.5 text-[0.625rem] text-muted-foreground'>
      {ahead > 0 && <span>↑{ahead}</span>}
      {behind > 0 && <span>↓{behind}</span>}
    </span>
  );
}
