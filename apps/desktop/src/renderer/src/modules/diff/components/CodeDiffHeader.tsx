import type { Change } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { TabsList, TabsRoot, TabsTab } from '@gitoui/ui/tabs';
import { XIcon } from '@phosphor-icons/react';
import {
  CHANGE_LETTER,
  CHANGE_LETTER_TONE,
} from '#renderer/modules/changes/components/changeGlyph';
import { FilePath } from '#renderer/shared/components/FilePath';
import { messages } from '#renderer/shared/messages/messages';

/**
 * The Code & Diff view's header (status glyph + path + `+N −N`, a `Diff | File` tab bar, ×). Lives
 * in the renderer's own DOM — NOT `@pierre/diffs`' `renderCustomHeader` — so it stays mounted across
 * the loading / error / binary states and the future `File` tab, none of which render a `FileDiff`.
 */
export function CodeDiffHeader({
  change,
  path,
  oldPath,
  showLayoutToggle,
  diffStyle,
  onDiffStyleChange,
  onClose,
}: {
  change: Pick<Change, 'kind' | 'additions' | 'deletions'> | undefined;
  path: string;
  oldPath: string | undefined;
  showLayoutToggle: boolean;
  diffStyle: 'unified' | 'split';
  onDiffStyleChange: (next: 'unified' | 'split') => void;
  onClose: () => void;
}) {
  const showAdditions = change?.additions !== undefined && change.additions > 0;
  const showDeletions = change?.deletions !== undefined && change.deletions > 0;

  return (
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
        path={path}
        oldPath={oldPath}
        title={oldPath !== undefined ? `${oldPath} → ${path}` : path}
        className='flex-1 text-sm'
      />
      {(showAdditions || showDeletions) && (
        <span className='flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums'>
          {showAdditions && <span className='text-git-added'>+{change?.additions}</span>}
          {showDeletions && <span className='text-git-deleted'>−{change?.deletions}</span>}
        </span>
      )}
      {showLayoutToggle && (
        <TabsRoot
          variant='segmented'
          value={diffStyle}
          onValueChange={(value) => onDiffStyleChange(value as 'unified' | 'split')}
          className='shrink-0'
        >
          <TabsList aria-label={messages.codeDiffView.layoutGroupAria}>
            <TabsTab
              value='unified'
              aria-label={messages.codeDiffView.unifiedAria}
              title={messages.codeDiffView.unifiedLabel}
              className='size-5 px-0'
            >
              <StackedDiffIcon className='size-4' isActive={diffStyle === 'unified'} />
            </TabsTab>
            <TabsTab
              value='split'
              aria-label={messages.codeDiffView.splitAria}
              title={messages.codeDiffView.splitLabel}
              className='size-5 px-0'
            >
              <SplitDiffIcon className='size-4' isActive={diffStyle === 'split'} />
            </TabsTab>
          </TabsList>
        </TabsRoot>
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
        onClick={onClose}
        aria-label={messages.codeDiffView.closeAria}
        className='flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40'
      >
        <XIcon className='size-3.5' />
      </button>
    </header>
  );
}

function SplitDiffIcon({ className, isActive }: { className?: string; isActive?: boolean }) {
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
        fill={isActive ? 'var(--git-added)' : 'currentColor'}
      />
      <path
        d='M66 15C67.1046 15 68 15.8954 68 17V125C68 126.105 67.1046 127 66 127H22C17.5817 127 14 123.418 14 119V23C14 18.5817 17.5817 15 22 15H66ZM26 68V74H56V68H26Z'
        fill={isActive ? 'var(--git-deleted)' : 'currentColor'}
        fill-opacity={isActive ? '0.5' : '0.2'}
      />
    </svg>
  );
}

function StackedDiffIcon({ className, isActive }: { className?: string; isActive?: boolean }) {
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
        fill={isActive ? 'var(--git-added)' : 'currentColor'}
      />
      <path
        d='M126.5 66.5C126.5 67.6046 125.605 68.5 124.5 68.5H16.5C15.3954 68.5 14.5 67.6046 14.5 66.5V22.5C14.5 18.0817 18.0817 14.5 22.5 14.5L118.5 14.5C122.918 14.5 126.5 18.0817 126.5 22.5V66.5ZM86 39H56V45H86V39Z'
        fill={isActive ? 'var(--git-deleted)' : 'currentColor'}
        fill-opacity={isActive ? '0.5' : '0.2'}
      />
    </svg>
  );
}
