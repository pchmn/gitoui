import type { Commit } from '@gitoui/contracts/git';
import { describe, expect, it } from 'vitest';
import type { LayoutRow } from './laneLayout';
import { laneLayout } from './laneLayout';

type LayoutCommit = Pick<Commit, 'sha' | 'parents' | 'refs'>;

/** A minimal Commit — just the DAG shape the sweep reads. `current` decorates it as HEAD's tip. */
function commit(sha: string, parents: string[], current = false): LayoutCommit {
  return {
    sha,
    parents,
    refs: current ? [{ _tag: 'Branch', name: sha, current: true }] : [],
  };
}

/** Strips a `LayoutRow` down to the fields a fixture asserts on, for terse `toEqual` comparisons. */
function pick(row: LayoutRow) {
  return {
    sha: row.sha,
    col: row.col,
    isMerge: row.isMerge,
    verticals: row.verticals,
    above: row.above,
    below: row.below,
  };
}

describe('laneLayout', () => {
  it('1. linear chain: every Commit stays on lane 0, no transitions, no merges', () => {
    const commits = [commit('C', ['B'], true), commit('B', ['A']), commit('A', [])];
    const { rows, frontierOut } = laneLayout(commits);

    expect(rows.map(pick)).toEqual([
      { sha: 'C', col: 0, isMerge: false, verticals: [], above: [], below: [] },
      { sha: 'B', col: 0, isMerge: false, verticals: [], above: [], below: [] },
      { sha: 'A', col: 0, isMerge: false, verticals: [], above: [], below: [] },
    ]);
    expect(frontierOut.lanes).toEqual([]);
  });

  it('2. fork + merge: M forks into B/F, converging back into A', () => {
    const commits = [
      commit('M', ['B', 'F'], true),
      commit('B', ['A']),
      commit('F', ['A']),
      commit('A', []),
    ];
    const { rows, frontierOut } = laneLayout(commits);

    expect(rows.map(pick)).toEqual([
      {
        sha: 'M',
        col: 0,
        isMerge: true,
        verticals: [],
        above: [],
        below: [{ fromCol: 0, toCol: 1 }],
      },
      {
        sha: 'B',
        col: 0,
        isMerge: false,
        verticals: [1],
        above: [{ fromCol: 0, toCol: 1 }],
        below: [],
      },
      {
        sha: 'F',
        col: 1,
        isMerge: false,
        verticals: [0],
        above: [],
        below: [{ fromCol: 1, toCol: 0 }],
      },
      {
        sha: 'A',
        col: 0,
        isMerge: false,
        verticals: [],
        above: [{ fromCol: 1, toCol: 0 }],
        below: [],
      },
    ]);
    expect(frontierOut.lanes).toEqual([]);
  });

  it('3. two independent branches: each keeps its own lane, unrelated lanes pass straight through', () => {
    const commits = [
      commit('T1', ['A1'], true),
      commit('T2', ['A2']),
      commit('A1', []),
      commit('A2', []),
    ];
    const { rows } = laneLayout(commits);

    expect(rows.map(pick)).toEqual([
      { sha: 'T1', col: 0, isMerge: false, verticals: [], above: [], below: [] },
      { sha: 'T2', col: 1, isMerge: false, verticals: [0], above: [], below: [] },
      { sha: 'A1', col: 0, isMerge: false, verticals: [1], above: [], below: [] },
      { sha: 'A2', col: 1, isMerge: false, verticals: [], above: [], below: [] },
    ]);
  });

  it('4. HEAD pinning: column 0 stays reserved until the HEAD-decorated Commit arrives', () => {
    const commits = [commit('X', ['A']), commit('H', ['A'], true), commit('A', [])];
    const { rows } = laneLayout(commits);

    expect(rows.map(pick)).toEqual([
      { sha: 'X', col: 1, isMerge: false, verticals: [], above: [], below: [] },
      {
        sha: 'H',
        col: 0,
        isMerge: false,
        verticals: [1],
        above: [],
        below: [{ fromCol: 1, toCol: 0 }],
      },
      {
        sha: 'A',
        col: 0,
        isMerge: false,
        verticals: [],
        above: [{ fromCol: 1, toCol: 0 }],
        below: [],
      },
    ]);
  });

  it('5. lane reuse: a lane freed by a convergence is reusable from the next row on', () => {
    const commits = [
      commit('M', ['B', 'F'], true),
      commit('B', ['A']),
      commit('F', ['A']),
      commit('A', ['Z']),
      commit('T', ['W']),
    ];
    const { rows, frontierOut } = laneLayout(commits);

    expect(rows.find((r) => r.sha === 'T')).toMatchObject({ col: 1 });
    expect(frontierOut.lanes).toEqual([{ expects: 'Z' }, { expects: 'W' }]);
  });

  it('6. incremental invariant: any prefix split of fixture 2 matches the single-pass run row-for-row', () => {
    const commits = [
      commit('M', ['B', 'F'], true),
      commit('B', ['A']),
      commit('F', ['A']),
      commit('A', []),
    ];
    const singlePass = laneLayout(commits).rows.map(pick);

    for (let split = 0; split <= commits.length; split++) {
      const prefix = laneLayout(commits.slice(0, split));
      const suffix = laneLayout(commits.slice(split), prefix.frontierOut);
      const incremental = [...prefix.rows, ...suffix.rows].map(pick);
      expect(incremental).toEqual(singlePass);
    }
  });
});
