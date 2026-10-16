import test from 'node:test';
import assert from 'node:assert/strict';
import { typeOptions } from './issue-type-options';

test('standard issues can become any other type', () => {
  assert.deepEqual(typeOptions('task'), ['story', 'task', 'bug', 'subtask', 'epic']);
});

test('epic converts only to story, task or bug', () => {
  assert.deepEqual(typeOptions('epic'), ['epic', 'story', 'task', 'bug']);
});

test('sub-task cannot become epic directly', () => {
  assert.ok(!typeOptions('subtask').includes('epic'));
  assert.ok(typeOptions('subtask').includes('subtask'));
});
