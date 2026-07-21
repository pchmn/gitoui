import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, CSSProperties } from 'react';
import { cn } from '#lib/utils';

/**
 * A ref pill (DESIGN §5 Ref pills / the `ref-pill` token): a tiny `rounded-sm` Micro-text marker
 * for a Branch / Tag / HEAD sitting on a Commit, shown in the graph's GRAPH · REFS column.
 *
 * Emphasis sets how *loud* the pill is; a `tint` sets its *hue*. In the graph, branch pills carry
 * their lane's color (`tint`), so a name reads as belonging to its line at a glance — the active
 * Branch / Detached HEAD `strong`er, remote-tracking Branches `quiet`er. Tags carry no tint and
 * fall back to the neutral Accent / Muted Surface below (a Tag marks a point, not a line).
 *
 * Every fill is opaque (the tint is pre-mixed over the canvas, never a translucent lane color): in
 * the graph, hovering a row extends its pills over the lane lines, and a see-through pill would let
 * the lines bleed into the text.
 */
// `inline-block`, not `inline-flex`: `truncate`'s text-overflow only ellipsizes inline content
// of a block container — on a flex container it hard-crops the name mid-letter instead.
const REF_PILL_BASE =
  'inline-block max-w-40 shrink-0 truncate rounded-sm px-1.5 text-[0.625rem]/4 font-medium tracking-[0.01em] select-none';

const refPillVariants = cva(REF_PILL_BASE, {
  variants: {
    emphasis: {
      default: 'bg-accent text-foreground',
      strong: 'bg-[color-mix(in_srgb,var(--primary)_15%,var(--background))] text-primary',
      quiet: 'bg-muted text-muted-foreground',
    },
  },
  defaultVariants: {
    emphasis: 'default',
  },
});

type Emphasis = NonNullable<VariantProps<typeof refPillVariants>['emphasis']>;

/**
 * Lane-tinted fill + text for a graph ref pill. The fill mix rises with emphasis (current Branch
 * loudest, remote quietest); the text stays anchored toward Ink / paper (via `--foreground`, which
 * flips with the theme) so 10px Micro text clears its contrast floor on either theme regardless of
 * how light the lane hue is.
 */
function refPillTint(tint: string, emphasis: Emphasis): CSSProperties {
  const fill = emphasis === 'strong' ? 32 : emphasis === 'quiet' ? 14 : 22;
  return {
    backgroundColor: `color-mix(in oklab, ${tint} ${fill}%, var(--background))`,
    color: `color-mix(in oklab, ${tint} 44%, var(--foreground))`,
  };
}

function RefPill({
  className,
  emphasis = 'default',
  tint,
  style,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof refPillVariants> & { tint?: string }) {
  return (
    <span
      data-slot='ref-pill'
      data-emphasis={emphasis}
      data-tint={tint}
      className={cn(tint ? REF_PILL_BASE : refPillVariants({ emphasis }), className)}
      style={tint ? { ...refPillTint(tint, emphasis ?? 'default'), ...style } : style}
      {...props}
    />
  );
}

export { RefPill, refPillVariants };
