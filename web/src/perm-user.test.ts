import test from 'node:test';
import assert from 'node:assert/strict';
import { extraPerms } from './perm-user';

test('per-user extra permissions = ticked permissions outside the group', () => {
  const group = new Set(['plan.view', 'issue.view']);
  assert.deepEqual(extraPerms(group, ['issue.view', 'customer.view', 'plan.export', 'customer.view']), ['customer.view', 'plan.export']);
  assert.deepEqual(extraPerms(group, ['plan.view']), []);
});
