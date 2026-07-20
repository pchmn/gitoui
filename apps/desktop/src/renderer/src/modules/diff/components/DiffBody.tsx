import type { DiffSource } from '@gitoui/contracts/git';
import {
  areLanguagesAttached,
  areThemesAttached,
  DEFAULT_THEMES,
  getFiletypeFromFileName,
  getHighlighterOptions,
  getSharedHighlighter,
  isHighlighterLoaded,
  parseDiffFromFile,
  type SupportedLanguages,
} from '@pierre/diffs';
import { FileDiff, useWorkerPool, WorkerPoolContextProvider } from '@pierre/diffs/react';
import DiffsHighlightWorker from '@pierre/diffs/worker/worker.js?worker';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { diffQueryOptions } from '../hooks/useDiff';

/**
 * The wrapper around `@pierre/diffs` (ADR 0008; issue #67) — the ONLY place the library is imported,
 * so a future swap touches this one file.
 *
 * Renders via `FileDiff` (full old/new contents), NOT `PatchDiff` (patch only): the library needs
 * the surrounding lines to make the "N unmodified lines" separators EXPANDABLE — a patch carries at
 * most a few context lines, so `PatchDiff` can show the gap count but never open it. The `Diff`
 * contract ships `oldContent`/`newContent` for exactly this (see its doc comment). Trade-off: the
 * hunks are the library's recomputation of the diff, not git's own patch hunks.
 *
 * Uses the library's DEFAULT theme (`pierre-light`/`pierre-dark`); plating our OKLCH tokens onto it
 * is a deliberate second step (see globals.css note). `diffIndicators: 'classic'` = the `+`/`−`
 * gutter (DESIGN.md §5), colored from the default theme's own add/delete bases. `disableFileHeader`
 * drops the library's own filename bar — `CodeDiffView` already renders the header (path + stats).
 *
 * The default theme is `themeType: 'system'` — it follows the CSS `color-scheme`, which our scoped
 * rule in globals.css maps to the app's `.dark` class so light/dark tracks the app, not the OS.
 *
 * Highlighting runs on the library's worker pool (`DiffWorkerPool`): with a working pool the first
 * render paints PLAIN text synchronously and Shiki colors stream in from the workers, so opening a
 * diff never blocks the UI thread on tokenizing a whole file. The main-thread path (the shared
 * highlighter, preloaded and gated so the first frame is deterministic — its async self-heal is
 * unreliable under StrictMode) survives as the fallback when the pool is absent or its workers
 * failed to spawn.
 *
 * The library is patched (`patches/@pierre__diffs@1.2.12.patch`): under StrictMode's double-mount
 * the worker response never triggered a repaint, leaving every first open unhighlighted in dev.
 * See ADR 0008's consequences for the full story; re-check the patch on upgrades.
 */
export function DiffBody({
  path,
  oldPath,
  oldContent,
  newContent,
  diffStyle,
}: {
  path: string;
  oldPath: string | undefined;
  oldContent: string | null;
  newContent: string | null;
  diffStyle: 'unified' | 'split';
}) {
  const fileDiff = useMemo(
    () => parseDiffForHighlight(path, oldPath, oldContent, newContent),
    [path, oldPath, oldContent, newContent],
  );

  const pool = useWorkerPoolState();
  const highlighterReady = useHighlighterReady(
    fileDiff.lang ?? getFiletypeFromFileName(path),
    pool === 'unavailable',
  );
  if (pool === 'warming' || (pool === 'unavailable' && !highlighterReady))
    return <DiffBodyPending />;

  return (
    <FileDiff
      fileDiff={fileDiff}
      disableWorkerPool={pool === 'unavailable'}
      options={{ diffStyle, diffIndicators: 'classic', disableFileHeader: true }}
    />
  );
}

/**
 * Parse a diff for the highlighter, keyed for the pool's result cache. The `cacheKey` is derived
 * from name + a content hash (NOT path + source: working-tree contents mutate under a stable path,
 * and the library serves cache hits by key alone). Must stay the single parse used by BOTH the
 * primer and `DiffBody`, so a primed result is found again at open time.
 */
function parseDiffForHighlight(
  path: string,
  oldPath: string | undefined,
  oldContent: string | null,
  newContent: string | null,
) {
  const oldName = oldPath ?? path;
  return parseDiffFromFile(
    {
      name: oldName,
      contents: oldContent ?? '',
      cacheKey: `${oldName}:${fnv1a(oldContent ?? '')}`,
    },
    { name: path, contents: newContent ?? '', cacheKey: `${path}:${fnv1a(newContent ?? '')}` },
  );
}

