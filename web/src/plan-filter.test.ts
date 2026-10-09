import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTreeStrict, filterTreeKeepingMatchingRoots } from './plan-filter';

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
