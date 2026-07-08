import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import { cn } from '#lib/utils';

/**
 * Styled scroll viewport (DESIGN.md — chrome recedes) for the Inspector's lists and the center
 * view. Mirrors the thin, token-derived, `::-webkit-scrollbar` look the rest of the app gets for
 * free (`globals.css`), for the cases — nested/virtualized panes — that need Base UI's own
 * cross-platform scrollbar instead of the native one.
 *
 * Usage:
 *   <ScrollAreaRoot className='h-full'>
 *     <ScrollAreaViewport>
 *       <ScrollAreaContent>...</ScrollAreaContent>
 *     </ScrollAreaViewport>
 *     <ScrollAreaScrollbar orientation='vertical'>
 *       <ScrollAreaThumb />
 *     </ScrollAreaScrollbar>
 *     <ScrollAreaCorner />
 *   </ScrollAreaRoot>
 */

function ScrollAreaRoot({ className, ...props }: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot='scroll-area'
      className={cn('relative overflow-hidden', className)}
      {...props}
    />
  );
}

function ScrollAreaViewport({ className, ...props }: ScrollAreaPrimitive.Viewport.Props) {
  return (
    <ScrollAreaPrimitive.Viewport
      data-slot='scroll-area-viewport'
      className={cn('size-full overscroll-contain outline-none', className)}
      {...props}
    />
  );
}

function ScrollAreaContent({ className, ...props }: ScrollAreaPrimitive.Content.Props) {
  return (
    <ScrollAreaPrimitive.Content
      data-slot='scroll-area-content'
      className={cn(className)}
      {...props}
    />
  );
}

function ScrollAreaScrollbar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot='scroll-area-scrollbar'
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2.5',
        orientation === 'horizontal' && 'h-2.5 w-full flex-col',
        className,
      )}
      {...props}
    />
  );
}

function ScrollAreaThumb({ className, ...props }: ScrollAreaPrimitive.Thumb.Props) {
  return (
    <ScrollAreaPrimitive.Thumb
      data-slot='scroll-area-thumb'
      className={cn(
        'relative flex-1 rounded-full bg-muted-foreground/25 transition-colors hover:bg-muted-foreground/40',
        className,
      )}
      {...props}
    />
  );
}

function ScrollAreaCorner({ className, ...props }: ScrollAreaPrimitive.Corner.Props) {
  return (
    <ScrollAreaPrimitive.Corner
      data-slot='scroll-area-corner'
      className={cn('bg-transparent', className)}
      {...props}
    />
  );
}

export {
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
};
