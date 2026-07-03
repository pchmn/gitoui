import { cn } from '#lib/utils';

/**
 * A bespoke identity avatar: a `rounded-sm` tile with an initial on a deterministic identity color
 * (DESIGN §5 Identity avatars — the Repository avatar shown in the selector and top bar). NOT the
 * image avatar.
 *
 * The color is functional, not decorative: the same `seed` always wears the same color, so repos
 * stay scannable (the Spent Color Rule sanctions identity as one of the few places color is spent).
 * It honors the Living Tint Rule by deriving from `--primary-source` in OKLCH and only *rotating*
 * the hue into one of a bounded set of buckets — so the whole identity palette re-tints with the
 * user's source color instead of being hardcoded. Lightness/chroma are fixed for a stable, legible
 * fill (mid-lightness, near-white glyph) across light and dark.
 */

// A bounded set of hue offsets spread around the wheel (DESIGN: "keep the set bounded").
const HUE_BUCKETS = [0, 40, 80, 120, 160, 200, 240, 280, 320];

/** Small, stable string hash (djb2-ish) — deterministic across runs, no crypto needed. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function initialOf(name: string): string {
  return (name.trim().at(0) ?? '?').toUpperCase();
}

export function IdentityAvatar({
  name,
  seed,
  shape = 'tile',
  className,
}: {
  /** Display name; its first character becomes the glyph. */
  readonly name: string;
  /** Stable identity key (e.g. the canonical path). Falls back to `name`. */
  readonly seed?: string;
  /** `'tile'` (default, `rounded-sm` — Repository avatar) or `'circle'` (`rounded-full` — Commit author avatar, DESIGN §5 Identity avatars). */
  readonly shape?: 'tile' | 'circle';
  readonly className?: string;
}) {
  const offset = HUE_BUCKETS[hashString(seed ?? name) % HUE_BUCKETS.length] ?? 0;

  return (
    <span
      data-slot='identity-avatar'
      aria-hidden
      className={cn(
        'flex size-5 shrink-0 items-center justify-center text-[0.625rem] font-semibold leading-none select-none',
        shape === 'circle' ? 'rounded-full' : 'rounded-sm',
        className,
      )}
      style={{
        backgroundColor: `oklch(from var(--primary-source) 0.55 0.13 calc(h + ${offset}))`,
        color: `oklch(from var(--primary-source) 0.98 0.02 h)`,
      }}
    >
      {initialOf(name)}
    </span>
  );
}
