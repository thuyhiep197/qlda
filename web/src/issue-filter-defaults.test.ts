import test from 'node:test';
import assert from 'node:assert/strict';
import { assigneeChoices, defaultAssignees, issueListAssignee, planAssignees, withCreated } from './issue-filter-defaults';

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

test('plan assignee filter lists people with work and the current user, member or not, once each', () => {
  const an = { id: 1, full_name: 'An' }, binh = { id: 2, full_name: 'Bình' }, cuong = { id: 3, full_name: 'Cường' };
  assert.deepEqual(planAssignees([cuong, binh, cuong], an).map((p) => p.id), [1, 2, 3]);
  assert.deepEqual(planAssignees([binh], binh).map((p) => p.id), [2]);
  assert.deepEqual(planAssignees([binh]).map((p) => p.id), [2]);
});

test('the assignee box of an issue always offers its current assignee, so it never reads "Chưa giao" by mistake', () => {
  const members = [{ id: 1, full_name: 'An', role_name: 'BA' }];
  assert.deepEqual(assigneeChoices(members, { assignee_id: 1, assignee_name: 'An' }), members);
  assert.deepEqual(assigneeChoices(members, { assignee_id: null }), members);
  assert.deepEqual(assigneeChoices(members, { assignee_id: 9, assignee_name: 'Hiệp' }).map((m) => m.id), [1, 9]);
  assert.equal(assigneeChoices(members, { assignee_id: 9, assignee_name: 'Hiệp' }).at(-1)?.full_name, 'Hiệp');
});

test('backlog keeps newly created issues visible even when the filter hides them', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(withCreated(items, [{ id: 3 }], new Set([2])), [{ id: 2 }, { id: 3 }]);
  assert.deepEqual(withCreated(items, [{ id: 1 }], new Set()), [{ id: 1 }]);
});
