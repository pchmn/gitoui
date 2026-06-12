import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CaretUpDownIcon, CheckIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { cn } from '#lib/utils';

/**
 * Reusable filterable-select popover, Base UI-backed and styled to the design system (issue #9).
 * Built generic on purpose: the Repository selector composes it now, the branch selector reuses it
 * next tranche. A true overlay — Surface (`popover`) fill, 1px Hairline, the one `shadow-overlay`
 * (DESIGN §4) — with dense Label-size rows (no card per row), Accent highlight, and `primary` on
 * the selected marker (DESIGN §5).
 *
 * Composition mirrors shadcn's base-mira combobox: a `ComboboxTrigger` anchor (often a `Button` via
 * `render`) holding a `ComboboxValue`, then a `ComboboxContent` with a `ComboboxInput` search field,
 * a `ComboboxEmpty`, and a `ComboboxList` whose function child renders one `ComboboxItem` per item.
 */
const Combobox = ComboboxPrimitive.Root;

function ComboboxValue(props: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot='combobox-value' {...props} />;
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot='combobox-trigger'
      className={cn("[&_svg:not([class*='size-'])]:size-3.5", className)}
      {...props}
    >
      {children}
      <CaretUpDownIcon className='pointer-events-none shrink-0 text-muted-foreground' />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div className='flex items-center gap-2 border-b border-border px-2.5'>
      <MagnifyingGlassIcon className='size-3.5 shrink-0 text-muted-foreground' />
      <ComboboxPrimitive.Input
        data-slot='combobox-input'
        className={cn(
          'h-8 w-full bg-transparent text-xs/relaxed text-foreground outline-none placeholder:text-muted-foreground',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  alignOffset = 0,
  anchor,
  children,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className='isolate z-50'
      >
        <ComboboxPrimitive.Popup
          data-slot='combobox-content'
          className={cn(
            'group/combobox-content relative flex max-h-[var(--available-height)] min-w-[var(--anchor-width)] max-w-[var(--available-width)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-overlay',
            'origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out',
            'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot='combobox-list'
      className={cn('max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1', className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot='combobox-item'
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs/relaxed outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        data-slot='combobox-item-indicator'
        className='ml-auto flex shrink-0 items-center text-primary'
      >
        <CheckIcon className='size-3.5' />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot='combobox-group' className={cn(className)} {...props} />
  );
}

function ComboboxGroupLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot='combobox-group-label'
      className={cn(
        'px-2 py-1.5 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot='combobox-empty'
      className={cn(
        'hidden justify-center px-2 py-6 text-center text-xs/relaxed text-muted-foreground group-data-empty/combobox-content:flex',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot='combobox-separator'
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
};
