/**
 * Format an epoch-MS timestamp as a compact relative string ("2h", "1d", "3mo") for the Commit
 * graph's AUTHOR column. Pure — `now` is an optional second param (defaults to `Date.now()`) so
 * it stays unit-testable without faking the clock.
 *
 * Buckets: sub-minute → "just now"; otherwise the largest whole unit that fits, smallest first
 * (minutes, hours, days, months, years) — never two units combined, never a decimal.
 */
export function formatRelativeTime(epochMs: number, now: number = Date.now()): string {
  const diffSeconds = Math.max(0, Math.floor((now - epochMs) / 1000));

  if (diffSeconds < 60) return 'just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}y`;
}
