import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPlanTree, filterTreeStrict, filterTreeKeepingMatchingRoots } from './plan-filter';

interface Row { id: number; assigneeId: number | null; children: Row[] }

test('strict plan filtering removes other assignees even when they contain matching children', () => {
  const rows: Row[] = [{ id: 1, assigneeId: 2, children: [{ id: 2, assigneeId: 1, children: [] }] }];
  const result = filterTreeStrict(rows, (row) => row.assigneeId === 1);
  assert.deepEqual(result, [{ id: 2, assigneeId: 1, children: [] }]);
});

test('strict plan filtering retains a matching row and only matching descendants', () => {
  const rows: Row[] = [{ id: 1, assigneeId: 1, children: [
    { id: 2, assigneeId: 2, children: [] }, { id: 3, assigneeId: 1, children: [] },
  ] }];
  assert.deepEqual(filterTreeStrict(rows, (row) => row.assigneeId === 1), [
    { id: 1, assigneeId: 1, children: [{ id: 3, assigneeId: 1, children: [] }] },
  ]);
});

test('assignee filtering keeps an epic when it contains matching issues', () => {
  const rows: Row[] = [{ id: 1, assigneeId: 2, children: [
    { id: 2, assigneeId: 1, children: [] },
    { id: 3, assigneeId: 3, children: [] },
  ] }];
  assert.deepEqual(filterTreeKeepingMatchingRoots(rows, (row) => row.assigneeId === 1), [
    { id: 1, assigneeId: 2, children: [{ id: 2, assigneeId: 1, children: [] }] },
  ]);
});

test('assignee filtering removes an epic without any matching issue', () => {
  const rows: Row[] = [{ id: 1, assigneeId: 2, children: [{ id: 2, assigneeId: 3, children: [] }] }];
  assert.deepEqual(filterTreeKeepingMatchingRoots(rows, (row) => row.assigneeId === 1), []);
});

interface PRow { id: number; level: number; done: boolean; issue: { type: string; subtype?: string | null }; children: PRow[] }
const pr = (id: number, level: number, done: boolean, children: PRow[] = []): PRow => ({ id, level, done, issue: { type: level === 2 ? 'subtask' : level === 0 ? 'epic' : 'story' }, children });
const ids = (rows: PRow[]): unknown => rows.map((r) => (r.children.length ? [r.id, ids(r.children)] : r.id));

test('filtering by Hoàn thành drops unfinished parent rows and lifts their done subtasks under the epic', () => {
  const tree = [pr(1, 0, false, [pr(2, 1, false, [pr(3, 2, true), pr(4, 2, false)]), pr(5, 1, true)])];
  const out = filterPlanTree(tree, { type: '', rowFilter: true, strict: true, match: (r) => r.done });
  assert.deepEqual(ids(out), [[1, [3, 5]]]);
});

test('non-strict filters (search, owner) keep the parent row as context', () => {
  const tree = [pr(1, 0, false, [pr(2, 1, false, [pr(3, 2, true)])])];
  const out = filterPlanTree(tree, { type: '', rowFilter: true, strict: false, match: (r) => r.done });
  assert.deepEqual(ids(out), [[1, [[2, [3]]]]]);
});

test('a done parent with done subtasks stays as a parent under strict filtering', () => {
  const tree = [pr(1, 0, false, [pr(2, 1, true, [pr(3, 2, true), pr(4, 2, false)])])];
  const out = filterPlanTree(tree, { type: '', rowFilter: true, strict: true, match: (r) => r.done });
  assert.deepEqual(ids(out), [[1, [[2, [3]]]]]);
});
