import type { StatusEntry } from '@gitoui/contracts/git';
import { describe, expect, it } from 'vitest';
import {
  stageAllEntries,
  stageOne,
  toStaged,
  toUnstaged,
  unstageAllEntries,
  unstageOne,
} from './optimisticStaging';

describe('toStaged', () => {
  it('moves an Unstaged modification onto the Staged axis', () => {
    const e: StatusEntry = { path: 'a.txt', unstaged: { kind: 'modified', additions: 5 } };
    expect(toStaged(e)).toEqual({ path: 'a.txt', staged: { kind: 'modified', additions: 5 } });
  });

  it('shows an Untracked path as `added` once Staged', () => {
    const e: StatusEntry = { path: 'new.txt', unstaged: { kind: 'untracked' } };
    expect(toStaged(e)).toEqual({ path: 'new.txt', staged: { kind: 'added' } });
  });

  it('collapses a both-axes entry to Staged-only, keeping the staged kind', () => {
    const e: StatusEntry = {
      path: 'a.txt',
      staged: { kind: 'modified', additions: 3 },
      unstaged: { kind: 'modified', additions: 5 },
    };
    const staged = toStaged(e);
    expect(staged.staged?.kind).toBe('modified');
    expect(staged.unstaged).toBeUndefined();
  });

  it('is a no-op for an already Staged-only entry (same reference)', () => {
    const e: StatusEntry = { path: 'a.txt', staged: { kind: 'added' } };
    expect(toStaged(e)).toBe(e);
  });
});

describe('toUnstaged', () => {
  it('moves a Staged modification onto the Unstaged axis', () => {
    const e: StatusEntry = { path: 'a.txt', staged: { kind: 'modified', additions: 5 } };
    expect(toUnstaged(e)).toEqual({ path: 'a.txt', unstaged: { kind: 'modified', additions: 5 } });
  });

  it('shows a Staged `added` path as Untracked once Unstaged', () => {
    const e: StatusEntry = { path: 'new.txt', staged: { kind: 'added' } };
    expect(toUnstaged(e)).toEqual({ path: 'new.txt', unstaged: { kind: 'untracked' } });
  });

  it('is a no-op for an already Unstaged-only entry (same reference)', () => {
    const e: StatusEntry = { path: 'a.txt', unstaged: { kind: 'modified' } };
    expect(toUnstaged(e)).toBe(e);
  });
});

describe('stageOne / unstageOne', () => {
  const entries: StatusEntry[] = [
    { path: 'a.txt', unstaged: { kind: 'modified' } },
    { path: 'b.txt', unstaged: { kind: 'modified' } },
  ];

  it('stages only the targeted path, leaving the rest untouched', () => {
    const [a, b] = stageOne(entries, 'a.txt');
    expect(a?.staged?.kind).toBe('modified');
    expect(a?.unstaged).toBeUndefined();
    expect(b).toBe(entries[1]); // untouched, same reference
  });

  it('unstages only the targeted path', () => {
    const staged: StatusEntry[] = [
      { path: 'a.txt', staged: { kind: 'modified' } },
      { path: 'b.txt', staged: { kind: 'modified' } },
    ];
    const [a, b] = unstageOne(staged, 'a.txt');
    expect(a?.unstaged?.kind).toBe('modified');
    expect(a?.staged).toBeUndefined();
    expect(b?.staged?.kind).toBe('modified'); // untouched
  });
});

describe('stageAllEntries / unstageAllEntries', () => {
  it('stages every entry (all end up Staged-only)', () => {
    const entries: StatusEntry[] = [
      { path: 'a.txt', unstaged: { kind: 'modified' } },
      { path: 'b.txt', unstaged: { kind: 'untracked' } },
    ];
    const result = stageAllEntries(entries);
    expect(result.every((e) => e.staged && !e.unstaged)).toBe(true);
    expect(result[1]?.staged?.kind).toBe('added'); // untracked → added
  });

  it('unstages every entry (all end up Unstaged-only)', () => {
    const entries: StatusEntry[] = [
      { path: 'a.txt', staged: { kind: 'modified' } },
      { path: 'b.txt', staged: { kind: 'added' } },
    ];
    const result = unstageAllEntries(entries);
    expect(result.every((e) => e.unstaged && !e.staged)).toBe(true);
    expect(result[1]?.unstaged?.kind).toBe('untracked'); // added → untracked
  });
});
