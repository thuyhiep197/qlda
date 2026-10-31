import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByRole, matchAccount, suggestAccounts, userRowGroups } from './user-groups';

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

test('the account table has no row group when nobody matches the search (typing a name half-way must not break the page)', () => {
  assert.deepEqual(userRowGroups([], false, roles), []);
  assert.deepEqual(userRowGroups([], true, roles), []);
  assert.deepEqual(userRowGroups(undefined, false, roles), []);
  assert.deepEqual(userRowGroups([{ id: 1, default_role_id: 2 }], false, roles).map((g) => g.map((u) => u.id)), [[1]]);
});

const people = [
  { id: 1, full_name: 'Nguyễn Hoàng Sơn', username: 'sonnh', email: null },
  { id: 2, full_name: 'Hoàng Thanh Trang', username: 'tranght', email: 'trang@x.vn' },
  { id: 3, full_name: 'Lê Thị Vân Anh', username: 'anhltv' },
  { id: 4, full_name: 'Đỗ Ngọc Khánh', username: 'khanhdn' },
];

test('account search ignores Vietnamese accents and case, on name, username and email', () => {
  assert.equal(matchAccount(people[1], 'hoang'), true);
  assert.equal(matchAccount(people[3], 'do ngoc'), true);
  assert.equal(matchAccount(people[1], 'TRANG@X'), true);
  assert.equal(matchAccount(people[0], 'sonnh'), true);
  assert.equal(matchAccount(people[0], 'Hoafng'), false);
  assert.equal(matchAccount(people[0], '  '), true);
});

test('name suggestions put names starting with the typed text first, then a word in the name, at most the limit', () => {
  assert.deepEqual(suggestAccounts(people, 'hoang').map((u) => u.id), [2, 1]);
  assert.deepEqual(suggestAccounts(people, 'an').map((u) => u.id), [3, 1, 2, 4]);
  assert.deepEqual(suggestAccounts(people, 'n', 2).map((u) => u.id), [1, 4]);
  assert.deepEqual(suggestAccounts(people, ''), []);
  assert.deepEqual(suggestAccounts(people, 'zzz'), []);
});
