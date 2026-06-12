import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '#lib/utils';

/**
 * The app's error/notification surface (issue #8). Base UI-backed, styled to the design system:
 * a true overlay — Surface fill, 1px Hairline, the one sanctioned `shadow-overlay`, no color
 * beyond an `alert`-tinted glyph on `error` toasts (the Spent Color Rule).
 *
 * A standalone manager (`createToastManager`) lets non-React code (IPC error handlers, query
 * `onError`) raise toasts imperatively via `toast.add(...)`, while `ToastProvider` + `Toaster`
 * render them. Import all three from `@gitoui/ui/toast`; mount the provider once at the root.
 */
export const toast = ToastPrimitive.createToastManager();

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <ToastPrimitive.Provider toastManager={toast}>{children}</ToastPrimitive.Provider>;
}

export function Toaster() {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className='fixed right-4 bottom-8 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none'>
        <ToastList />
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((t) => (
    <ToastPrimitive.Root
      key={t.id}
      toast={t}
      className={cn(
        'flex items-start gap-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-overlay',
        'transition-all duration-200 ease-out',
        'data-[starting-style]:translate-x-[calc(100%+1.5rem)] data-[starting-style]:opacity-0',
        'data-[ending-style]:translate-x-[calc(100%+1.5rem)] data-[ending-style]:opacity-0',
      )}
    >
      {t.type === 'error' && (
        <WarningCircleIcon weight='fill' className='mt-px size-4 shrink-0 text-destructive' />
      )}
      <div className='min-w-0 flex-1'>
        {t.title && (
          <ToastPrimitive.Title className='text-xs/relaxed font-medium text-foreground' />
        )}
        {t.description && (
          <ToastPrimitive.Description className='mt-0.5 text-xs/snug break-words text-muted-foreground' />
        )}
      </div>
      <ToastPrimitive.Close
        aria-label='Close'
        className='-mt-0.5 -mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30'
      >
        <XIcon className='size-3' />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ));
}
