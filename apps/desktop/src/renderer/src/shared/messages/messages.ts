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
    filterPlaceholder: 'Filter branches, tags…',
    filterAria: 'Filter branches and tags',
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
      unexpected: 'An unexpected error occurred.',
    },
    switchBranch: { title: 'Could not switch branch' },
    createBranch: { title: 'Could not create branch' },
    activateRepository: {
      title: 'Could not open repository',
      // Override of byTag.repoNotFound — context-specific wording for this action.
      repoNotFound: (path: string) => `${path} could not be opened.`,
    },
  },
} as const;
