import test from 'node:test';
import assert from 'node:assert/strict';
import { branchIds, journeyProgress, leafIds, loadTemplate, pingDue } from './journey';

const st = (id: number, depth: number, status: 'todo' | 'doing' | 'done' = 'todo', due_date: string | null = null, code = '', title = `B${id}`) =>
  ({ id, depth, position: id, status, due_date, code, title });
// I > 1 > (+a > -a1, -a2), (+b) ; II > 2 (không có bước con)
const steps = [st(1, 0, 'todo', null, 'I', 'GIẢI PHÁP'), st(2, 1, 'todo', null, '1', 'Phê duyệt'), st(3, 2), st(4, 3, 'done'), st(5, 3, 'doing', '2026-10-01'),
  st(6, 2, 'done'), st(7, 0, 'todo', null, 'II', 'HỢP ĐỒNG'), st(8, 1, 'todo', '2026-10-01', '2', 'Ký hợp đồng')];

test('bundled template has the four parts I–IV and 457 rows', () => {
  const rows = loadTemplate();
  assert.equal(rows.length, 457);
  assert.deepEqual(rows.filter((r) => r.depth === 0).map((r) => r.code), ['I', 'II', 'III', 'IV']);
  assert.ok(rows.every((r) => r.title && r.depth >= 0 && r.depth <= 3));
});

test('leaves are steps without children; sections are never leaves', () => {
  assert.deepEqual([...leafIds(steps)], [4, 5, 6, 8]);
});

test('removing a branch takes the step and all its children', () => {
  assert.deepEqual(branchIds(steps, 3), [3, 4, 5]);
  assert.deepEqual(branchIds(steps, 1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(branchIds(steps, 6), [6]);
  assert.deepEqual(branchIds(steps, 99), []);
});

test('progress per part counts done, in-progress and overdue leaves and finds the current stage', () => {
  const p = journeyProgress(steps, '2026-10-17');
  assert.deepEqual(p.sections.map((x) => [x.title, x.total, x.done, x.doing, x.overdue]), [['I GIẢI PHÁP', 3, 2, 1, 1], ['II HỢP ĐỒNG', 1, 0, 0, 1]]);
  assert.equal(p.current?.id, 2);
  assert.equal(p.pct, 50);
  const all = journeyProgress(steps.map((s) => ({ ...s, status: 'done' as const })), '2026-10-17');
  assert.equal(all.current, null);
  assert.equal(all.pct, 100);
});

test('ping reminds once a day from N days before the due date until done', () => {
  const s = { status: 'doing' as const, due_date: '2026-10-20', ping_days: 3, assignee_id: 5, pinged_on: null };
  assert.equal(pingDue(s, '2026-10-16'), false);
  assert.equal(pingDue(s, '2026-10-17'), true);
  assert.equal(pingDue(s, '2026-10-25'), true);
  assert.equal(pingDue({ ...s, pinged_on: '2026-10-17' }, '2026-10-17'), false);
  assert.equal(pingDue({ ...s, status: 'done' }, '2026-10-18'), false);
  assert.equal(pingDue({ ...s, ping_days: 0 }, '2026-10-18'), false);
  assert.equal(pingDue({ ...s, assignee_id: null }, '2026-10-18'), false);
});
