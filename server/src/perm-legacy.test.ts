import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegacyPermissionList } from './perm-legacy';

const OLD = ['project.admin', 'sprint.manage', 'issue.create', 'issue.edit', 'comment.create'];
const ALL = ['issue.view', 'issue.create', 'issue.edit', 'comment.create', 'customer.view', 'customer.edit', 'geo.view'];

test('old flat permission lists are recognised for upgrade', () => {
  assert.equal(isLegacyPermissionList(['project.admin', 'issue.create'], OLD, ALL), true);
  assert.equal(isLegacyPermissionList(['comment.create'], OLD, ALL), true);
});

test('new roles without issue view (e.g. Sales: customer only) are left alone', () => {
  assert.equal(isLegacyPermissionList(['customer.view', 'customer.edit', 'geo.view'], OLD, ALL), false);
  assert.equal(isLegacyPermissionList(['issue.create', 'customer.view'], OLD, ALL), false);
});

test('roles that already have issue view are never upgraded', () => {
  assert.equal(isLegacyPermissionList(['issue.view', 'project.admin'], OLD, ALL), false);
});
