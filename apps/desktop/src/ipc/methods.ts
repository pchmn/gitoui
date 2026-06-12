import * as desktopContract from '@gitoui/contracts/desktop';
import * as gitContract from '@gitoui/contracts/git';
import { GitClient } from '@gitoui/core/GitClient';
import { RepoWatcher } from '@gitoui/core/RepoWatcher';
import { Effect, Stream } from 'effect';
import { dialog } from 'electron';
import { CHANNELS } from './channels.ts';
import { makeIpcMethod, makeIpcSubscription } from './registry.ts';

/** Mount every IPC channel. Called once on app ready. */
export function registerIpc(): void {
  // --- window.git.* — backed by @gitoui/core ---
  makeIpcMethod(CHANNELS.git.resolveRepository, gitContract.resolveRepository, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.resolveRepository(payload.path)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.status, gitContract.status, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.status(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcSubscription(CHANNELS.git.watchStatus, gitContract.watchStatus, (payload) =>
    Stream.unwrap(
      RepoWatcher.pipe(
        Effect.map((watcher) => watcher.watchStatus(payload.repoPath)),
        Effect.provide(RepoWatcher.Default),
      ),
    ),
  );

  // --- window.desktop.* — backed directly by Electron APIs, never by core ---
  makeIpcMethod(CHANNELS.desktop.pickRepository, desktopContract.pickRepository, () =>
    Effect.promise(async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }),
  );
}
