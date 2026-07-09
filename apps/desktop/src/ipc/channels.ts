/**
 * IPC channel names — the single source of truth for the wire keys shared by the registration
 * side (`ipc/methods.ts`) and the invocation side (`preload/index.ts`).
 *
 * Plain data on purpose, NOT an Effect `Schema` (ADR-0004): the preload stays Schema-free at
 * runtime, so the only artifact both sides can share is a const map of strings. A runtime `Schema`
 * here would pull `effect` into the preload bundle and block the planned `sandbox: true` hardening.
 * The `git:` / `desktop:` grouping mirrors the `window.git.*` / `window.desktop.*` bridge surface.
 */
export const CHANNELS = {
  git: {
    resolveRepository: 'git:resolveRepository',
    status: 'git:status',
    watchStatus: 'git:watchStatus',
    listBranches: 'git:listBranches',
    switchBranch: 'git:switchBranch',
    createBranch: 'git:createBranch',
    stageFile: 'git:stageFile',
    unstageFile: 'git:unstageFile',
    stageAll: 'git:stageAll',
    unstageAll: 'git:unstageAll',
    listRemotes: 'git:listRemotes',
    listTags: 'git:listTags',
    listStashes: 'git:listStashes',
    listCommits: 'git:listCommits',
  },
  desktop: {
    pickRepository: 'desktop:pickRepository',
    recentRepositories: 'desktop:recentRepositories',
    addRecentRepository: 'desktop:addRecentRepository',
    removeRecentRepository: 'desktop:removeRecentRepository',
  },
} as const;
