import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from '@gitoui/ui/collapsible';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

/**
 * A collapsible section in the repository rail. Composes `Collapsible` from `@gitoui/ui`:
 * header = chevron + leading icon + label + flex-spacer + count badge; panel = children.
 *
 * Controlled via `open`/`onOpenChange` — the rail owns persistence (per-section localStorage).
 * Multiple sections can be open at once (not a single-open accordion).
 *
 * Count badge always renders (even when 0) as Micro-text on muted background, right-aligned.
 * Per DESIGN.md "Side rail" + the count chip in docs/mockups/main.png.
 */
export type RailSectionProps = {
  /** Persistence key suffix, e.g. 'branches'. */
  id: string;
  /** Leading icon shown next to the label in the section header. */
  icon: ReactNode;
  /** Section heading label. */
  label: string;
  /** Count badge — always rendered, even when 0. */
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function RailSection({
  icon,
  label,
  count,
  open,
  onOpenChange,
  children,
}: RailSectionProps) {
  return (
    <CollapsibleRoot open={open} onOpenChange={onOpenChange} className='flex flex-col'>
      <CollapsibleTrigger className='flex h-8 w-full items-center gap-1.5 px-3 pr-2 text-xs font-bold text-muted-foreground hover:text-foreground'>
        {/* Chevron — CaretRight when closed, CaretDown when open (matches tree folder pattern). */}
        {open ? (
          <CaretDownIcon className='size-3 shrink-0' aria-hidden='true' />
        ) : (
          <CaretRightIcon className='size-3 shrink-0' aria-hidden='true' />
        )}
        {/* Leading icon */}
        <span
          className='size-3.5 shrink-0 [&>svg]:size-3.5 text-muted-foreground'
          aria-hidden='true'
        >
          {icon}
        </span>
        {/* Label */}
        <span className='flex-1 text-left'>{label}</span>
        {/* Count badge — Micro-text on muted, right-aligned. */}
        <span className='rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.625rem] leading-none text-muted-foreground tabular-nums'>
          {count}
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>{children}</CollapsiblePanel>
    </CollapsibleRoot>
  );
}
