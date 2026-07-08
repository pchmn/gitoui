import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '#lib/utils';

/**
 * Base UI tabs styled per DESIGN.md's navigation rules: an underline `primary` active state that
 * tracks the selected tab via `TabsIndicator`'s `--active-tab-left` / `--active-tab-width` CSS
 * vars — never a boxed/pill active state. Serves Changes ⇄ Tree and Diff | File.
 *
 * Usage:
 *   <Tabs.Root defaultValue='changes'>
 *     <Tabs.List>
 *       <Tabs.Tab value='changes'>Changes</Tabs.Tab>
 *       <Tabs.Tab value='tree'>Tree</Tabs.Tab>
 *       <Tabs.Indicator />
 *     </Tabs.List>
 *     <Tabs.Panel value='changes'>...</Tabs.Panel>
 *     <Tabs.Panel value='tree'>...</Tabs.Panel>
 *   </Tabs.Root>
 */

function TabsRoot({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root data-slot='tabs' className={cn('flex flex-col', className)} {...props} />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot='tabs-list'
      className={cn('relative flex items-center gap-1 border-b border-border', className)}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot='tabs-tab'
      className={cn(
        'relative flex h-7 shrink-0 cursor-default items-center justify-center px-2.5 text-xs/relaxed font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors select-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 data-[active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot='tabs-indicator'
      className={cn(
        'absolute bottom-0 h-0.5 rounded-full bg-primary transition-all duration-200 ease-out',
        'left-[var(--active-tab-left)] w-[var(--active-tab-width)]',
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot='tabs-panel'
      className={cn('outline-none', className)}
      {...props}
    />
  );
}

export { TabsIndicator, TabsList, TabsPanel, TabsRoot, TabsTab };
