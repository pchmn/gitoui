import type { Schema } from 'effect';

/**
 * The renderer's typed view of the git contract, pulled in as **types only** (`typeof import` is a
 * type query — no runtime import, no `effect`/`Schema` in the bundle; ADR 0004). This is the SSOT
 * bridge that makes `matchError` exhaustive end-to-end: error unions are read off the contract, so
 * a new variant in `core`/contracts surfaces here as a compile error at every call site.
 */
type GitContracts = typeof import('@gitoui/contracts/git');

/** Method/subscription names of the git contract (drops the re-exported schemas + error classes). */
export type GitMethod = {
  [K in keyof GitContracts]: GitContracts[K] extends { readonly _tag: 'Method' | 'Subscription' }
    ? K
    : never;
}[keyof GitContracts];

/**
 * The plain tagged-error union a git method/subscription can reject with, **as it crosses IPC**:
 * the `Schema.TaggedError` is encoded to a plain object (`{ _tag, ...fields }`), so we take its
 * `Encoded` type, not the live instance. Feed it to `matchError<GitError<'resolveRepository'>>(…)`.
 */
export type GitError<K extends GitMethod> = GitContracts[K] extends {
  readonly error: infer E extends Schema.Schema.All;
}
  ? Schema.Schema.Encoded<E>
  : never;
