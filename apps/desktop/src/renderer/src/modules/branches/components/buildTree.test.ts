import type { Branch } from '@gitoui/contracts/git';
import { describe, expect, it } from 'vitest';
import type { FolderNode } from './buildTree';
import { buildTree } from './buildTree';

function makeBranch(name: string, isCurrent = false): Branch {
  return { name, isCurrent, ahead: 0, behind: 0 };
}

function asFolder(node: unknown, label: string): FolderNode {
  if (!node || (node as FolderNode).kind !== 'folder') {
    throw new Error(`Expected folder node at ${label}, got: ${JSON.stringify(node)}`);
  }
  return node as FolderNode;
}

describe('buildTree', () => {
  it('pinned structure test: folders first then leaves, folders nested recursively', () => {
    const branches = [
      makeBranch('main'),
      makeBranch('feature/auth/login'),
      makeBranch('feature/auth/logout'),
      makeBranch('feature/pay-fallback'),
    ];
    const result = buildTree(branches);

    // Top level: folder 'feature/', then leaf 'main'
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'folder', segment: 'feature', path: 'feature/' });
    expect(result[1]).toMatchObject({ kind: 'branch', segment: 'main' });

    const featureFolder = asFolder(result[0], 'result[0]');

    // Inside 'feature/': folder 'auth/', then leaf 'pay-fallback'
    expect(featureFolder.children).toHaveLength(2);
    expect(featureFolder.children[0]).toMatchObject({
      kind: 'folder',
      segment: 'auth',
      path: 'feature/auth/',
    });
    expect(featureFolder.children[1]).toMatchObject({ kind: 'branch', segment: 'pay-fallback' });

    const authFolder = asFolder(featureFolder.children[0], 'feature/auth');

    // Inside 'auth/': leaf 'login', leaf 'logout'
    expect(authFolder.children).toHaveLength(2);
    expect(authFolder.children[0]).toMatchObject({ kind: 'branch', segment: 'login' });
    expect(authFolder.children[1]).toMatchObject({ kind: 'branch', segment: 'logout' });
  });

  it('flat branches (no slash) are all leaves, sorted alpha', () => {
    const branches = [makeBranch('z-branch'), makeBranch('a-branch'), makeBranch('m-branch')];
    const result = buildTree(branches);
    expect(result.map((n) => n.segment)).toEqual(['a-branch', 'm-branch', 'z-branch']);
    for (const node of result) {
      expect(node.kind).toBe('branch');
    }
  });

  it('folders sorted alpha among themselves, before all leaves', () => {
    const branches = [makeBranch('zz/leaf'), makeBranch('aa/leaf'), makeBranch('standalone')];
    const result = buildTree(branches);
    expect(result[0]).toMatchObject({ kind: 'folder', segment: 'aa' });
    expect(result[1]).toMatchObject({ kind: 'folder', segment: 'zz' });
    expect(result[2]).toMatchObject({ kind: 'branch', segment: 'standalone' });
  });

  it('floats the current branch to the top of its group, above the other leaves but below folders', () => {
    const branches = [
      makeBranch('feat/aaa'),
      makeBranch('feat/zzz', true), // current — floats to the top of feat/'s leaves
      makeBranch('feat/sub/leaf'),
      makeBranch('feat/bbb'),
    ];
    const feat = asFolder(buildTree(branches)[0], 'feat');
    // folder 'sub/' first, then leaves: current 'zzz', then the rest alpha (aaa, bbb).
    expect(feat.children[0]).toMatchObject({ kind: 'folder', segment: 'sub' });
    expect(feat.children[1]).toMatchObject({ kind: 'branch', segment: 'zzz' });
    expect(feat.children[2]).toMatchObject({ kind: 'branch', segment: 'aaa' });
    expect(feat.children[3]).toMatchObject({ kind: 'branch', segment: 'bbb' });
  });

  it('floats a current top-level branch above the other top-level leaves', () => {
    const result = buildTree([makeBranch('zzz', true), makeBranch('aaa'), makeBranch('mmm')]);
    expect(result.map((n) => n.segment)).toEqual(['zzz', 'aaa', 'mmm']);
  });

  it('empty array returns empty tree', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('single branch with no slash is a single leaf', () => {
    const result = buildTree([makeBranch('main')]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'branch', segment: 'main' });
  });

  it('three-level nesting works', () => {
    const branches = [makeBranch('a/b/c/leaf')];
    const result = buildTree(branches);
    expect(result[0]).toMatchObject({ kind: 'folder', segment: 'a', path: 'a/' });

    const a = asFolder(result[0], 'a');
    expect(a.children[0]).toMatchObject({ kind: 'folder', segment: 'b', path: 'a/b/' });

    const b = asFolder(a.children[0], 'a/b');
    expect(b.children[0]).toMatchObject({ kind: 'folder', segment: 'c', path: 'a/b/c/' });

    const c = asFolder(b.children[0], 'a/b/c');
    expect(c.children[0]).toMatchObject({ kind: 'branch', segment: 'leaf' });
  });
});
