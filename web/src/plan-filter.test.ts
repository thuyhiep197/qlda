import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPlanTree, filterTreeStrict, filterTreeKeepingMatchingRoots, orCreated } from './plan-filter';

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

// Thêm nhanh trên Kế hoạch chi tiết: việc mới chưa giao cho ai, trong khi bảng mặc định lọc theo chính mình
interface Work { level: 0 | 1 | 2; assignee: number | null; issue: { id: number; type: string; subtype?: string | null }; children: Work[] }
const work = (id: number, level: 0 | 1 | 2, assignee: number | null, children: Work[] = [], type = 'task', subtype?: string): Work =>
  ({ level, assignee, issue: { id, type, subtype }, children });
const planIds = (rows: Work[]): unknown[] => rows.map((r) => (r.children.length ? [r.issue.id, planIds(r.children)] : r.issue.id));
const ME = 2;
const mine = (r: Work) => r.assignee === ME;
// Cùng thứ tự như màn hình: lọc theo người thực hiện rồi lọc dòng
const plan = (tree: Work[], created: Set<number>, type = '') => {
  const match = orCreated<Work>(created, mine);
  return filterPlanTree(filterTreeKeepingMatchingRoots(tree, match), { type, rowFilter: true, strict: false, match, keep: (r) => created.has(r.issue.id) });
};

test('a new unassigned issue stays hidden by the assignee filter until it is marked as just created', () => {
  const tree = [work(1, 0, 6, [work(2, 1, ME), work(3, 1, null)])];
  assert.deepEqual(planIds(plan(tree, new Set())), [[1, [2]]]);
  assert.deepEqual(planIds(plan(tree, new Set([3]))), [[1, [2, 3]]]);
});

test('a just-created issue shows in an epic with no other match, and as a subtask under its parent', () => {
  assert.deepEqual(planIds(plan([work(1, 0, 6, [work(3, 1, null)])], new Set([3]))), [[1, [3]]]);
  const tree = [work(1, 0, 6, [work(2, 1, ME, [work(4, 2, null, [], 'subtask', 'task')])])];
  assert.deepEqual(planIds(plan(tree, new Set([4]))), [[1, [[2, [4]]]]]);
});

test('a just-created issue also survives the type filter; other issues of that type still filter normally', () => {
  const tree = [work(1, 0, 6, [work(2, 1, ME, [], 'story'), work(3, 1, null, [], 'bug'), work(5, 1, ME, [], 'bug')])];
  assert.deepEqual(planIds(plan(tree, new Set([3]), 'story')), [[1, [2, 3]]]);
  assert.deepEqual(planIds(plan(tree, new Set(), 'story')), [[1, [2]]]);
});
