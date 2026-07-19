import { cn } from '@gitoui/ui/lib/utils';
import { TabsList, TabsRoot, TabsTab } from '@gitoui/ui/tabs';
import { ColumnsIcon, type Icon, RowsIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import {
  CHANGE_LETTER,
  CHANGE_LETTER_TONE,
} from '#renderer/modules/changes/components/changeGlyph';
import { useStatus } from '#renderer/modules/changes/hooks/useStatus';
import { useCommitDetail } from '#renderer/modules/commits/hooks/useCommitDetail';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import { FilePath } from '#renderer/shared/components/FilePath';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { useCenterView } from '../CenterViewContext';
import { useDiff } from '../hooks/useDiff';
import { DiffBody } from './DiffBody';

/**
 * The Code & Diff view (issue #67): replaces the Commit graph in the app shell's center while a
 * file is targeted (`CenterViewContext`). Header per DESIGN.md/CONTEXT.md — status glyph + path +
 * `+N −N`, a `Diff | File` tab bar (**Diff only** this slice; `File` arrives with the Tree slice),
 * × — then the diff body, delegated to `@pierre/diffs` via `DiffBody`.
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
  const showAdditions = change?.additions !== undefined && change.additions > 0;
  const showDeletions = change?.deletions !== undefined && change.deletions > 0;
  const showLayoutToggle = !isError && !data?.binary;

  return (
    <div className='flex h-full flex-col' data-slot='code-diff-view'>
      <header className='flex h-9 shrink-0 items-center gap-2 border-b border-border px-3'>
        {change && (
          <span
            data-kind={change.kind}
            className={cn(
              'w-3.5 shrink-0 text-center font-semibold text-xs tabular-nums',
              CHANGE_LETTER_TONE[change.kind],
            )}
            aria-hidden='true'
          >
            {CHANGE_LETTER[change.kind]}
          </span>
        )}
        <FilePath
          path={file.path}
          oldPath={oldPath}
          title={oldPath !== undefined ? `${oldPath} → ${file.path}` : file.path}
          className='flex-1 text-sm'
        />
        {(showAdditions || showDeletions) && (
          <span className='flex shrink-0 items-center gap-1.5 font-mono text-[0.625rem] tabular-nums'>
            {showAdditions && <span className='text-git-added'>+{change?.additions}</span>}
            {showDeletions && <span className='text-git-deleted'>−{change?.deletions}</span>}
          </span>
        )}
        {showLayoutToggle && (
          // biome-ignore lint/a11y/useSemanticElements: a styled toggle-button group, not a <fieldset> with a legend
          <div
            role='group'
            aria-label={messages.codeDiffView.layoutGroupAria}
            className='flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5'
          >
            <LayoutButton
              active={diffStyle === 'unified'}
              onClick={() => chooseDiffStyle('unified')}
              label={messages.codeDiffView.unifiedLabel}
              ariaLabel={messages.codeDiffView.unifiedAria}
              Icon={RowsIcon}
            />
            <LayoutButton
              active={diffStyle === 'split'}
              onClick={() => chooseDiffStyle('split')}
              label={messages.codeDiffView.splitLabel}
              ariaLabel={messages.codeDiffView.splitAria}
              Icon={ColumnsIcon}
            />
          </div>
        )}
        <TabsRoot defaultValue='diff' className='shrink-0'>
          <TabsList>
            <TabsTab value='diff'>{messages.codeDiffView.diffTab}</TabsTab>
            <TabsTab value='file' disabled>
              {messages.codeDiffView.fileTab}
            </TabsTab>
          </TabsList>
        </TabsRoot>
        <button
          type='button'
          onClick={close}
          aria-label={messages.codeDiffView.closeAria}
          className='flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40'
        >
          <XIcon className='size-3.5' />
        </button>
      </header>

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

/** One segment of the header's Unified/Split layout toggle (icon-only; label is the tooltip/aria). */
function LayoutButton({
  active,
  onClick,
  label,
  ariaLabel,
  Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  ariaLabel: string;
  Icon: Icon;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={label}
      className={cn(
        'flex size-5 items-center justify-center rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className='size-3.5' aria-hidden='true' />
    </button>
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
