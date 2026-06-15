import { cn } from '@gitoui/ui/lib/utils';
import { BranchSelector } from '#renderer/modules/branches/components/BranchSelector';
import { RepoSelector } from '#renderer/modules/repository/components/RepoSelector';

// macOS overlays the native traffic lights on the top-left; reserve room for them so our
// buttons don't sit underneath. On Windows/Linux the native controls sit on the right instead.
const isMac = window.desktop?.platform === 'darwin';

export function TopBar() {
  return (
    <header
      className={cn(
        'drag-region flex h-11 shrink-0 items-center gap-0.5 border-b border-border bg-background px-2',
        isMac && 'pl-20',
      )}
    >
      <RepoSelector />
      <BranchSelector />
    </header>
  );
}
