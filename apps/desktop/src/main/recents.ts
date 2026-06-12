import { RecentRepositories, type RecentRepository } from '@gitoui/contracts/desktop';
import { Effect, Schema } from 'effect';

/**
 * Pure recents logic — kept free of `electron-store` and Electron so the validation + MRU rules are
 * unit-testable in isolation. `RecentRepositoriesStore` wires these to the persisted blob.
 *
 * The contract's Effect Schema is the SSOT for the on-disk shape (epic decision #4); we reuse it
 * here to validate the blob at rest.
 */

const decodeList = Schema.decodeUnknownEither(RecentRepositories);

const byMostRecent = (a: RecentRepository, b: RecentRepository): number =>
  b.lastOpenedAt - a.lastOpenedAt;

/**
 * Validate the persisted blob at rest and return it in MRU order. A blob that doesn't decode (a
 * shape change, manual edit, or partial write) is dropped wholesale to an empty list rather than
 * crashing the read — recents are disposable, never load-bearing.
 */
export function parseRecents(raw: unknown): readonly RecentRepository[] {
  return decodeList(raw).pipe(
    Effect.map((list) => [...list].sort(byMostRecent)),
    Effect.orElseSucceed(() => [] as readonly RecentRepository[]),
    Effect.runSync,
  );
}

/**
 * Upsert by canonical path and stamp `lastOpenedAt = now`, returning the new MRU-ordered list.
 * The path is already the canonical work-tree root (from `resolveRepository`), so an exact-string
 * match is the identity; the touched entry moves to the front.
 */
export function touchRecent(
  list: readonly RecentRepository[],
  path: string,
  now: number,
): readonly RecentRepository[] {
  const others = list.filter((entry) => entry.path !== path);
  return [{ path, lastOpenedAt: now }, ...others].sort(byMostRecent);
}