/** FNV-1a 32-bit — cheap, stable content hash for the highlight cache key. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Pre-highlight one file's diff so opening it paints colorized on the FIRST frame (no plain-text
 * flash): prefetches the same diff query the view will mount with, then hands the parsed diff to
 * the pool's prime cache. Fired from list-row hover/focus — both are throttled naturally (the
 * query result stays fresh 15s; the pool dedupes primes by cacheKey). No-op without a warm pool.
 */
export function useDiffPrimer(repoPath: string | null) {
  const pool = useWorkerPool();
  const queryClient = useQueryClient();
  return useCallback(
    (path: string, source: DiffSource) => {
      if (repoPath === null || pool == null || !pool.isInitialized()) return;
      queryClient
        .fetchQuery({ ...diffQueryOptions(repoPath, path, source), staleTime: 15_000 })
        .then((diff) => {
          if (diff.binary) return;
          pool.primeDiffHighlightCache(
            parseDiffForHighlight(path, diff.oldPath, diff.oldContent, diff.newContent),
          );
        })
        // Priming is best-effort — the real open surfaces any error itself.
        .catch(() => {});
    },
    [repoPath, pool, queryClient],
  );
}

/**
 * Hosts the library's highlight worker pool. Mounted once in `AppShell` — NOT per diff view — so
 * the workers warm up at launch (ahead of the first diff) and survive closing the view: the
 * provider terminates the pool when it unmounts. Two workers are plenty for a one-file-at-a-time
 * view; the library's default of 8 targets PR-style multi-file pages.
 */
export function DiffWorkerPool({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider
      poolOptions={{ workerFactory: () => new DiffsHighlightWorker(), poolSize: 2 }}
      highlighterOptions={{}}
    >
      <WarmWorkerPool />
      {children}
    </WorkerPoolContextProvider>
  );
}

/**
 * Grammars resolved into the workers at warm-up: first open of a file in these languages skips the
 * async grammar resolution, shrinking the plain-text flash to the worker round trip. Any other
 * language still works — its grammar just resolves on first use.
 */
const WARM_LANGUAGES = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'css',
  'html',
  'yaml',
] satisfies SupportedLanguages[];

/** Kicks off pool initialization at mount; a failure is not fatal (DiffBody falls back). */
function WarmWorkerPool() {
  const pool = useWorkerPool();
  useEffect(() => {
    pool?.initialize(WARM_LANGUAGES).catch(() => {});
  }, [pool]);
  return null;
}

/**
 * 'ready' once the pool can serve renders; 'warming' while it initializes (brief — it warms at app
 * launch); 'unavailable' when there is no provider above or the workers failed to spawn, in which
 * case `DiffBody` falls back to the gated main-thread highlighter.
 */
function useWorkerPoolState(): 'ready' | 'warming' | 'unavailable' {
  const pool = useWorkerPool();
  const initialized = pool?.isInitialized() ?? false;
  const [failed, setFailed] = useState(false);
  const [, reevaluate] = useState(0);

  useEffect(() => {
    if (pool == null || initialized) return;
    let cancelled = false;
    // Idempotent — shares the in-flight promise with `WarmWorkerPool` (and retries a failed init).
    pool.initialize().then(
      () => {
        if (!cancelled) reevaluate((n) => n + 1);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pool, initialized]);

  if (pool == null || failed) return 'unavailable';
  return initialized ? 'ready' : 'warming';
}

/**
 * True once the shared MAIN-THREAD highlighter can paint `lang` synchronously (instance + theme +
 * grammar all loaded); otherwise kicks off the load and re-evaluates when it resolves. Computed from
 * live module state every render so switching to a not-yet-loaded language re-gates correctly.
 * Only loads when `enabled` — it is the fallback for a missing/failed worker pool.
 */
function useHighlighterReady(lang: string, enabled: boolean): boolean {
  const ready =
    isHighlighterLoaded() && areThemesAttached(DEFAULT_THEMES) && areLanguagesAttached(lang);
  const [, reevaluate] = useState(0);

  useEffect(() => {
    if (!enabled || ready) return;
    let cancelled = false;
    getSharedHighlighter(getHighlighterOptions(lang, {})).then(
      () => {
        if (!cancelled) reevaluate((n) => n + 1);
      },
      // A grammar/theme load failure leaves the renderer's own plain-text fallback to cope.
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, ready, lang]);

  return ready;
}

/** Shown while the highlighter warms for a not-yet-loaded language — matches `CodeDiffViewSkeleton`. */
function DiffBodyPending() {
  return (
    <div
      role='status'
      className='flex flex-col gap-2 px-3 py-2'
      aria-busy='true'
      aria-label='Loading diff'
    >
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className='h-3 animate-pulse rounded-sm bg-muted'
          style={{ width: `${40 + (i % 4) * 15}%` }}
        />
      ))}
    </div>
  );
}
