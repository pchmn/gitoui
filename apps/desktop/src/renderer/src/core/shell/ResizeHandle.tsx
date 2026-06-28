import { cn } from '@gitoui/ui/lib/utils';

interface ResizeHandleProps extends React.ComponentProps<'div'> {
  /** Which edge of its column the handle sits on (matches `useResizable`'s `side`). */
  side: 'left' | 'right';
  /** Highlight the divider while a drag is in progress (from `useResizable`). */
  isDragging: boolean;
}

/**
 * The draggable column divider. It both *is* the Hairline (no separate `border` on the column) and
 * the resize hit area: a wider invisible strip straddling the edge, with a centered 1px line that
 * brightens to `primary` on hover / focus / drag (DESIGN §5 — panes divided by Hairlines).
 */
export function ResizeHandle({ side, isDragging, className, ...props }: ResizeHandleProps) {
  return (
    <div
      className={cn(
        'group absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none select-none',
        // Center the 6px strip over the column edge.
        side === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors',
          'group-hover:bg-primary/60 group-focus-visible:bg-primary',
          isDragging && 'bg-primary',
        )}
      />
    </div>
  );
}
