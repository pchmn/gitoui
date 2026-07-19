import {
  areLanguagesAttached,
  areThemesAttached,
  DEFAULT_THEMES,
  getFiletypeFromFileName,
  getHighlighterOptions,
  getSharedHighlighter,
  isHighlighterLoaded,
  parseDiffFromFile,
} from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import { useEffect, useMemo, useState } from 'react';

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
 * `disableWorkerPool`: the highlighter runs on the main thread. With no worker to fall back on, the
 * library's FIRST synchronous render produces nothing until Shiki (theme + this file's grammar) has
 * loaded — it then self-heals via an async re-render that is unreliable under StrictMode (blank pane
 * until the next render). So we PRELOAD the highlighter and gate `FileDiff` on readiness: it mounts
 * only once the highlighter can paint synchronously, making the first frame deterministic.
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
    () =>
      parseDiffFromFile(
        { name: oldPath ?? path, contents: oldContent ?? '' },
        { name: path, contents: newContent ?? '' },
      ),
    [path, oldPath, oldContent, newContent],
  );

  const ready = useHighlighterReady(fileDiff.lang ?? getFiletypeFromFileName(path));
  if (!ready) return <DiffBodyPending />;

  return (
    <FileDiff
      fileDiff={fileDiff}
      disableWorkerPool
      options={{ diffStyle, diffIndicators: 'classic', disableFileHeader: true }}
    />
  );
}

/**
 * True once the shared highlighter can paint `lang` synchronously (instance + theme + grammar all
 * loaded); otherwise kicks off the load and re-evaluates when it resolves. Computed from live module
 * state every render so switching to a not-yet-loaded language re-gates correctly.
 */
function useHighlighterReady(lang: string): boolean {
  const ready =
    isHighlighterLoaded() && areThemesAttached(DEFAULT_THEMES) && areLanguagesAttached(lang);
  const [, reevaluate] = useState(0);

  useEffect(() => {
    if (ready) return;
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
  }, [ready, lang]);

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
