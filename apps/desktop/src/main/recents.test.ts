import { describe, expect, it } from 'vitest';
import { parseRecents, removeRecent, touchRecent } from './recents.ts';

describe('parseRecents', () => {
  it('keeps well-formed entries and orders them most-recent first', () => {
    const blob = [
      { path: '/a', lastOpenedAt: 100 },
      { path: '/b', lastOpenedAt: 300 },
      { path: '/c', lastOpenedAt: 200 },
    ];
    expect(parseRecents(blob).map((r) => r.path)).toEqual(['/b', '/c', '/a']);
  });

  it('drops the whole blob when it is not the expected shape', () => {
    expect(parseRecents({ nope: true })).toEqual([]);
    expect(parseRecents('garbage')).toEqual([]);
    expect(parseRecents(undefined)).toEqual([]);
    // A single malformed entry invalidates the array (entries are dropped wholesale).
    expect(parseRecents([{ path: '/a' }, { path: '/b', lastOpenedAt: 1 }])).toEqual([]);
  });
});

describe('touchRecent', () => {
  it('prepends a new repository as the most recent', () => {
    const next = touchRecent([{ path: '/a', lastOpenedAt: 100 }], '/b', 200);
    expect(next).toEqual([
      { path: '/b', lastOpenedAt: 200 },
      { path: '/a', lastOpenedAt: 100 },
    ]);
  });

  it('upserts an existing repository by path and bumps it to the front', () => {
    const list = [
      { path: '/a', lastOpenedAt: 100 },
      { path: '/b', lastOpenedAt: 50 },
    ];
    const next = touchRecent(list, '/b', 300);
    expect(next).toEqual([
      { path: '/b', lastOpenedAt: 300 },
      { path: '/a', lastOpenedAt: 100 },
    ]);
    expect(next).toHaveLength(2);
  });
});

describe('removeRecent', () => {
  it('drops the matching entry and keeps the rest in MRU order', () => {
    const list = [
      { path: '/a', lastOpenedAt: 300 },
      { path: '/b', lastOpenedAt: 200 },
      { path: '/c', lastOpenedAt: 100 },
    ];
    expect(removeRecent(list, '/b').map((r) => r.path)).toEqual(['/a', '/c']);
  });

  it('is a no-op when the path is not present', () => {
    const list = [{ path: '/a', lastOpenedAt: 100 }];
    expect(removeRecent(list, '/missing')).toEqual(list);
  });
});
