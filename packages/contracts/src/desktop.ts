import { Schema } from 'effect';
import { defineMethod } from './define.ts';

// --- Contracts (window.desktop.*) — shell/app capabilities, backed by Electron APIs in `main`,
//     never by `@gitoui/core`. ---

/** Open the OS folder picker; resolves to the chosen Repository path, or null if cancelled. */
export const pickRepository = defineMethod({
  payload: Schema.Void,
  success: Schema.NullOr(Schema.String),
  error: Schema.Never,
});

// --- Recent Repositories (persisted in `main` via electron-store; epic decisions #3, #4, #6) ---

/**
 * A persisted Repository the user has opened. `path` is the canonical work-tree root (the identity
 * from `resolveRepository`); `lastOpenedAt` is an epoch-ms stamp the renderer never sets — `main` is
 * the authority for it (decision #6). Name / avatar / MRU order are all derived from these two
 * fields. This same schema validates the persisted blob at rest (decision #4): corrupt or
 * outdated entries that don't decode are dropped.
 */
export const RecentRepository = Schema.Struct({
  path: Schema.String,
  lastOpenedAt: Schema.Number,
});
export type RecentRepository = typeof RecentRepository.Type;

/** The recents list, most-recently-used first. */
export const RecentRepositories = Schema.Array(RecentRepository);
export type RecentRepositories = typeof RecentRepositories.Type;

/** Upsert payload: only the canonical path — `main` stamps `lastOpenedAt`. */
export const AddRecentRepositoryInput = Schema.Struct({ path: Schema.String });
export type AddRecentRepositoryInput = typeof AddRecentRepositoryInput.Type;

/** Removal payload: the canonical path of the entry to drop. */
export const RemoveRecentRepositoryInput = Schema.Struct({ path: Schema.String });
export type RemoveRecentRepositoryInput = typeof RemoveRecentRepositoryInput.Type;

/** Read the persisted recents in MRU order. No git is spawned — these are plain stored entries. */
export const recentRepositories = defineMethod({
  payload: Schema.Void,
  success: RecentRepositories,
  error: Schema.Never,
});

/**
 * Upsert by canonical path + bump `lastOpenedAt` (stamped by `main`), then return the updated MRU
 * list so the renderer can set its query data without a refetch (decision #6).
 */
export const addRecentRepository = defineMethod({
  payload: AddRecentRepositoryInput,
  success: RecentRepositories,
  error: Schema.Never,
});

/**
 * Manually drop a recent by canonical path, returning the updated MRU list so the renderer can set
 * its query data without a refetch (decision #6). The ONLY way an entry leaves the list: a failed
 * resolve never evicts (decision #7), since an unmounted drive / network mount may come back.
 */
export const removeRecentRepository = defineMethod({
  payload: RemoveRecentRepositoryInput,
  success: RecentRepositories,
  error: Schema.Never,
});
