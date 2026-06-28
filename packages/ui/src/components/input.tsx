import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * Text input field (DESIGN.md §6 — Inputs / Fields). The base-mira shadcn `input`, adapted to the
 * tokens, plus a `ghost` variant.
 *
 * - `default` — `input`-tinted fill behind a 1px Hairline, `rounded-md`, button-matched height.
 *   Focus shifts the border to `ring` with a 2px `ring/30` halo; `aria-invalid` swaps to destructive.
 * - `ghost` — borderless and transparent, no halo. The field inside an `InputGroup` (where the group
 *   owns the chrome) and the flat search field in the Combobox popover / Repository rail filter.
 */
const inputVariants = cva(
  'h-7 w-full min-w-0 px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs/relaxed',
  {
    variants: {
      variant: {
        default:
          'rounded-md border border-input bg-input/20 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        ghost:
          'border-0 bg-transparent shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Input({
  className,
  type,
  variant,
  ...props
}: ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
