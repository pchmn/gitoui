import { cn } from '@gitoui/ui/lib/utils';
import { TabsList, TabsRoot, TabsTab } from '@gitoui/ui/tabs';
import { XIcon } from '@phosphor-icons/react';
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
          <span className='flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums'>
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
              Icon={StackedDiffIcon}
            />
            <LayoutButton
              active={diffStyle === 'split'}
              onClick={() => chooseDiffStyle('split')}
              label={messages.codeDiffView.splitLabel}
              ariaLabel={messages.codeDiffView.splitAria}
              Icon={SplitDiffIcon}
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
  Icon: React.ComponentType<{ className?: string }>;
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
      <Icon className='size-4' aria-hidden='true' />
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

function SplitDiffIcon({ className }: { className?: string }) {
  return (
    <svg
      width='141'
      height='141'
      viewBox='0 0 141 141'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
    >
      <title>SplitDiffIcon</title>
      <path
        d='M119 15C123.418 15 127 18.5817 127 23V119C127 123.418 123.418 127 119 127H75C73.8954 127 73 126.105 73 125V17C73 15.8954 73.8954 15 75 15H119ZM97 56V68H85V74H97V86H103V74H115V68H103V56H97Z'
        fill='currentColor'
      />
      <path
        d='M66 15C67.1046 15 68 15.8954 68 17V125C68 126.105 67.1046 127 66 127H22C17.5817 127 14 123.418 14 119V23C14 18.5817 17.5817 15 22 15H66ZM26 68V74H56V68H26Z'
        fill='currentColor'
        fill-opacity='0.2'
      />
    </svg>
  );
}

function StackedDiffIcon({ className }: { className?: string }) {
  return (
    <svg
      width='141'
      height='141'
      viewBox='0 0 141 141'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
    >
      <title>StackedDiffIcon</title>
      <path
        d='M126.5 119.5C126.5 123.918 122.918 127.5 118.5 127.5H22.5C18.0817 127.5 14.5 123.918 14.5 119.5V75.5C14.5 74.3954 15.3954 73.5 16.5 73.5H124.5C125.605 73.5 126.5 74.3954 126.5 75.5V119.5ZM86 97H74V85H68V97H56V103H68V115H74V103H86V97Z'
        fill='currentColor'
      />
      <path
        d='M126.5 66.5C126.5 67.6046 125.605 68.5 124.5 68.5H16.5C15.3954 68.5 14.5 67.6046 14.5 66.5V22.5C14.5 18.0817 18.0817 14.5 22.5 14.5L118.5 14.5C122.918 14.5 126.5 18.0817 126.5 22.5V66.5ZM86 39H56V45H86V39Z'
        fill='currentColor'
        fill-opacity='0.2'
      />
    </svg>
  );
}
