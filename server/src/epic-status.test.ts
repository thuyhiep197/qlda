import test from 'node:test';
import assert from 'node:assert/strict';
import { epicTargetCategory } from './epic-status';

test('all children done and the epic period is over: done', () => {
  assert.equal(epicTargetCategory(['done', 'done'], '2026-10-11', '2026-10-12'), 'done');
});

test('all children done without an end date: done', () => {
  assert.equal(epicTargetCategory(['done'], null, '2026-10-12'), 'done');
});

test('all children done but the epic period is not over yet: in progress', () => {
  assert.equal(epicTargetCategory(['done', 'done'], '2026-10-30', '2026-10-12'), 'inprogress');
  assert.equal(epicTargetCategory(['done'], '2026-10-12', '2026-10-12'), 'inprogress');
});

test('todo and in-progress rules are unchanged', () => {
  assert.equal(epicTargetCategory(['todo', 'todo'], '2026-10-30', '2026-10-12'), 'todo');
  assert.equal(epicTargetCategory(['todo', 'done'], null, '2026-10-12'), 'inprogress');
  assert.equal(epicTargetCategory(['inprogress'], '2026-10-01', '2026-10-12'), 'inprogress');
});
