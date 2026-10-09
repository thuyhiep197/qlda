import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAssignees, issueListAssignee, planAssigneeMembers } from './issue-filter-defaults';

test('issue list defaults to me when the URL has no assignee', () => {
  assert.deepEqual(issueListAssignee(null), { control: 'me', api: 'me' });
});

test('issue list keeps all as UI state but omits it from the API filter', () => {
  assert.deepEqual(issueListAssignee('all'), { control: 'all' });
});

test('issue list preserves explicit assignee filters', () => {
  assert.deepEqual(issueListAssignee('me'), { control: 'me', api: 'me' });
  assert.deepEqual(issueListAssignee('none'), { control: 'none', api: 'none' });
  assert.deepEqual(issueListAssignee('42'), { control: '42', api: '42' });
});

test('client-side issue filters wait for the current user then default to that user', () => {
  assert.equal(defaultAssignees(undefined), null);
  assert.deepEqual(defaultAssignees(7), [7]);
});

test('plan assignee choices always include the current user even without assigned work', () => {
  const members = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(planAssigneeMembers(members, new Set([2]), 1).map((m) => m.id), [1, 2]);
});
