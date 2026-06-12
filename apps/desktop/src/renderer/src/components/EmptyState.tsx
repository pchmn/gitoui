import { Button } from '@gitoui/ui/button';
import { FolderOpen, GitBranch } from '@phosphor-icons/react';
import { useOpenRepository } from '../hooks/use-open-repository';

/** Calm, centered first-run state shown while no Repository is active. */
export function EmptyState() {
  const { openRepository, isOpening } = useOpenRepository();

  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 px-6 text-center'>
      <div className='flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground'>
        <GitBranch className='size-6' />
      </div>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold tracking-tight text-foreground'>No repository open</h1>
        <p className='max-w-sm text-sm text-muted-foreground'>
          Open a local git repository to see its branch, status, and history.
        </p>
      </div>
      <Button onClick={openRepository} disabled={isOpening}>
        <FolderOpen data-icon='inline-start' />
        Open repository…
      </Button>
    </div>
  );
}
