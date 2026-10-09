import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAssignees, issueListAssignee } from './issue-filter-defaults';

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
