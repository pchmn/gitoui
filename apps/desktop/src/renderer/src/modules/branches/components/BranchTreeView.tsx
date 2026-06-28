import type { Branch } from '@gitoui/contracts/git';
import { cn } from '@gitoui/ui/lib/utils';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { BranchRow } from './BranchRow';
import type { FolderNode, TreeNode } from './buildTree';
import { buildTree } from './buildTree';

/**
 * Derive the set of ancestor paths for a given branch name.
 * e.g. 'feature/auth/login' → ['feature/', 'feature/auth/']
 */
function ancestorPaths(branchName: string): string[] {
  const parts = branchName.split('/');
  const paths: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    paths.push(`${parts.slice(0, i).join('/')}/`);
  }
  return paths;
}

/**
 * Check whether a node has any descendant leaf whose `branch.name` matches the filter.
 */
function hasMatchingDescendant(node: FolderNode, filter: string): boolean {
  const lower = filter.toLowerCase();
  return node.children.some((child) => {
    if (child.kind === 'branch') {
      return child.branch.name.toLowerCase().includes(lower);
    }
    return hasMatchingDescendant(child, filter);
  });
}

/**
 * Filter tree nodes to only those matching the filter string (or ancestor folders of matches).
 */
function filterTree(nodes: TreeNode[], filter: string): TreeNode[] {
  const lower = filter.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'branch') {
      if (node.branch.name.toLowerCase().includes(lower)) {
        result.push(node);
      }
    } else {
      const filteredChildren = filterTree(node.children, filter);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

interface BranchTreeViewProps {
  branches: readonly Branch[];
  head: { _tag: 'OnBranch'; branch: string } | { _tag: 'Detached'; sha: string };
  filter: string;
  isDetached: boolean;
}

/**
 * Recursive tree view of local Branches. Folders are collapsible; leaves reuse `BranchRow`.
 * Expansion state is per-folder, keyed by `path`. Default: all open. Force-open ancestors of the
 * current branch. Filter: case-insensitive substring on full `branch.name` — matching leaves and
 * their ancestor folders stay visible; ancestors auto-expand during filter without mutating toggle
 * state.
 */
export function BranchTreeView({ branches, filter, isDetached }: BranchTreeViewProps) {
  const tree = useMemo(() => buildTree(branches), [branches]);

  // Ancestor folders of the current branch. Open by default (so it's visible on load) but NOT
  // pinned open — the user can collapse them; when collapsed, the folder is marked instead.
  const currentBranch = branches.find((b) => b.isCurrent);
  const currentAncestorPaths = useMemo(
    () => new Set(currentBranch ? ancestorPaths(currentBranch.name) : []),
    [currentBranch],
  );

  // User-controlled expansion state: path → boolean. Default all-open via missing-key = true.
  const [userOpen, setUserOpen] = useState<Record<string, boolean>>({});

  const isFiltering = filter.trim() !== '';

  /**
   * Effective open state for a folder:
   * - If filtering: open whenever it contains a matching descendant (override without mutation).
   * - Otherwise: userOpen[path] ?? true — default open, freely collapsible (including the current
   *   branch's ancestors, which are marked when collapsed rather than pinned open).
   */
  function isEffectivelyOpen(node: FolderNode): boolean {
    if (isFiltering) {
      return hasMatchingDescendant(node, filter);
    }
    return userOpen[node.path] ?? true;
  }

  function toggleFolder(path: string) {
    setUserOpen((prev) => {
      // If missing from state, current effective value is `true`; toggle to `false`.
      const current = prev[path] ?? true;
      return { ...prev, [path]: !current };
    });
  }

  const displayTree = isFiltering ? filterTree(tree, filter) : tree;

  return (
    <div role='listbox' aria-label='Branches' className='flex flex-col px-2'>
      {displayTree.map((node) => (
        <TreeNodeRow
          key={node.kind === 'branch' ? node.branch.name : node.path}
          node={node}
          depth={0}
          isDetached={isDetached}
          isEffectivelyOpen={isEffectivelyOpen}
          currentAncestorPaths={currentAncestorPaths}
          onToggle={toggleFolder}
        />
      ))}
    </div>
  );
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  isDetached: boolean;
  isEffectivelyOpen: (node: FolderNode) => boolean;
  currentAncestorPaths: Set<string>;
  onToggle: (path: string) => void;
}

function TreeNodeRow({
  node,
  depth,
  isDetached,
  isEffectivelyOpen,
  currentAncestorPaths,
  onToggle,
}: TreeNodeRowProps) {
  if (node.kind === 'branch') {
    return (
      <div style={{ paddingLeft: depth * 12 }}>
        <BranchRow branch={node.branch} isDetached={isDetached} label={node.segment} />
      </div>
    );
  }

  const open = isEffectivelyOpen(node);
  // A collapsed folder that holds the current branch hides its row — mark it (brighter text + a
  // primary dot) so the active group stays findable. When open, the current row carries its own marker.
  const marksCurrentGroup = !open && currentAncestorPaths.has(node.path);

  return (
    <>
      <button
        type='button'
        className={cn(
          'flex h-7 w-full cursor-default select-none items-center gap-1.5 px-3 text-xs hover:bg-muted rounded-sm',
          marksCurrentGroup ? 'bg-accent text-foreground' : 'text-muted-foreground',
        )}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onClick={() => onToggle(node.path)}
        aria-expanded={open}
        title={marksCurrentGroup ? 'Contains the current branch' : undefined}
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
        {marksCurrentGroup && (
          <span className='size-1.5 shrink-0 rounded-full bg-primary' aria-hidden='true' />
        )}
      </button>
      {open &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.kind === 'branch' ? child.branch.name : child.path}
            node={child}
            depth={depth + 1}
            isDetached={isDetached}
            isEffectivelyOpen={isEffectivelyOpen}
            currentAncestorPaths={currentAncestorPaths}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
