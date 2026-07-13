import { Button } from '@gitoui/ui/button';
import { Input } from '@gitoui/ui/input';
import { cn } from '@gitoui/ui/lib/utils';
import { Textarea } from '@gitoui/ui/textarea';
import type { KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import { messages } from '#renderer/shared/messages/messages';
import { useCommit } from '../hooks/useCommit';

/** Conventional hard-wrap width for a Commit subject — the countdown's budget (GitKraken uses it too). */
const SUMMARY_BUDGET = 72;

/**
 * The commit composer (issue #63; summary/description split follow-up) — GitKraken-style, two
 * fields in ONE quiet field group: a single-line **Commit message** (the subject — Body size,
 * regular weight, it's what the graph shows) and an optional multi-line **Description** (the body)
 * one type step smaller (Label size), so the subject leads by size alone. They join as git's native
 * message shape — subject, blank line, body — and cross the IPC boundary verbatim as one string,
 * so `useCommit` and the contract stay untouched. The GROUP owns the chrome (the InputGroup
 * convention): borderless ghost fields inside, the wrapper carrying the resting `bg-input/10` fill
 * and the focus hairline + ring via `focus-within`.
 *
 * A Micro mono **countdown** (72 − summary length, the conventional subject wrap) sits at the end
 * of the summary row once you type, dropping to the destructive tint when overspent — guidance,
 * never a hard stop. `Enter` in the summary walks into the description (a subject is one line by
 * construction — the input can't hold a newline); `Cmd+Enter` commits from either field.
 *
 * `ChangesPanel` pins this as a `shrink-0` footer below the scrolling Staged/Unstaged lists (its
 * own `border-t` is the seam). Submit needs a non-blank summary, a non-empty Staged set, and no
 * commit in flight — a description alone never enables it. On success both fields clear; on error
 * they survive for retry (`useCommit` owns invalidation + the error Toast). The mockup's amend
 * affordance is out of this epic's scope — not built.
 */
export function CommitComposer({ stagedCount }: { stagedCount: number }) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const commit = useCommit();

  const canSubmit = summary.trim().length > 0 && stagedCount > 0 && !commit.isPending;
  const remaining = SUMMARY_BUDGET - summary.length;

  function submit() {
    if (!canSubmit) return;
    const subject = summary.trim();
    const body = description.trim();
    const message = body === '' ? subject : `${subject}\n\n${body}`;
    commit.mutate(message, {
      onSuccess: () => {
        setSummary('');
        setDescription('');
      },
    });
  }

  function handleSummaryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.metaKey) {
      submit();
    } else {
      // A bare Enter flows into the body — the subject stays one line by construction.
      descriptionRef.current?.focus();
    }
  }

  function handleDescriptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className='flex shrink-0 flex-col gap-2 border-t border-border p-3'>
      <div className='flex flex-col rounded-md border border-transparent bg-input/10 transition-colors focus-within:border-ring focus-within:bg-input/20 focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/15 dark:focus-within:bg-input/25'>
        <div className='flex items-center'>
          <Input
            variant='ghost'
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={handleSummaryKeyDown}
            placeholder={messages.changesPanel.summaryPlaceholder}
            aria-label={messages.changesPanel.summaryPlaceholder}
            className='h-8 flex-1 pt-2 md:text-sm'
          />
          {summary.length > 0 && (
            <span
              aria-hidden='true'
              className={cn(
                'shrink-0 pt-2 pr-2 font-mono text-[0.625rem] leading-none tabular-nums',
                remaining < 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {remaining}
            </span>
          )}
        </div>
        <Textarea
          ref={descriptionRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleDescriptionKeyDown}
          placeholder={messages.changesPanel.descriptionPlaceholder}
          aria-label={messages.changesPanel.descriptionPlaceholder}
          className='min-h-20 border-transparent bg-transparent pt-1 text-xs/relaxed focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent'
        />
      </div>
      <Button onClick={submit} disabled={!canSubmit}>
        {messages.changesPanel.commitButton(stagedCount)}
      </Button>
    </div>
  );
}
