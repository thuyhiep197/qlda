import test from 'node:test';
import assert from 'node:assert/strict';
import { parentDoneError, typeChangeError } from './issue-type';

test('story, task, bug and sub-task convert between each other', () => {
  assert.equal(typeChangeError('story', 'bug', 0), null);
  assert.equal(typeChangeError('task', 'subtask', 0), null);
  assert.equal(typeChangeError('subtask', 'story', 0), null);
});

test('standard issues convert to and from epic', () => {
  assert.equal(typeChangeError('task', 'epic', 0), null);
  assert.equal(typeChangeError('epic', 'story', 0), null);
});

test('epic with issues inside cannot change type', () => {
  assert.match(typeChangeError('epic', 'task', 2)!, /issue bên trong/);
});

test('issue with sub-tasks cannot become epic or sub-task', () => {
  assert.match(typeChangeError('story', 'epic', 1)!, /Epic/);
  assert.match(typeChangeError('story', 'subtask', 1)!, /Sub-task/);
  assert.equal(typeChangeError('story', 'bug', 3), null);
});

test('sub-task and epic do not convert directly', () => {
  assert.ok(typeChangeError('subtask', 'epic', 0));
  assert.ok(typeChangeError('epic', 'subtask', 0));
});

test('unknown types are rejected', () => {
  assert.ok(typeChangeError('task', 'feature', 0));
});

test('parent cannot move to done while a child is still open', () => {
  assert.match(parentDoneError('done', ['QLTB-716', 'QLTB-718'])!, /QLTB-716, QLTB-718/);
  assert.match(parentDoneError('done', ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'])!, /6 việc/);
});

test('parent may move to done when all children are done, or to any non-done status', () => {
  assert.equal(parentDoneError('done', []), null);
  assert.equal(parentDoneError('indeterminate', ['QLTB-716']), null);
});
