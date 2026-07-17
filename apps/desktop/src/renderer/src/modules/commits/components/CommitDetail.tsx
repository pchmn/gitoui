import type { CommitDetail as CommitDetailData } from '@gitoui/contracts/git';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { ChangeRow } from '#renderer/modules/changes/components/ChangeRow';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import { formatRelativeTime } from '#renderer/shared/utils/relativeTime';
import { useCommitDetail } from '../hooks/useCommitDetail';
import { AuthorAvatar } from './AuthorAvatar';

/** How long the copy button shows its "Copied" confirmation before reverting. */
const COPY_CONFIRM_MS = 1500;

/**
 * The Inspector's Commit-detail mode (issue #65; the routing seam shipped in #66): a read-only
 * rendering of one selected Commit — its metadata (SHA, author, date, full message) and the
 * Changes it introduced, reusing `ChangeRow` in its read-only variant (no `onToggle` — no staging
 * affordance, per CONTEXT.md's Commit-detail glossary entry). Rows are inert in this slice; the
 * Code & Diff slice makes them open the commit-source diff.
 *
 * The short SHA header renders immediately (independent of the query) so it's visible even while
 * the detail loads or if it fails — mirrors the header staying put across `ChangesPanel`'s own
 * loading/error/data states.
 */
export function CommitDetail({ sha }: { sha: string }) {
  const { root } = useActiveRepository();
  const { data, isLoading, isError, error, refetch } = useCommitDetail(root, sha);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_CONFIRM_MS);
    });
  }

  return (
    <div className='flex h-full flex-col' data-slot='commit-detail'>
      <div className='flex shrink-0 items-center gap-2 border-b border-border px-3 py-2'>
        <span className='text-xs font-bold text-foreground'>{messages.commitDetail.heading}</span>
        <button
          type='button'
          onClick={handleCopy}
          title={sha}
          aria-label={messages.commitDetail.copyShaAria}
          className='flex items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-[0.625rem] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40'
        >
          {sha.slice(0, 7)}
          {copied ? (
            <CheckIcon className='size-3' weight='bold' />
          ) : (
            <CopyIcon className='size-3' />
          )}
        </button>
      </div>

      {isLoading && <CommitDetailSkeleton />}

      {isError && (
        <div className='flex flex-1 flex-col items-center justify-center gap-2 px-3 py-2 text-center'>
          <p className='text-xs text-muted-foreground' role='alert'>
            {matchError<GitError<'commitDetail'>, string>(error, {
              RepoNotFoundError: (e) => messages.commitDetail.repoNotFound(e.path),
              _: () => messages.commitDetail.failedToLoad,
            })}
          </p>
          <button
            type='button'
            onClick={() => refetch()}
            className='rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-muted'
          >
            {messages.commitDetail.retry}
          </button>
        </div>
      )}

      {data && <CommitDetailBody data={data} />}
    </div>
  );
}

/**
 * The loaded body: author + relative date, the message (split back into subject/body — the
 * contract joins them with a blank line, git-convention), then the Changes list.
 */
function CommitDetailBody({ data }: { data: CommitDetailData }) {
  const newline = data.message.indexOf('\n');
  const subject = newline === -1 ? data.message : data.message.slice(0, newline);
  const body = newline === -1 ? '' : data.message.slice(newline).trimStart();

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex shrink-0 flex-col gap-2 px-3 py-2'>
        <div className='flex items-center gap-2'>
          <AuthorAvatar name={data.author.name} email={data.author.email} />
          <span className='min-w-0 flex-1 truncate text-xs font-medium text-foreground'>
            {data.author.name}
          </span>
          <span className='shrink-0 text-xs text-muted-foreground'>
            {formatRelativeTime(data.date)}
          </span>
        </div>
        <p className='text-xs font-medium text-foreground'>{subject}</p>
        {/* Long messages are capped so the Changes list stays reachable without a long scroll. */}
        {body.length > 0 && (
          <p className='max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground'>
            {body}
          </p>
        )}
      </div>
      <div className='flex h-8 shrink-0 items-center bg-muted px-3 text-xs font-semibold text-muted-foreground'>
        <span>{messages.commitDetail.changesHeading}</span>
        <span className='ml-1.5 rounded-sm bg-background px-1 py-0.5 font-mono text-[0.625rem] leading-none tabular-nums'>
          {data.changes.length}
        </span>
      </div>
      <div
        role='listbox'
        aria-label={messages.commitDetail.changesHeading}
        className='flex min-h-0 flex-1 flex-col overflow-y-auto py-1'
      >
        {data.changes.map((change) => (
          <ChangeRow key={change.path} path={change.path} change={change} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton shown while the Commit detail loads (no spinner — matches `ChangesPanel`'s convention). */
function CommitDetailSkeleton() {
  return (
    <div className='flex flex-1 flex-col gap-2 px-3 py-2'>
      <div className='h-3 w-1/3 animate-pulse rounded-sm bg-muted' />
      <div className='h-3 w-2/3 animate-pulse rounded-sm bg-muted' />
      <ul className='mt-2 flex flex-col gap-1' aria-busy='true' aria-label='Loading commit detail'>
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className='flex h-6 items-center'>
            <span
              className='h-3 animate-pulse rounded-sm bg-muted'
              style={{ width: `${50 + (i % 3) * 20}%` }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
