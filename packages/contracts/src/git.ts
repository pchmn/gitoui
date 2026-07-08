import { Schema } from 'effect';
import { defineMethod, defineSubscription } from './define.ts';

// --- Typed errors (cross the IPC boundary as plain tagged objects) ---

export class RepoNotFoundError extends Schema.TaggedError<RepoNotFoundError>()(
  'RepoNotFoundError',
  {
    path: Schema.String,
  },
) {}

/** A branch creation was refused because a branch with that name already exists. */
export class BranchExistsError extends Schema.TaggedError<BranchExistsError>()(
  'BranchExistsError',
  {
    name: Schema.String,
  },
) {}

/** The provided branch name was rejected by git as invalid. */
export class InvalidBranchNameError extends Schema.TaggedError<InvalidBranchNameError>()(
  'InvalidBranchNameError',
  {
    name: Schema.String,
  },
) {}

/**
 * A branch switch was refused because local changes to one or more files would be overwritten.
 * `paths` lists every file that git refused to overwrite. Named for the *cause* — "conflict" is
 * reserved for merge conflicts (see CONTEXT.md).
 */
export class UncommittedChangesError extends Schema.TaggedError<UncommittedChangesError>()(
  'UncommittedChangesError',
  {
    paths: Schema.Array(Schema.String),
  },
) {}

/**
 * A picked path is not a usable Repository: not a git work tree, a bare repo, or the path is gone
 * (decision #5 — one typed error covers all "can't open this" cases). Raised by `resolveRepository`.
 */
export class NotARepositoryError extends Schema.TaggedError<NotARepositoryError>()(
  'NotARepositoryError',
  {
    path: Schema.String,
  },
) {}

// --- Domain schemas (minimal placeholders — real shapes come with the business logic) ---

export const ChangeKind = Schema.Literal('added', 'modified', 'deleted', 'renamed', 'untracked');
export type ChangeKind = typeof ChangeKind.Type;

/**
 * One axis's change detail. `kind` is always present; `additions`/`deletions` are the `git diff
 * --numstat` line counts, OMITTED (schema-optional) for binary files (numstat prints `- -`) and for
 * Untracked paths (which never appear in a numstat). The two axes of a `StatusEntry` carry their own
 * `StatusChange` — a staged-then-re-edited path has different stats on each axis.
 */
export const StatusChange = Schema.Struct({
  kind: ChangeKind,
  additions: Schema.optional(Schema.Number),
  deletions: Schema.optional(Schema.Number),
});
export type StatusChange = typeof StatusChange.Type;

/**
 * Two-axis model (see CONTEXT.md): a single path may be Staged AND Unstaged at once
 * (e.g. `git add a.txt` then edit `a.txt` again) — each axis carries its own `StatusChange`. NOT a
 * staged-xor-unstaged partition. `oldPath` is set only for renames (the pre-rename path; `path` is
 * always the current/new path).
 */
export const StatusEntry = Schema.Struct({
  path: Schema.String,
  oldPath: Schema.optional(Schema.String),
  staged: Schema.optional(StatusChange),
  unstaged: Schema.optional(StatusChange),
});
export type StatusEntry = typeof StatusEntry.Type;

export const Status = Schema.Struct({
  branch: Schema.String,
  ahead: Schema.Number,
  behind: Schema.Number,
  entries: Schema.Array(StatusEntry),
});
export type Status = typeof Status.Type;

export const RepoInput = Schema.Struct({ repoPath: Schema.String });
export type RepoInput = typeof RepoInput.Type;

/** Input for switching the active Branch. `RepoInput` has no `branch` field, so a new struct. */
export const SwitchBranchInput = Schema.Struct({
  repoPath: Schema.String,
  branch: Schema.String,
});
export type SwitchBranchInput = typeof SwitchBranchInput.Type;

/** Input for creating a new Branch from the current HEAD and switching onto it. */
export const CreateBranchInput = Schema.Struct({
  repoPath: Schema.String,
  name: Schema.String,
});
export type CreateBranchInput = typeof CreateBranchInput.Type;

