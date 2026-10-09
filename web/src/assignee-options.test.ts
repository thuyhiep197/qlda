import test from 'node:test';
import assert from 'node:assert/strict';
import { assigneeAccess } from './assignee-options';

test('assign permission allows assigning and unassigning', () => {
  assert.deepEqual(assigneeAccess({ assigneeId: 3, meId: 1, isMember: true, canAssign: true }),
    { editable: true, selfOnly: false, allowUnassign: true });
});

test('a member without assign permission can only claim an unassigned issue', () => {
  assert.deepEqual(assigneeAccess({ assigneeId: null, meId: 1, isMember: true, canAssign: false, canEdit: true }),
    { editable: true, selfOnly: true, allowUnassign: false });
  assert.deepEqual(assigneeAccess({ assigneeId: 3, meId: 1, isMember: true, canAssign: false, canEdit: true }),
    { editable: false, selfOnly: true, allowUnassign: false });
});

test('a non-member without assign permission cannot edit', () => {
  assert.equal(assigneeAccess({ assigneeId: null, meId: 1, isMember: false, canAssign: false, canEdit: true }).editable, false);
});

test('a read-only member cannot claim an unassigned issue that the server would reject', () => {
  assert.equal(assigneeAccess({ assigneeId: null, meId: 1, isMember: true, canAssign: false, canEdit: false }).editable, false);
});
