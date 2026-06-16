import type {
  AddRecentRepositoryInput,
  RecentRepository,
  RemoveRecentRepositoryInput,
} from '@gitoui/contracts/desktop';
import type {
  BranchList,
  RepoInput,
  ResolvedRepository,
  ResolveRepositoryInput,
  Status,
  SwitchBranchInput,
} from '@gitoui/contracts/git';
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '#ipc/channels';

// Unwrap the 3-case envelope: return the value on Success, THROW the typed error on Failure/Defect
// (Style A — idiomatic for TanStack Query/DB; the renderer narrows by `_tag`).
async function invoke(channel: string, payload?: unknown): Promise<unknown> {
  const res = (await ipcRenderer.invoke(channel, payload)) as
    | { _tag: 'Success'; value: unknown }
    | { _tag: 'Failure'; error: unknown }
    | { _tag: 'Defect'; defect: { message: string } };
  if (res._tag === 'Success') return res.value;
  if (res._tag === 'Failure') throw res.error;
  throw new Error(`[gitoui] ${res.defect.message}`);
}

function subscribe(channel: string, payload: unknown, onEvent: (msg: unknown) => void): () => void {
  const id = crypto.randomUUID();
  const handler = (_event: unknown, msg: unknown) => onEvent(msg);
  ipcRenderer.on(`${channel}:${id}`, handler);
  ipcRenderer.send(`${channel}:subscribe`, { id, payload });
  return () => {
    ipcRenderer.send(`${channel}:unsubscribe`, { id });
    ipcRenderer.removeListener(`${channel}:${id}`, handler);
  };
}

const git = {
  resolveRepository: (input: ResolveRepositoryInput): Promise<ResolvedRepository> =>
    invoke(CHANNELS.git.resolveRepository, input) as Promise<ResolvedRepository>,
  status: (input: RepoInput): Promise<Status> =>
    invoke(CHANNELS.git.status, input) as Promise<Status>,
  watchStatus: (input: RepoInput, onEvent: (msg: unknown) => void): (() => void) =>
    subscribe(CHANNELS.git.watchStatus, input, onEvent),
  listBranches: (input: RepoInput): Promise<BranchList> =>
    invoke(CHANNELS.git.listBranches, input) as Promise<BranchList>,
  switchBranch: (input: SwitchBranchInput): Promise<void> =>
    invoke(CHANNELS.git.switchBranch, input) as Promise<void>,
};

const desktop = {
  // Static shell info, known at preload load — exposed as a plain value, not an IPC method.
  // The renderer uses it to reserve space for the macOS traffic lights in its topbar.
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  pickRepository: (): Promise<string | null> =>
    invoke(CHANNELS.desktop.pickRepository) as Promise<string | null>,
  recentRepositories: (): Promise<readonly RecentRepository[]> =>
    invoke(CHANNELS.desktop.recentRepositories) as Promise<readonly RecentRepository[]>,
  addRecentRepository: (input: AddRecentRepositoryInput): Promise<readonly RecentRepository[]> =>
    invoke(CHANNELS.desktop.addRecentRepository, input) as Promise<readonly RecentRepository[]>,
  removeRecentRepository: (
    input: RemoveRecentRepositoryInput,
  ): Promise<readonly RecentRepository[]> =>
    invoke(CHANNELS.desktop.removeRecentRepository, input) as Promise<readonly RecentRepository[]>,
};

contextBridge.exposeInMainWorld('git', git);
contextBridge.exposeInMainWorld('desktop', desktop);

export type GitBridge = typeof git;
export type DesktopBridge = typeof desktop;
