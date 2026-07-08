import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from '@phosphor-icons/react';
import { cn } from '#lib/utils';

/**
 * Compact tri-state checkbox (DESIGN.md §6), sized for dense Label-size list rows — the Changes
 * panel's stage/unstage toggles. Flat at rest: 1px Hairline border over an `input`-tinted fill;
 * checked (or indeterminate) swaps to a tonal `primary` fill with a matching glyph.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(
        'peer flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-input bg-input/20 outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 data-[checked]:border-primary data-[checked]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:bg-primary dark:bg-input/30',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='flex items-center justify-center text-primary-foreground data-[unchecked]:hidden'
      >
        {props.indeterminate ? (
          <MinusIcon weight='bold' className='size-2.5' />
        ) : (
          <CheckIcon weight='bold' className='size-2.5' />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
