import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkActions, canBulk } from './bulk-actions';

test('each bulk control follows its own permission cell', () => {
  assert.deepEqual(bulkActions(['issue.assign']), { assign: true, sprint: false, status: false, edit: false, delete: false });
  assert.deepEqual(bulkActions(['sprint.manage', 'issue.transition']), { assign: false, sprint: true, status: true, edit: false, delete: false });
  // Sửa issue của mình không mở thao tác hàng loạt trên trường của issue
  assert.equal(bulkActions(['issue.edit_own']).edit, false);
  // Dự án Kanban không có sprint
  assert.equal(bulkActions(['sprint.manage'], false).sprint, false);
});

test('selection is offered only when at least one bulk action is allowed', () => {
  assert.equal(canBulk(['plan.view', 'issue.view', 'issue.edit_own']), false);
  assert.equal(canBulk(undefined), false);
  assert.equal(canBulk(['issue.delete']), true);
  assert.equal(canBulk(['sprint.manage'], false), false);
});
