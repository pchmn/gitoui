import type { Branch, Remote, RemoteTrackingBranch } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useSelection } from '#renderer/core/shell/SelectionContext';
import { useActiveRepository } from '#renderer/modules/repository/ActiveRepositoryContext';
import type { GitError } from '#renderer/shared/git/errors';
import { messages } from '#renderer/shared/messages/messages';
import { matchError } from '#renderer/shared/utils/matchError';
import type { FolderNode, TreeNode } from '../../branches/components/buildTree';
import { buildTree } from '../../branches/components/buildTree';
import { useRemotes } from '../hooks/useRemotes';

/**
 * Read-only Remotes section for the Repository rail (issue #34). Two-level rows:
 * - Remote row (disclosure) — expands to show its remote-tracking branches.
 * - Remote-tracking branch rows — name only, no ahead/behind (a remote-tracking branch has no
 *   upstream of its own per CONTEXT.md glossary).
 *
 * Rows are selectable: remote → `{ kind: 'remote', id: name }`, tracking branch →
 * `{ kind: 'remote-branch', id: 'origin/main' }`.
 *
 * Filter matches on remote name OR branch name; auto-expands the remote when any branch matches.
 * Honors the rail-global flat/tree mode from the `viewMode` prop (tree mode runs `buildTree` on the
 * branch names within each remote, same logic as `BranchesSection`).
 *
 * Loading shows skeleton rows; "No remotes" empty state mirrors `BranchesSection`.
 */
