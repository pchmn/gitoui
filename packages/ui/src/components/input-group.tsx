import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { Button } from '#components/button';
import { Input } from '#components/input';
import { Textarea } from '#components/textarea';
import { cn } from '#lib/utils';

/**
 * A field that carries leading/trailing addons (an icon, a button, static text) flush inside its
 * chrome. The base-mira shadcn `input-group`, adapted to the tokens, plus a `ghost` variant.
 *
 * The group owns the chrome and the `InputGroupInput` reuses `Input` with `border-0`, so an addon
 * reads as part of the field rather than a sibling control.
 *
 * - `default` — boxed: `input` fill, 1px Hairline, `rounded-md`, button-matched height, with a
 *   `focus-within` border + ring driven by the inner control.
 * - `ghost` — no border, no fill, no halo. The flat search field framed by its own container (the
 *   Combobox popover, the Repository rail). It is the Branch / Repository selector search look.
 */
const inputGroupVariants = cva(
  'group/input-group relative flex w-full min-w-0 items-center transition-[color,box-shadow] outline-none has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5',
  {
    variants: {
      variant: {
        default:
          'h-7 rounded-md border border-input bg-input/20 has-data-[align=block-end]:rounded-md has-data-[align=block-start]:rounded-md has-[textarea]:rounded-md has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/30 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-2 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 dark:bg-input/30 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',
        ghost: '',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function InputGroup({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof inputGroupVariants>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled field wrapper, not a <fieldset> with a legend
    <div
      data-slot='input-group'
      role='group'
      className={cn(inputGroupVariants({ variant }), className)}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-1 py-2 text-xs/relaxed font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-2 has-[>button]:ml-[-0.275rem]',
        'inline-end': 'order-last pr-2 has-[>button]:mr-[-0.275rem]',
        'block-start': 'order-first w-full justify-start px-2 pt-2 [.border-b]:pb-2',
        'block-end': 'order-last w-full justify-start px-2 pb-2 [.border-t]:pt-2',
      },
    },
    defaultVariants: { align: 'inline-start' },
  },
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled addon wrapper, not a <fieldset> with a legend
    // biome-ignore lint/a11y/useKeyWithClickEvents: click-to-focus convenience; keyboard users tab straight to the input
    <div
      role='group'
      data-slot='input-group-addon'
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva(
  'flex items-center gap-2 rounded-md text-xs/relaxed shadow-none',
  {
    variants: {
      size: {
        xs: "h-5 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 [&>svg:not([class*='size-'])]:size-3",
        sm: 'gap-1',
        'icon-xs': 'size-6 p-0 has-[>svg]:p-0',
        'icon-sm': 'size-7 p-0 has-[>svg]:p-0',
      },
    },
    defaultVariants: { size: 'xs' },
  },
);

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<ComponentProps<typeof Button>, 'size' | 'type'> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: 'button' | 'submit' | 'reset';
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-xs/relaxed text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/** The borderless control inside an `InputGroup` — reuses `Input` (ghost), chrome lives on the group. */
function InputGroupInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <Input
      variant='ghost'
      data-slot='input-group-control'
      className={cn('flex-1 rounded-none', className)}
      {...props}
    />
  );
}

function InputGroupTextarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot='input-group-control'
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
