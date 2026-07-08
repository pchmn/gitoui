import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * A ref pill (DESIGN §5 Ref pills / the `ref-pill` token): a tiny `rounded-sm` Micro-text marker
 * for a Branch / Tag / HEAD sitting on a Commit, shown in the graph's GRAPH · REFS column.
 *
 * Emphasis follows DESIGN — Accent Surface at rest; the current Branch and special states
 * (Detached HEAD) take a `strong`er primary tint; remote-tracking Branches and Tags read
 * `quiet`er on Muted Surface. Tiny, quiet, scannable — never boxed, never a button (the pill
 * shape is sanctioned here and nowhere else).
 *
 * Every fill is opaque (the strong tint is pre-mixed over the canvas rather than a translucent
 * primary): in the graph, hovering a row extends its pills over the lane lines, and a see-through
 * pill would let the lines bleed into the text.
 */
// `inline-block`, not `inline-flex`: `truncate`'s text-overflow only ellipsizes inline content
// of a block container — on a flex container it hard-crops the name mid-letter instead.
const refPillVariants = cva(
  'inline-block max-w-40 shrink-0 truncate rounded-sm px-1.5 text-[0.625rem]/4 font-medium tracking-[0.01em] select-none',
  {
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
  },
);

function RefPill({
  className,
  emphasis = 'default',
  ...props
}: ComponentProps<'span'> & VariantProps<typeof refPillVariants>) {
  return (
    <span
      data-slot='ref-pill'
      data-emphasis={emphasis}
      className={cn(refPillVariants({ emphasis, className }))}
      {...props}
    />
  );
}

export { RefPill, refPillVariants };