/** A raw, user-picked folder path, before git has validated/canonicalized it. */
export const ResolveRepositoryInput = Schema.Struct({ path: Schema.String });
export type ResolveRepositoryInput = typeof ResolveRepositoryInput.Type;

/** The canonical work-tree root (`git rev-parse --show-toplevel`) — the Repository's identity. */
export const ResolvedRepository = Schema.Struct({ root: Schema.String });
export type ResolvedRepository = typeof ResolvedRepository.Type;

export const Branch = Schema.Struct({
  name: Schema.String,
  isCurrent: Schema.Boolean,
  upstream: Schema.optional(Schema.String),
  ahead: Schema.Number,
  behind: Schema.Number,
});

/** A remote-tracking branch. `name` is WITHOUT the remote prefix (`main`, not `origin/main`). */
export const RemoteTrackingBranch = Schema.Struct({ name: Schema.String });
export type RemoteTrackingBranch = typeof RemoteTrackingBranch.Type;

/** A remote connection (e.g. `origin`) with its fetched remote-tracking branches. */
export const Remote = Schema.Struct({
  name: Schema.String,
  branches: Schema.Array(RemoteTrackingBranch),
});
export type Remote = typeof Remote.Type;

/** The result of `listRemotes`: all configured remotes with their remote-tracking branches. */
export const RemoteList = Schema.Struct({ remotes: Schema.Array(Remote) });
export type RemoteList = typeof RemoteList.Type;
export type Branch = typeof Branch.Type;

/** Where HEAD points: a local Branch, or a bare Commit (Detached HEAD). */
export const Head = Schema.Union(
  Schema.TaggedStruct('OnBranch', { branch: Schema.String }),
  Schema.TaggedStruct('Detached', { sha: Schema.String }),
);
export type Head = typeof Head.Type;

export const BranchList = Schema.Struct({
  branches: Schema.Array(Branch),
  head: Head,
});
export type BranchList = typeof BranchList.Type;

export const Tag = Schema.Struct({ name: Schema.String });
export type Tag = typeof Tag.Type;

export const TagList = Schema.Struct({ tags: Schema.Array(Tag) });
export type TagList = typeof TagList.Type;

export const Stash = Schema.Struct({
  id: Schema.String, // 'stash@{0}'
  message: Schema.String,
  branch: Schema.optional(Schema.String), // originating branch, if parseable
});
export type Stash = typeof Stash.Type;

export const StashList = Schema.Struct({ stashes: Schema.Array(Stash) });
export type StashList = typeof StashList.Type;

/** Any named pointer attached to a Commit — local Branch, remote-tracking Branch, Tag, or the Detached-HEAD marker. */
export const Ref = Schema.Union(
  Schema.TaggedStruct('Branch', { name: Schema.String, current: Schema.Boolean }),
  Schema.TaggedStruct('RemoteBranch', { name: Schema.String }),
  Schema.TaggedStruct('Tag', { name: Schema.String }),
  Schema.TaggedStruct('Head', {}),
);
export type Ref = typeof Ref.Type;

/** A recorded snapshot in history (see CONTEXT.md — "Commit", not "revision"/"changeset"). */
export const Commit = Schema.Struct({
  sha: Schema.String,
  /** Parent SHAs. `[]` for a root commit; `length >= 2` signals a merge commit. */
  parents: Schema.Array(Schema.String),
  author: Schema.Struct({ name: Schema.String, email: Schema.String }),
  committer: Schema.Struct({ name: Schema.String, email: Schema.String }),
  /** Epoch MS. */
  authoredAt: Schema.Number,
  /** Epoch MS. */
  committedAt: Schema.Number,
  subject: Schema.String,
  body: Schema.String,
  /** Refs sitting on this Commit, parsed from the `git log --decorate=full` `%D` decoration. */
  refs: Schema.Array(Ref),
});
export type Commit = typeof Commit.Type;

