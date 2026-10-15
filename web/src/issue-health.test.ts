import test from 'node:test';
import assert from 'node:assert/strict';
import { issueHealth } from './util';

const issue = (status_category: 'todo' | 'inprogress' | 'done', start_date: string | null, due_date: string | null) =>
  ({ status_category, start_date, due_date, resolved_at: null });

test('an in-progress issue still within its dates is on track even late in its window', () => {
  assert.equal(issueHealth(issue('inprogress', '2026-10-12', '2026-10-16'), '2026-10-15'), 'on_track');
  assert.equal(issueHealth(issue('inprogress', '2026-10-12', '2026-10-15'), '2026-10-15'), 'on_track');
});

test('an in-progress issue past its due date is late', () => {
  assert.equal(issueHealth(issue('inprogress', '2026-10-07', '2026-10-07'), '2026-10-15'), 'late');
});

test('a to-do issue whose start date has passed is behind', () => {
  assert.equal(issueHealth(issue('todo', '2026-10-12', '2026-11-03'), '2026-10-15'), 'behind');
});

test('a to-do issue starting today is on track and a future one is not started', () => {
  assert.equal(issueHealth(issue('todo', '2026-10-15', '2026-10-20'), '2026-10-15'), 'on_track');
  assert.equal(issueHealth(issue('todo', '2026-10-16', '2026-10-20'), '2026-10-15'), 'not_started');
});
