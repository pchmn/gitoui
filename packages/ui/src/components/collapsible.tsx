import { Collapsible as CollapsiblePrimitive } from '@base-ui-components/react/collapsible';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * Thin wrapper over `@base-ui-components/react/collapsible` (`Collapsible.Root/Trigger/Panel`),
 * styled with cva/cn. Mirrors the `Button`/`Input` wrapper structure. Supports controlled
 * `open`/`onOpenChange`. Keep it generic — no rail-specific chrome inside the ui package.
 *
 * Usage:
 *   <Collapsible.Root open={open} onOpenChange={setOpen}>
 *     <Collapsible.Trigger>Toggle</Collapsible.Trigger>
 *     <Collapsible.Panel>Content</Collapsible.Panel>
 *   </Collapsible.Root>
 */

const collapsibleRootVariants = cva('flex flex-col');

function CollapsibleRoot({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Root> &
  VariantProps<typeof collapsibleRootVariants>) {
  return (
    <CollapsiblePrimitive.Root
      data-slot='collapsible'
      className={cn(collapsibleRootVariants(), className)}
      {...props}
    />
  );
}

const collapsibleTriggerVariants = cva('flex cursor-default select-none items-center outline-none');

function CollapsibleTrigger({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Trigger> &
  VariantProps<typeof collapsibleTriggerVariants>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot='collapsible-trigger'
      className={cn(collapsibleTriggerVariants(), className)}
      {...props}
    />
  );
}

const collapsiblePanelVariants = cva('overflow-hidden');

function CollapsiblePanel({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Panel> &
  VariantProps<typeof collapsiblePanelVariants>) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot='collapsible-panel'
      className={cn(collapsiblePanelVariants(), className)}
      {...props}
    />
  );
}

export { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger };
