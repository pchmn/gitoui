import { Button } from '@gitoui/ui/button';
import { FolderOpenIcon, GitBranchIcon } from '@phosphor-icons/react';
import { messages } from '#renderer/shared/messages/messages';
import { useOpenRepository } from '../hooks/useOpenRepository';

/** Calm, centered first-run state shown while no Repository is active. */
export function EmptyState() {
  const { openRepository, isOpening } = useOpenRepository();

  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 px-6 text-center'>
      <div className='flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground'>
        <GitBranchIcon className='size-6' />
      </div>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold tracking-tight text-foreground'>
          {messages.emptyState.title}
        </h1>
        <p className='max-w-sm text-sm text-muted-foreground'>{messages.emptyState.body}</p>
      </div>
      <Button onClick={openRepository} disabled={isOpening}>
        <FolderOpenIcon data-icon='inline-start' />
        {messages.emptyState.openCta}
      </Button>
    </div>
  );
}
