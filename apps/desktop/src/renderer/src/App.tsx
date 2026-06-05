import { Button } from '@gitoui/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TopBar } from './components/TopBar';

export function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null);

  // `queryFn` throws on Failure/Defect (Style A) → surfaces as `status.error`.
  const status = useQuery({
    queryKey: ['status', repoPath],
    queryFn: () => window.git.status({ repoPath: repoPath as string }),
    enabled: repoPath !== null,
  });

  console.log('status', status.data);

  async function openRepository() {
    const picked = await window.desktop.pickRepository();
    if (picked) setRepoPath(picked);
  }

  return (
    <div className='flex h-screen flex-col'>
      <TopBar />
      <main className='flex-1 space-y-4 overflow-auto p-6'>
        <h1 className='text-xl font-semibold'>gitoui</h1>
        <Button onClick={openRepository}>Open repository</Button>
        {repoPath && <p className='text-sm text-neutral-500'>{repoPath}</p>}
        {status.isError && <p className='text-sm text-red-600'>Failed to load status</p>}
        {status.data && (
          <p className='text-sm'>
            On branch <strong>{status.data.branch}</strong> · {status.data.entries.length} change(s)
          </p>
        )}
      </main>
    </div>
  );
}
