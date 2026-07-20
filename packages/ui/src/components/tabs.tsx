import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva } from 'class-variance-authority';
import { createContext, useContext } from 'react';
import { cn } from '#lib/utils';

/**
 * Base UI tabs, two visual variants (DESIGN.md §Navigation — the same "Tabs" family covers Changes ⇄
 * Tree, Diff | File, Unified | Split):
 * - `underline` (default): a `primary` underline that tracks the active tab via `TabsIndicator`'s
 *   `--active-tab-left` / `--active-tab-width` CSS vars.
 * - `segmented`: a compact bordered group with a filled active segment — no `TabsIndicator`. Suits a
 *   display toggle (e.g. Unified | Split) where the tabs sit inline next to other controls.
 *
 * `variant` is set on `TabsRoot` and reaches `TabsList` / `TabsTab` through context.
 *
 * Usage:
 *   <TabsRoot defaultValue='changes'>
 *     <TabsList>
 *       <TabsTab value='changes'>Changes</TabsTab>
 *       <TabsTab value='tree'>Tree</TabsTab>
 *       <TabsIndicator />
 *     </TabsList>
 *     <TabsPanel value='changes'>...</TabsPanel>
 *   </TabsRoot>
 */

type TabsVariant = 'underline' | 'segmented';

const TabsVariantContext = createContext<TabsVariant>('underline');

const tabsListVariants = cva('flex items-center', {
  variants: {
    variant: {
      underline: 'relative gap-1 border-b border-border',
      segmented: 'gap-0.5 rounded-md border border-border p-0.5',
    },
  },
});

const tabsTabVariants = cva(
  'flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium text-muted-foreground outline-none transition-colors select-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[active]:text-foreground',
  {
    variants: {
      variant: {
        underline:
          'relative h-7 px-2.5 text-xs/relaxed focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30',
        segmented:
          'h-6 gap-1 rounded-sm px-2 text-xs/relaxed focus-visible:ring-2 focus-visible:ring-ring/40 data-[active]:bg-muted',
      },
    },
  },
);

function TabsRoot({
  className,
  variant = 'underline',
  ...props
}: TabsPrimitive.Root.Props & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root data-slot='tabs' className={cn('flex flex-col', className)} {...props} />
    </TabsVariantContext.Provider>
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.List
      data-slot='tabs-list'
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Tab
      data-slot='tabs-tab'
      className={cn(tabsTabVariants({ variant }), className)}
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
