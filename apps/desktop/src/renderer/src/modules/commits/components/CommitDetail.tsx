import { messages } from '#renderer/shared/messages/messages';

/**
 * The Inspector's Commit-detail mode (issue #66): shown when the graph selection is a Commit
 * (`kind: 'commit'`), replacing the Changes/Tree tabs. This slice ships only the routing seam and a
 * minimal header (the short SHA) — the full detail body (subject, author, message, changed files,
 * diff) lands in its own slice (#58's tranche ⑧+).
 */
export function CommitDetail({ sha }: { sha: string }) {
  return (
    <div className='flex h-full flex-col gap-1 px-3 py-2' data-slot='commit-detail'>
      <div className='flex items-baseline gap-2'>
        <span className='text-xs font-bold text-foreground'>{messages.commitDetail.heading}</span>
        <span className='font-mono text-[0.625rem] text-muted-foreground'>{sha.slice(0, 7)}</span>
      </div>
      <p className='text-xs text-muted-foreground'>{messages.commitDetail.placeholder}</p>
    </div>
  );
}
