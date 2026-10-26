import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByRole } from './user-groups';

const roles = [{ id: 5 }, { id: 2 }, { id: 9 }];

test('accounts group by role in the role catalog order, keeping their order inside each group', () => {
  const users = [{ id: 1, default_role_id: 2 }, { id: 2, default_role_id: 5 }, { id: 3, default_role_id: 2 }, { id: 4, default_role_id: 5 }];
  assert.deepEqual(groupByRole(users, roles).map((g) => g.map((u) => u.id)), [[2, 4], [1, 3]]);
});

test('accounts without a role come last, after roles missing from the catalog', () => {
  const users = [{ id: 1, default_role_id: null }, { id: 2, default_role_id: 77 }, { id: 3, default_role_id: 9 }, { id: 4 }];
  assert.deepEqual(groupByRole(users, roles).map((g) => g.map((u) => u.id)), [[3], [2], [1, 4]]);
});

test('no accounts, no groups', () => {
  assert.deepEqual(groupByRole([], roles), []);
});

test('top groups: system admin, Ban Giám đốc, Techlead, BA Lead; other groups keep the catalog order', () => {
  const catalog = [{ id: 1, name: 'Dev' }, { id: 5, name: 'BA Lead' }, { id: 2, name: ' Ban Giám Đốc ' }, { id: 3, name: 'Kinh doanh' },
    { id: 6, name: 'Tech Lead' }, { id: 4, name: 'Quản trị hệ thống', is_admin: 1 }];
  const users = [{ id: 10, default_role_id: 1 }, { id: 11, default_role_id: 3 }, { id: 12, default_role_id: 2 }, { id: 13, default_role_id: 4 },
    { id: 14, default_role_id: 5 }, { id: 15, default_role_id: 6 }];
  assert.deepEqual(groupByRole(users, catalog).map((g) => g.map((u) => u.id)), [[13], [12], [15], [14], [10], [11]]);
});
