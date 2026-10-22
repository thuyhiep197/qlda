import test from 'node:test';
import assert from 'node:assert/strict';
import { assigneeAccess } from './assignee-options';

test('assign permission allows assigning and unassigning', () => {
  assert.deepEqual(assigneeAccess({ canAssign: true }), { editable: true, allowUnassign: true });
});

test('without assign permission nobody can change the assignee, not even claim an issue for themselves', () => {
  assert.deepEqual(assigneeAccess({ canAssign: false }), { editable: false, allowUnassign: false });
});
