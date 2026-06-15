import { Button } from '@gitoui/ui/button';
import { FolderOpenIcon } from '@phosphor-icons/react';
import { useOpenRepository } from '../hooks/useOpenRepository';

/**
 * The content region for an active Repository. A quiet placeholder for now — the commit graph (the
 * protagonist) lands in a later tranche; until then this names the open Repository and keeps the
 * open flow reachable (the top-bar Repository selector arrives in #9).
 */
export function RepositoryView({ root }: { root: string }) {
  const { openRepository, isOpening } = useOpenRepository();
  const name = root.split(/[/\\]/).filter(Boolean).pop() ?? root;

  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 px-6 text-center'>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold tracking-tight text-foreground'>{name}</h1>
        <p className='max-w-md truncate text-sm text-muted-foreground' title={root}>
          {root}
        </p>
      </div>
      <Button variant='outline' onClick={openRepository} disabled={isOpening}>
        <FolderOpenIcon data-icon='inline-start' />
        Open another repository…
      </Button>
    </div>
  );
}