export function RemotesSection({
  filter,
  viewMode = 'flat',
}: {
  filter: string;
  viewMode?: 'flat' | 'tree';
}) {
  const { root } = useActiveRepository();
  const { data: remoteList, isPending, isError, error } = useRemotes(root);

  if (root === null) return null;

  if (isPending) {
    return <RemotesSkeleton />;
  }

  if (isError) {
    const message = matchError<GitError<'listRemotes'>, string>(error, {
      RepoNotFoundError: (e) => messages.remotesSection.repoNotFound(e.path),
      _: () => messages.remotesSection.failedToLoad,
    });
    return (
      <p className='px-3 py-2 text-xs text-muted-foreground' role='alert'>
        {message}
      </p>
    );
  }

  const { remotes } = remoteList;
  const lowerFilter = filter.toLowerCase().trim();

  // Filter: a remote is visible if its name matches OR any of its branch names match.
  const filteredRemotes =
    lowerFilter === ''
      ? remotes
      : remotes.filter(
          (r) =>
            r.name.toLowerCase().includes(lowerFilter) ||
            r.branches.some((b) => b.name.toLowerCase().includes(lowerFilter)),
        );

  const isEmpty = filteredRemotes.length === 0;

  return (
    <>
      {isEmpty && (
        <p className='px-3 py-1.5 text-xs text-muted-foreground'>
          {remotes.length === 0
            ? messages.remotesSection.emptyYet
            : messages.remotesSection.emptyFiltered}
        </p>
      )}

      {!isEmpty && (
        // px-2 inset mirrors BranchTreeView so a remote row (e.g. `origin`) aligns with a
        // top-level Branches folder (e.g. `chore/`) rather than the section header (issue #34).
        <div className='flex flex-col px-2'>
          {filteredRemotes.map((remote) => (
            <RemoteRow key={remote.name} remote={remote} filter={filter} viewMode={viewMode} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * A single remote row with a disclosure that expands to show its remote-tracking branches.
 * Auto-expands when a filter is active and at least one branch matches (or the remote name itself
 * matches, in which case all branches are shown).
 */
function RemoteRow({
  remote,
  filter,
  viewMode,
}: {
  remote: Remote;
  filter: string;
  viewMode: 'flat' | 'tree';
}) {
  const { isSelected, select } = useSelection();
  const [userOpen, setUserOpen] = useState(true);

  const sel = { kind: 'remote' as const, id: remote.name };
  const isRowSelected = isSelected(sel);

  const lowerFilter = filter.toLowerCase().trim();
  const isFiltering = lowerFilter !== '';

  // Auto-expand: when filtering and any branch matches (or the remote name itself matches).
  const remoteNameMatches = isFiltering && remote.name.toLowerCase().includes(lowerFilter);

  // Effective open state: auto-expand while filtering; otherwise respect user toggle.
  const effectiveOpen = isFiltering ? true : userOpen;

  // Branches to show: if remote name itself matches, show all; otherwise filter by name.
  const visibleBranches = useMemo(() => {
    if (!isFiltering || remoteNameMatches) return remote.branches;
    return remote.branches.filter((b) => b.name.toLowerCase().includes(lowerFilter));
  }, [remote.branches, isFiltering, remoteNameMatches, lowerFilter]);

  function handleClick() {
    select(sel);
  }

  function handleToggle() {
    if (!isFiltering) {
      setUserOpen((prev) => !prev);
    }
  }

  return (
    <>
      {/* Remote header row — disclosure + select */}
      <div
        role='option'
        className={cn(
          'flex h-7 cursor-default select-none items-center gap-1.5 px-3 text-xs hover:bg-muted rounded-sm',
          isRowSelected && 'ring-1 ring-inset ring-primary/50',
        )}
        aria-selected={isRowSelected}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* Disclosure chevron */}
        <button
          type='button'
          className='flex items-center'
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          aria-expanded={effectiveOpen}
          tabIndex={-1}
          aria-label={effectiveOpen ? `Collapse ${remote.name}` : `Expand ${remote.name}`}
        >
          {effectiveOpen ? (
            <CaretDownIcon className='size-3 shrink-0 text-muted-foreground' aria-hidden='true' />
          ) : (
            <CaretRightIcon className='size-3 shrink-0 text-muted-foreground' aria-hidden='true' />
          )}
        </button>

        {/* Remote name */}
        <span
          className='min-w-0 flex-1 truncate font-medium text-muted-foreground'
          title={remote.name}
        >
          {remote.name}
        </span>
      </div>

      {/* Remote-tracking branch rows */}
      {effectiveOpen &&
        visibleBranches.length > 0 &&
        (viewMode === 'tree' ? (
          <RemoteBranchTreeView
            remoteName={remote.name}
            branches={visibleBranches}
            filter={filter}
          />
        ) : (
          <div>
            {visibleBranches.map((branch) => (
              <RemoteBranchRow
                key={branch.name}
                remoteName={remote.name}
                branch={branch}
                label={branch.name}
              />
            ))}
          </div>
        ))}
    </>
  );
}

/**
 * Tree-mode rendering of tracking branches within a single remote. Adapts `buildTree` by
 * constructing synthetic Branch objects (isCurrent=false, ahead/behind=0) from the tracking branch
 * names, then renders them through the same folder/leaf recursion as BranchTreeView — but with
 * `RemoteBranchRow` as the leaf renderer instead of `BranchRow`.
 */
function RemoteBranchTreeView({
  remoteName,
  branches,
  filter,
}: {
  remoteName: string;
  branches: readonly RemoteTrackingBranch[];
  filter: string;
}) {
  // Build synthetic Branch objects so we can reuse buildTree. Cast as Branch[] — isCurrent=false,
  // ahead/behind=0, no upstream — all structurally compatible with the Branch schema.
  const syntheticBranches = useMemo(
    () =>
      branches.map(
        (b): Branch => ({
          name: b.name,
          isCurrent: false,
          ahead: 0,
          behind: 0,
        }),
      ),
    [branches],
  );

  const tree = useMemo(() => buildTree(syntheticBranches), [syntheticBranches]);
  const [userOpen, setUserOpen] = useState<Record<string, boolean>>({});
  const lowerFilter = filter.toLowerCase().trim();
  const isFiltering = lowerFilter !== '';

  function isEffectivelyOpen(path: string, children: readonly { name: string }[]): boolean {
    if (isFiltering) {
      // Auto-expand if any descendant matches.
      return children.some((c) => 'name' in c && c.name.toLowerCase().includes(lowerFilter));
    }
    return userOpen[path] ?? true;
  }

  function toggleFolder(path: string) {
    setUserOpen((prev) => {
      const current = prev[path] ?? true;
      return { ...prev, [path]: !current };
    });
  }

  return (
    <div className='flex flex-col px-2'>
      {tree.map((node) => (
        <RemoteTreeNodeRow
          key={node.kind === 'branch' ? node.branch.name : node.path}
          node={node}
          depth={0}
          remoteName={remoteName}
          isEffectivelyOpen={isEffectivelyOpen}
          onToggle={toggleFolder}
        />
      ))}
    </div>
  );
}

function RemoteTreeNodeRow({
  node,
  depth,
  remoteName,
  isEffectivelyOpen,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  remoteName: string;
  isEffectivelyOpen: (path: string, children: readonly { name: string }[]) => boolean;
  onToggle: (path: string) => void;
}) {
  if (node.kind === 'branch') {
    return (
      <div style={{ paddingLeft: depth * 12 }}>
        <RemoteBranchRow
          remoteName={remoteName}
          branch={{ name: node.branch.name }}
          label={node.segment}
        />
      </div>
    );
  }

  // Gather all descendant leaf names for the auto-expand check.
  const leafNames = gatherLeafNames(node);
  const open = isEffectivelyOpen(node.path, leafNames);

  return (
    <>
      <button
        type='button'
        className='flex h-7 w-full cursor-default select-none items-center gap-1.5 px-3 text-xs text-muted-foreground hover:bg-muted rounded-sm'
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onClick={() => onToggle(node.path)}
        aria-expanded={open}
      >
        {open ? (
          <CaretDownIcon className='size-3 shrink-0' aria-hidden='true' />
        ) : (
          <CaretRightIcon className='size-3 shrink-0' aria-hidden='true' />
        )}
        <span className='min-w-0 flex-1 truncate text-left'>
          {node.segment}
          <span aria-hidden='true'>/</span>
        </span>
      </button>
      {open &&
        node.children.map((child) => (
          <RemoteTreeNodeRow
            key={child.kind === 'branch' ? child.branch.name : child.path}
            node={child}
            depth={depth + 1}
            remoteName={remoteName}
            isEffectivelyOpen={isEffectivelyOpen}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

/** Gather all leaf branch names under a folder node (for auto-expand descendant check). */
function gatherLeafNames(node: FolderNode): { name: string }[] {
  const result: { name: string }[] = [];
  for (const child of node.children) {
    if (child.kind === 'branch') {
      result.push({ name: child.branch.name });
    } else {
      result.push(...gatherLeafNames(child));
    }
  }
  return result;
}

/**
 * A single remote-tracking branch row. Read-only: single-click = select, no double-click action.
 * Selection id is `origin/main` (remote prefix + name) so it's globally unique across sections.
 */
function RemoteBranchRow({
  remoteName,
  branch,
  label,
}: {
  remoteName: string;
  branch: RemoteTrackingBranch;
  label?: string;
}) {
  const { isSelected, select } = useSelection();
  const sel = { kind: 'remote-branch' as const, id: `${remoteName}/${branch.name}` };
  const isRowSelected = isSelected(sel);

  function handleClick() {
    select(sel);
  }

  return (
    <div
      role='option'
      className={cn(
        'flex h-7 cursor-default select-none items-center gap-1.5 pl-6 pr-3 text-xs hover:bg-muted rounded-sm',
        isRowSelected && 'ring-1 ring-inset ring-primary/50',
      )}
      aria-selected={isRowSelected}
      tabIndex={0}
      title={`${remoteName}/${branch.name}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Dot in a size-3 slot (the chevron's footprint) so it aligns with remote/folder carets. */}
      <span className='flex size-3 shrink-0 items-center justify-center' aria-hidden='true'>
        <span className='size-1.5 rounded-full bg-muted-foreground/40' />
      </span>
      <span className='min-w-0 flex-1 truncate'>{label ?? branch.name}</span>
    </div>
  );
}

/** Skeleton rows shown during loading (no spinner — skeletons over spinners per issue #23). */
function RemotesSkeleton() {
  return (
    <ul className='flex flex-col gap-1 px-3 py-2' aria-busy='true' aria-label='Loading remotes'>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className='flex h-6 items-center gap-2'>
          <span className='size-1.5 shrink-0 rounded-full bg-muted-foreground/20' />
          <span
            className='h-3 animate-pulse rounded-sm bg-muted'
            style={{ width: `${50 + (i % 3) * 25}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
