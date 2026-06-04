import { Schema } from 'effect';
import { defineMethod, defineSubscription } from './define.ts';

// --- Typed errors (cross the IPC boundary as plain tagged objects) ---

export class RepoNotFoundError extends Schema.TaggedError<RepoNotFoundError>()(
  'RepoNotFoundError',
  {
    path: Schema.String,
  },
) {}

// --- Domain schemas (minimal placeholders — real shapes come with the business logic) ---

export const ChangeKind = Schema.Literal('added', 'modified', 'deleted', 'renamed', 'untracked');
export type ChangeKind = typeof ChangeKind.Type;

/**
 * Two-axis model (see CONTEXT.md): a single path may be Staged AND Unstaged at once
 * (e.g. `git add a.txt` then edit `a.txt` again). NOT a staged-xor-unstaged partition.
 */
export const StatusEntry = Schema.Struct({
  path: Schema.String,
  staged: Schema.optional(ChangeKind),
  unstaged: Schema.optional(ChangeKind),
});

export const Status = Schema.Struct({
  branch: Schema.String,
  ahead: Schema.Number,
  behind: Schema.Number,
  entries: Schema.Array(StatusEntry),
});
export type Status = typeof Status.Type;

export const RepoInput = Schema.Struct({ repoPath: Schema.String });
export type RepoInput = typeof RepoInput.Type;

// --- Contracts (window.git.*) ---

export const status = defineMethod({
  payload: RepoInput,
  success: Status,
  error: RepoNotFoundError,
});

/** Live status: the watcher pushes a fresh `Status` snapshot on each fs change. */
export const watchStatus = defineSubscription({
  payload: RepoInput,
  item: Status,
  error: RepoNotFoundError,
});