/** Input for `listCommits`. `RepoInput` has no `skip`/`limit` fields, so a new struct. */
export const ListCommitsInput = Schema.Struct({
  repoPath: Schema.String,
  skip: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number),
  /**
   * Which Refs to walk. Absent or `'head'` — today's behavior, HEAD only, date order. `'allRefs'`
   * — `HEAD --branches --remotes --tags`, `--topo-order` (ADR 0007). A closed literal, not a
   * free-form ref list — the renderer never constructs raw git rev arguments.
   */
  scope: Schema.optional(Schema.Literal('head', 'allRefs')),
});
export type ListCommitsInput = typeof ListCommitsInput.Type;

// --- Contracts (window.git.*) ---

export const status = defineMethod({
  payload: RepoInput,
  success: Status,
  error: RepoNotFoundError,
});

/**
 * Validate + canonicalize a picked path in one `--show-toplevel` (decision #5). A path inside a
 * Repository resolves to its work-tree root; a non-repo / bare repo / gone path fails with a single
 * `NotARepositoryError`.
 */
export const resolveRepository = defineMethod({
  payload: ResolveRepositoryInput,
  success: ResolvedRepository,
  error: NotARepositoryError,
});

/** Live status: the watcher pushes a fresh `Status` snapshot on each fs change. */
export const watchStatus = defineSubscription({
  payload: RepoInput,
  item: Status,
  error: RepoNotFoundError,
});

/** List all local Branches with their ahead/behind counts and the current HEAD state. */
export const listBranches = defineMethod({
  payload: RepoInput,
  success: BranchList,
  error: RepoNotFoundError,
});

/**
 * Switch HEAD to a local Branch. Fails with `UncommittedChangesError` when git refuses to overwrite
 * local changes; any other failure maps to `RepoNotFoundError`. Switching to the current Branch is a
 * harmless no-op (git exits 0).
 */
export const switchBranch = defineMethod({
  payload: SwitchBranchInput,
  success: Schema.Void,
  error: Schema.Union(RepoNotFoundError, UncommittedChangesError),
});

/**
 * Create a new Branch from the current HEAD and switch onto it in one step
 * (`git checkout -b <name>`). Fails with `BranchExistsError` when a branch with that name already
 * exists, `InvalidBranchNameError` when git rejects the name, and `RepoNotFoundError` for any
 * other failure. Name validity is delegated to git — no hand-rolled regex (decision #4).
 */
export const createBranch = defineMethod({
  payload: CreateBranchInput,
  success: Schema.Void,
  error: Schema.Union(RepoNotFoundError, BranchExistsError, InvalidBranchNameError),
});

/**
 * List all configured remotes with their remote-tracking branches. Remote-tracking branch names
 * are stored WITHOUT the remote prefix (`main`, not `origin/main`) — already grouped under
 * their remote. `origin/HEAD` symbolic refs are excluded. A remote with zero fetched branches
 * still appears with an empty `branches` array.
 */
export const listRemotes = defineMethod({
  payload: RepoInput,
  success: RemoteList,
  error: RepoNotFoundError,
});

/** List all tags, newest version first (`--sort=-v:refname`). No annotated/lightweight distinction. */
export const listTags = defineMethod({
  payload: RepoInput,
  success: TagList,
  error: RepoNotFoundError,
});

/** List all stashes, `stash@{0}` first. Empty stack returns `{ stashes: [] }`. */
export const listStashes = defineMethod({
  payload: RepoInput,
  success: StashList,
  error: RepoNotFoundError,
});

/**
 * Walk the current Branch's history (HEAD), newest first, honoring `skip`/`limit` (default
 * `skip: 0`, `limit: 300`). An empty Repository (unborn HEAD) returns `[]`, not an error. Each
 * Commit carries the Refs sitting on it (`--decorate=full`). Named `listCommits`, never
 * `getLog` — "log" is git plumbing kept out of the domain (see CONTEXT.md).
 */
export const listCommits = defineMethod({
  payload: ListCommitsInput,
  success: Schema.Array(Commit),
  error: RepoNotFoundError,
});
