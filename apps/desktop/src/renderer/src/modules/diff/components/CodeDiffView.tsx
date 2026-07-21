import { useEffect, useState } from 'react';
import { useStatus } from '#renderer/modules/changes/hooks/useStatus';
import { useCommitDetail } from '#renderer/modules/commits/hooks/useCommitDetail';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useCenterView } from '../CenterViewContext';
import { useDiff } from '../hooks/useDiff';
import { CodeDiffHeader } from './CodeDiffHeader';
import { DiffBody } from './DiffBody';

/**
 * The Code & Diff view (issue #67): replaces the Commit graph in the app shell's center while a
 * file is targeted (`CenterViewContext`). The header (`CodeDiffHeader`) stays mounted across every
 * body state — the diff body itself is delegated to `@pierre/diffs` via `DiffBody`.
 *
 * The status glyph/stats come from whichever collection already has them warm (the `status`
 * collection for `unstaged`/`staged`, `commitDetail` for `commit`) rather than duplicating them into
 * `CenterViewFile` — the diff response itself is the source of truth for `oldPath` (a rename), since
 * it's resolved in `core` regardless of what Status/CommitDetail happen to know.
 */

/** localStorage key for the Unified/Split layout toggle — a global preference, not per-file. */
const DIFF_LAYOUT_KEY = 'gitoui.diff.layout';

export function CodeDiffView() {
  const { root } = useActiveRepository();
  const { file, close } = useCenterView();
  const [diffStyle, setDiffStyle] = useState<'unified' | 'split'>(() =>
    localStorage.getItem(DIFF_LAYOUT_KEY) === 'split' ? 'split' : 'unified',
  );
  function chooseDiffStyle(next: 'unified' | 'split') {
    setDiffStyle(next);
    localStorage.setItem(DIFF_LAYOUT_KEY, next);
  }
  const { data: status } = useStatus(root);
  const commitSha = file?.source.kind === 'commit' ? file.source.sha : null;
  const { data: commitDetail } = useCommitDetail(root, commitSha);
  const { data, isLoading, isError, error, refetch } = useDiff(
    root,
    file?.path ?? null,
    file?.source ?? null,
  );

  // First Esc closes the view; `preventDefault` (fired in the CAPTURE phase, ahead of the graph's
  // own bubble-phase Esc handler in `CommitGraph`) is what makes the second Esc — once the graph is
  // back — the one that clears the Commit selection, never both in the same keystroke.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [close]);

  if (file === null) return null;

  const entry = status?.entries.find((e) => e.path === file.path);
  const change =
    file.source.kind === 'commit'
      ? commitDetail?.changes.find((c) => c.path === file.path)
      : file.source.kind === 'staged'
        ? entry?.staged
        : entry?.unstaged;
  const oldPath = data?.oldPath;
  const showLayoutToggle = !isError && !data?.binary;

  return (
    <div className='flex h-full flex-col' data-slot='code-diff-view'>
      <CodeDiffHeader
        change={change}
        path={file.path}
        oldPath={oldPath}
        showLayoutToggle={showLayoutToggle}
        diffStyle={diffStyle}
        onDiffStyleChange={chooseDiffStyle}
        onClose={close}
      />

      <div className='min-h-0 flex-1 overflow-auto'>
        {isLoading && <CodeDiffViewSkeleton />}

        {isError && (
          <div className='flex h-full flex-col items-center justify-center gap-2 px-3 py-2 text-center'>
            <p className='text-xs text-muted-foreground' role='alert'>
              {matchError<GitError<'diff'>, string>(error, {
                RepoNotFoundError: (e) => messages.codeDiffView.repoNotFound(e.path),
                FileTooLargeError: (e) => messages.codeDiffView.fileTooLarge(e.path),
                _: () => messages.codeDiffView.failedToLoad,
              })}
            </p>
            <button
              type='button'
              onClick={() => refetch()}
              className='rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted'
            >
              {messages.codeDiffView.retry}
            </button>
          </div>
        )}

        {data &&
          (data.binary ? (
            <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
              {messages.codeDiffView.binaryPlaceholder}
            </div>
          ) : (
            <DiffBody
              path={file.path}
              oldPath={data.oldPath}
              oldContent={data.oldContent}
              newContent={data.newContent}
              diffStyle={diffStyle}
            />
          ))}
      </div>
    </div>
  );
}

/** Skeleton shown while the diff loads (no spinner — matches `CommitDetail`'s convention). */
function CodeDiffViewSkeleton() {
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
