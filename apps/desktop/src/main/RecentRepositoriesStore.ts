import type { RecentRepository } from '@gitoui/contracts/desktop';
import { Effect } from 'effect';
import Store from 'electron-store';
import { parseRecents, touchRecent } from './recents.ts';

type RecentsBlob = { recentRepositories: readonly RecentRepository[] };

/**
 * Persistence for the recents list — a shell capability, so it lives in `main` (not `core`, which
 * stays Electron-free) and is backed by a single `electron-store` keyed `recentRepositories` (epic
 * decision #4). The Effect machinery + Schema validation stop here, at the IPC boundary.
 *
 * Built with `sync` so the store is constructed when the layer is provided (after `app` is ready),
 * never at module load. Each operation reads the blob fresh through `parseRecents`, so the on-disk
 * file is the source of truth and a corrupt blob degrades to an empty list.
 */
export class RecentRepositoriesStore extends Effect.Service<RecentRepositoriesStore>()(
  '@gitoui/desktop/RecentRepositoriesStore',
  {
    sync: () => {
      const store = new Store<RecentsBlob>({ name: 'recent-repositories' });
      const read = (): readonly RecentRepository[] =>
        parseRecents(store.get('recentRepositories', []));

      return {
        /** Current recents, MRU-ordered. */
        list: (): Effect.Effect<readonly RecentRepository[]> => Effect.sync(read),

        /** Upsert by canonical path, stamp `lastOpenedAt`, persist, return the new MRU list. */
        add: (path: string): Effect.Effect<readonly RecentRepository[]> =>
          Effect.sync(() => {
            const next = touchRecent(read(), path, Date.now());
            store.set('recentRepositories', next);
            return next;
          }),
      };
    },
  },
) {}
