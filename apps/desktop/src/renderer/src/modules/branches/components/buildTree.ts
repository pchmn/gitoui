import type { Branch } from '@gitoui/contracts/git';

export type LeafNode = { kind: 'branch'; branch: Branch; segment: string };
export type FolderNode = { kind: 'folder'; segment: string; path: string; children: TreeNode[] };
export type TreeNode = LeafNode | FolderNode;

/**
 * Build a recursive `/`-separated tree from a flat list of Branches.
 *
 * Ordering at each level: folders first (alpha by segment), then leaves — within the leaves the
 * current Branch floats to the top, the rest alpha by segment.
 */
export function buildTree(branches: readonly Branch[]): TreeNode[] {
  return buildLevel(branches, [], '');
}

function buildLevel(branches: readonly Branch[], segments: string[], prefix: string): TreeNode[] {
  // Group branches into direct leaves and groups by the next segment.
  const leaves: LeafNode[] = [];
  // Map from next-segment to the branches that belong under it.
  const folders = new Map<string, Branch[]>();

  for (const branch of branches) {
    const parts = branch.name.split('/');
    const depth = segments.length;

    if (parts.length === depth + 1) {
      // This branch is a direct leaf at this level.
      leaves.push({ kind: 'branch', branch, segment: parts[depth] as string });
    } else {
      // This branch belongs in a subfolder.
      const folderSegment = parts[depth] as string;
      const existing = folders.get(folderSegment);
      if (existing) {
        existing.push(branch);
      } else {
        folders.set(folderSegment, [branch]);
      }
    }
  }

  // Sort leaves: the current Branch floats to the top of its group, then the rest alpha by segment.
  leaves.sort((a, b) => {
    if (a.branch.isCurrent !== b.branch.isCurrent) return a.branch.isCurrent ? -1 : 1;
    return a.segment.localeCompare(b.segment);
  });

  // Build folder nodes, sorted alpha by segment.
  const folderNodes: FolderNode[] = [];
  const sortedFolderKeys = [...folders.keys()].sort((a, b) => a.localeCompare(b));
  for (const seg of sortedFolderKeys) {
    const folderBranches = folders.get(seg) as Branch[];
    const folderPath = `${prefix}${seg}/`;
    const children = buildLevel(folderBranches, [...segments, seg], folderPath);
    folderNodes.push({ kind: 'folder', segment: seg, path: folderPath, children });
  }

  // Folders first, then leaves.
  return [...folderNodes, ...leaves];
}
