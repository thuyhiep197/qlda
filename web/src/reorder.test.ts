import test from 'node:test';
import assert from 'node:assert/strict';
import { moveItem, statusOptions } from './reorder';

test('drag and drop moves a status to its new position', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b'], 5, 0), ['a', 'b']);
});

test('customer status options: active ones in order, keeping a stopped current status', () => {
  const list = [{ name: 'Mới', is_active: 1 }, { name: 'Chờ phản hồi', is_active: 0 }, { name: 'Đang tư vấn', is_active: 1 }];
  assert.deepEqual(statusOptions(list), ['Mới', 'Đang tư vấn']);
  assert.deepEqual(statusOptions(list, 'Chờ phản hồi'), ['Chờ phản hồi', 'Mới', 'Đang tư vấn']);
});
