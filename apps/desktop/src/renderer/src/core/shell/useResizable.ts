import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

interface UseResizableOptions {
  /** localStorage key the width (in px) is persisted under, so it survives reloads. */
  storageKey: string;
  /** Width used on first run and restored on double-click. */
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /**
   * Which edge the handle sits on. `left` = a left column (rail): dragging right grows it.
   * `right` = a right column (inspector): dragging left grows it. Flips the drag delta sign.
   */
  side: 'left' | 'right';
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function readStored(key: string, fallback: number, min: number, max: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

/**
 * Pixel-based column resizing for the app shell (rail + future inspector). The column keeps its px
 * width when the window resizes — the flex center absorbs the change — and the width is persisted to
 * localStorage (pure view state, no IPC round-trip per drag). Returns `handleProps` to spread onto a
 * focusable `role="separator"` element: pointer-drag (with capture, robust outside the window),
 * Arrow keys (±8px, ±32px with Shift), and double-click to reset.
 */
export function useResizable({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
}: UseResizableOptions) {
  const [width, setWidth] = useState(() =>
    readStored(storageKey, defaultWidth, minWidth, maxWidth),
  );
  const [isDragging, setIsDragging] = useState(false);

  // Read the live width inside the drag closure without re-subscribing listeners on every px.
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return; // primary button only
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = widthRef.current;
      const dir = side === 'left' ? 1 : -1;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';

      const onMove = (e: PointerEvent) => {
        setWidth(clamp(startWidth + dir * (e.clientX - startX), minWidth, maxWidth));
      };
      const onUp = (e: PointerEvent) => {
        setIsDragging(false);
        document.body.style.cursor = '';
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    },
    [side, minWidth, maxWidth],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.shiftKey ? 32 : 8;
      const dir = side === 'left' ? 1 : -1;
      const grow = event.key === 'ArrowRight' ? 1 : -1;
      setWidth((w) => clamp(w + dir * grow * step, minWidth, maxWidth));
    },
    [side, minWidth, maxWidth],
  );

  const reset = useCallback(() => setWidth(defaultWidth), [defaultWidth]);

  const handleProps = {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-valuenow': Math.round(width),
    'aria-valuemin': minWidth,
    'aria-valuemax': maxWidth,
    tabIndex: 0,
    onPointerDown,
    onKeyDown,
    onDoubleClick: reset,
  } as const;

  return { width, isDragging, handleProps };
}
