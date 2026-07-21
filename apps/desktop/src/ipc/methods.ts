import * as desktopContract from '@gitoui/contracts/desktop';
import * as gitContract from '@gitoui/contracts/git';
import { GitClient } from '@gitoui/core/GitClient';
import { RepoWatcher } from '@gitoui/core/RepoWatcher';
import { Effect, Stream } from 'effect';
import { dialog } from 'electron';
import { RecentRepositoriesStore } from '../main/RecentRepositoriesStore.ts';
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

  makeIpcMethod(CHANNELS.git.listBranches, gitContract.listBranches, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.listBranches(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.switchBranch, gitContract.switchBranch, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.switchBranch(payload.repoPath, payload.branch)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.createBranch, gitContract.createBranch, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.createBranch(payload.repoPath, payload.name)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.stageFile, gitContract.stageFile, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.stageFile(payload.repoPath, payload.path)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.unstageFile, gitContract.unstageFile, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.unstageFile(payload.repoPath, payload.path)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.stageAll, gitContract.stageAll, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.stageAll(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.unstageAll, gitContract.unstageAll, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.unstageAll(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.commit, gitContract.commit, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.commit(payload.repoPath, payload.message)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.listRemotes, gitContract.listRemotes, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.listRemotes(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.listTags, gitContract.listTags, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.listTags(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.listStashes, gitContract.listStashes, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.listStashes(payload.repoPath)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.listCommits, gitContract.listCommits, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) =>
        git.listCommits(payload.repoPath, payload.skip, payload.limit, payload.scope),
      ),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.commitDetail, gitContract.commitDetail, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.commitDetail(payload.repoPath, payload.sha)),
      Effect.provide(GitClient.Default),
    ),
  );

  makeIpcMethod(CHANNELS.git.diff, gitContract.diff, (payload) =>
    GitClient.pipe(
      Effect.flatMap((git) => git.diff(payload.repoPath, payload.path, payload.source)),
      Effect.provide(GitClient.Default),
    ),
  );

  // --- window.desktop.* — backed directly by Electron APIs, never by core ---
  makeIpcMethod(CHANNELS.desktop.pickRepository, desktopContract.pickRepository, () =>
    Effect.promise(async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }),
  );

  makeIpcMethod(CHANNELS.desktop.recentRepositories, desktopContract.recentRepositories, () =>
    RecentRepositoriesStore.pipe(
      Effect.flatMap((store) => store.list()),
      Effect.provide(RecentRepositoriesStore.Default),
    ),
  );

  makeIpcMethod(
    CHANNELS.desktop.addRecentRepository,
    desktopContract.addRecentRepository,
    (payload) =>
      RecentRepositoriesStore.pipe(
        Effect.flatMap((store) => store.add(payload.path)),
        Effect.provide(RecentRepositoriesStore.Default),
      ),
  );

  makeIpcMethod(
    CHANNELS.desktop.removeRecentRepository,
    desktopContract.removeRecentRepository,
    (payload) =>
      RecentRepositoriesStore.pipe(
        Effect.flatMap((store) => store.remove(payload.path)),
        Effect.provide(RecentRepositoriesStore.Default),
      ),
  );
}
