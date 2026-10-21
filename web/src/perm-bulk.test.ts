import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkPerms } from './perm-bulk';
import type { FeatureDef } from './types';

const crm: FeatureDef[] = [
  { key: 'customer', label: 'Thông tin khách hàng', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'customer_all', label: 'Phạm vi: Tất cả khách hàng', actions: ['view'], scope: true },
];

test('ticking a whole column or module never ticks the scope (see all) cell', () => {
  assert.deepEqual(bulkPerms(crm, 'view'), ['customer.view']);
  assert.deepEqual(bulkPerms(crm), ['customer.view', 'customer.create', 'customer.edit', 'customer.delete']);
  assert.deepEqual(bulkPerms(crm, 'export'), []);
});
