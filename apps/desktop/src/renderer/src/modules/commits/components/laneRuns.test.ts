import type { Commit } from '@gitoui/contracts/git';
import { describe, expect, it } from 'vitest';
import { laneLayout } from './laneLayout';
import { computeLaneRuns, runAt } from './laneRuns';

type LayoutCommit = Pick<Commit, 'sha' | 'parents' | 'refs'>;

function commit(sha: string, parents: string[], refs: LayoutCommit['refs'] = []): LayoutCommit {
  return { sha, parents, refs };
}

describe('computeLaneRuns', () => {
  // The fork+merge DAG (laneLayout fixture 2): M merges F back into main; F's lane runs from the
  // merge row (where the diverging edge opens it) down to its fork point A.
  const commits = [
    commit('M', ['B', 'F'], [{ _tag: 'Branch', name: 'main', current: true }]),
    commit('B', ['A']),
    commit('F', ['A'], [{ _tag: 'RemoteBranch', name: 'origin/feat/forked' }]),
    commit('A', []),
  ];
  const { rows } = laneLayout(commits);
  const runs = computeLaneRuns(rows, commits);

  it("derives main's run over the full range and the branch's run from merge row to fork point", () => {
    expect(runs).toEqual([
      // main: opened by the tip M, carries M/B/A, closes at the root A.
      { id: 0, col: 0, fromRow: 0, toRow: 3, commitRows: [0, 1, 3], label: 'main' },
      // the branch: opened by M's merge edge (row 0), its Commit is F, folds into A (row 3).
      { id: 1, col: 1, fromRow: 0, toRow: 3, commitRows: [2], label: 'origin/feat/forked' },
    ]);
  });

  it('hit-tests the run occupying a column at a row', () => {
    expect(runAt(runs, 2, 1)?.id).toBe(1);
    expect(runAt(runs, 2, 0)?.id).toBe(0);
    // No lane occupies column 2 anywhere.
    expect(runAt(runs, 1, 2)).toBeNull();
  });

  it('labels a run null when no Commit on it carries a Branch ref — Tags do not name lines', () => {
    const tagged = [commit('T', ['R'], [{ _tag: 'Tag', name: 'v1.0.0' }]), commit('R', [])];
    const taggedRuns = computeLaneRuns(laneLayout(tagged).rows, tagged);
    expect(taggedRuns).toHaveLength(1);
    expect(taggedRuns[0]?.label).toBeNull();
  });

  // Anonymous lines (their Branch merged and deleted, or their tip beyond the loaded window)
  // fall back to git's conventional merge subject: `into Y` names the merge's own line,
  // `branch 'X'` the second-parent line the merge opens.
  it('names anonymous runs from a conventional merge subject', () => {
    const anonymous = [
      { ...commit('M', ['B', 'F']), subject: "Merge branch 'feat/x' into dev" },
      commit('B', ['A']),
      commit('F', ['A']),
      commit('A', []),
    ];
    const anonRuns = computeLaneRuns(laneLayout(anonymous).rows, anonymous);
    expect(anonRuns.map((run) => run.label)).toEqual(['dev', 'feat/x']);
  });

  it('prefers a real Ref over the merge-subject hint', () => {
    const decorated = [
      {
        ...commit('M', ['B', 'F'], [{ _tag: 'Branch', name: 'dev', current: true }]),
        subject: "Merge remote-tracking branch 'origin/feat/renamed'",
      },
      commit('B', ['A']),
      commit('F', ['A'], [{ _tag: 'RemoteBranch', name: 'origin/feat/x' }]),
      commit('A', []),
    ];
    const decoratedRuns = computeLaneRuns(laneLayout(decorated).rows, decorated);
    expect(decoratedRuns.map((run) => run.label)).toEqual(['dev', 'origin/feat/x']);
  });
});
