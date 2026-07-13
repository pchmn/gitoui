/**
 * Central UI copy catalog — English-only, zero-dependency, zero-runtime (ADR 0005).
 *
 * Namespaced by feature. Static text is a string literal; interpolation is a typed function;
 * counts pass the raw `number` (never a pre-formatted string) so they stay plural-ready.
 * Error copy is hybrid: `errors.byTag.*` are shared canonical defaults; per-action sub-objects
 * carry optional overrides, resolved inside the existing `matchError` arms (no new resolver,
 * no new runtime).
 *
 * Access via direct typed import — no `t()`, no hook, no provider:
 *
 *   import { messages } from '#renderer/shared/messages/messages'
 */
export const messages = {
  statusBar: {
    idle: 'No repository open',
    unavailable: 'Status unavailable',
    loading: 'Loading…',
    changedCount: (n: number) => `${n} changed`,
    dirty: 'Working tree dirty',
    clean: 'Clean working tree',
  },
  repoRail: {
    branchesHeading: 'Branches',
    remotesHeading: 'Remotes',
    tagsHeading: 'Tags',
    stashesHeading: 'Stashes',
    filterPlaceholder: 'Filter branches, tags, stashes…',
    filterAria: 'Filter branches, tags, and stashes',
  },
  emptyState: {
    // Distinct key from statusBar.idle — coincides today by accident, not by meaning (ADR 0005).
    title: 'No repository open',
    body: 'Open a local git repository to see its branch, status, and history.',
    openCta: 'Open repository…',
  },
  repositoryView: { openAnotherCta: 'Open another repository…' },
  repoSelector: {
    triggerPlaceholder: 'Open repository',
    filterPlaceholder: 'Filter repositories…',
    empty: 'No repositories found.',
    removeFromRecentsAria: (name: string) => `Remove ${name} from recents`,
    openFooterCta: 'Open repository…',
  },
  branchesSection: {
    failedToLoad: 'Failed to load branches.',
    repoNotFound: (path: string) => `Repository not found: ${path}`,
    emptyYet: 'No branches yet.',
    emptyFiltered: 'No branches match filter.',
    detached: (sha: string) => `detached @ ${sha}`,
  },
  remotesSection: {
    failedToLoad: 'Failed to load remotes.',
    repoNotFound: (path: string) => `Repository not found: ${path}`,
    emptyYet: 'No remotes configured.',
    emptyFiltered: 'No remotes match filter.',
  },
  tagsSection: {
    failedToLoad: 'Failed to load tags.',
    repoNotFound: (path: string) => `Repository not found: ${path}`,
    emptyYet: 'No tags yet.',
    emptyFiltered: 'No tags match filter.',
  },
  stashesSection: {
    failedToLoad: 'Failed to load stashes.',
    repoNotFound: (path: string) => `Repository not found: ${path}`,
    emptyYet: 'No stashes yet.',
    emptyFiltered: 'No stashes match filter.',
  },
  inspector: {
    changesTab: 'Changes',
    treeTab: 'Tree',
  },
  changesPanel: {
    failedToLoad: 'Failed to load status.',
    repoNotFound: (path: string) => `Repository not found: ${path}`,
    clean: 'Clean working tree',
    // Sentence case + a leading icon — the group headers share the rail's section-header grammar
    // (RailSection), not an all-caps eyebrow of their own.
    stagedHeading: 'Staged',
    unstagedHeading: 'Unstaged',
    // Quiet Muted-Ink hint inside an empty group — both groups always render on a dirty tree.
    emptyStaged: 'No staged changes.',
    emptyUnstaged: 'No unstaged changes.',
    retry: 'Retry',
    // Group-header bulk actions (DESIGN.md mockup): Unstage all sits on the STAGED group, Stage all
    // on the UNSTAGED group.
    stageAll: 'Stage all',
    unstageAll: 'Unstage all',
    // Per-row checkbox labels — the accessible name for the stage/unstage toggle.
    stageRowAria: (name: string) => `Stage ${name}`,
    unstageRowAria: (name: string) => `Unstage ${name}`,
    // The commit composer (issue #63): a GitKraken-style summary + description field group and the
    // primary "Commit N files" button. The two fields join as git's native message shape (subject,
    // blank line, body). `n` stays a raw number (never pre-formatted) so the label pluralizes here
    // (1 file / N files).
    summaryPlaceholder: 'Commit message',
    descriptionPlaceholder: 'Description',
    commitButton: (n: number) => `Commit ${n} ${n === 1 ? 'file' : 'files'}`,
  },
  commitGraph: {
    failedToLoad: 'Failed to load commits.',
    repoNotFound: (path: string) => `Repository not found: ${path}`,
    emptyYet: 'No commits yet.',
    loadingMore: 'Loading more commits…',
    endOfHistory: 'End of history',
    retry: 'Retry',
    // The WIP row — the dirty Working tree as a synthetic top row (issue #66). No pill: the dotted
    // node + a persistent stronger row tint mark it, and this subject names it plainly. No timestamp
    // (it's always "now"); the trailing slot shows the change summary (file counts + `+N −N`).
    wipSubject: 'Uncommitted changes',
  },
  commitDetail: {
    // Minimal seam copy (issue #66) — the full Commit-detail body lands in its own slice.
    heading: 'Commit',
    placeholder: 'Commit detail coming soon.',
  },
  branchSelector: {
    filterPlaceholder: 'Filter branches…',
    empty: 'No branches found.',
    localGroup: 'LOCAL',
    // ONE key — used in the placeholder of the inline name input and in the footer button label.
    newBranchFrom: (branch: string) => `New branch from ${branch}…`,
  },
  errors: {
    byTag: {
      repoNotFound: 'Repository not found.',
      notARepository: (path: string) => `${path} is not a git repository.`,
      branchExists: (name: string) => `A branch named "${name}" already exists.`,
      invalidBranchName: (name: string) => `"${name}" is not a valid branch name.`,
      uncommittedChanges: 'Working tree has uncommitted changes. Commit or stash them first.',
      // Fallback when a git command fails but git gave no usable message (GitCommandError carries
      // git's own stderr — that verbatim line is preferred over this generic phrase).
      gitCommandFailed: 'Git could not complete the operation.',
      unexpected: 'An unexpected error occurred.',
    },
    switchBranch: { title: 'Could not switch branch' },
    createBranch: { title: 'Could not create branch' },
    stageFile: { title: 'Could not stage file' },
    unstageFile: { title: 'Could not unstage file' },
    stageAll: { title: 'Could not stage changes' },
    unstageAll: { title: 'Could not unstage changes' },
    commit: { title: 'Could not commit' },
    activateRepository: {
      title: 'Could not open repository',
      // Override of byTag.repoNotFound — context-specific wording for this action.
      repoNotFound: (path: string) => `${path} could not be opened.`,
    },
  },
} as const;
