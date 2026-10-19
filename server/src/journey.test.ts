import test from 'node:test';
import assert from 'node:assert/strict';
import { branchIds, cleanJourneyRows, journeyProgress, journeyStatus, leafIds, loadTemplate, pingDue, syncUpdates } from './journey';

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

test('customer project status is the furthest part with a started step', () => {
  assert.equal(journeyStatus([]), null);
  const fresh = steps.map((s) => ({ ...s, status: 'todo' as const }));
  assert.equal(journeyStatus(fresh), 'Chưa bắt đầu');
  // Phần I còn bước chưa xong nhưng phần II đã có bước đang làm → II
  const inII = fresh.map((s) => (s.id === 4 ? { ...s, status: 'done' as const } : s.id === 8 ? { ...s, status: 'doing' as const } : s));
  assert.equal(journeyStatus(inII), 'II. Hợp đồng');
  assert.equal(journeyStatus(steps), 'I. Giải pháp');
  assert.equal(journeyStatus(steps.map((s) => ({ ...s, status: 'done' as const }))), 'Hoàn thành');
  assert.equal(journeyStatus([st(1, 0, 'todo', null, 'IV', 'NGHIỆM THU - THANH TOÁN'), st(2, 1, 'doing')]), 'IV. Nghiệm thu - Thanh toán');
});

test('an edited template must stay a tree that starts with a part and has named steps', () => {
  const ok = cleanJourneyRows([{ depth: 0, code: 'I', title: 'GIẢI PHÁP' }, { depth: 1, title: '  Bước   mới ' }, { depth: 2, title: 'Con' }]);
  assert.deepEqual(ok.map((r) => [r.depth, r.title]), [[0, 'GIẢI PHÁP'], [1, 'Bước mới'], [2, 'Con']]);
  assert.throws(() => cleanJourneyRows([]), /không có bước/);
  assert.throws(() => cleanJourneyRows([{ depth: 1, title: 'A' }]), /bắt đầu bằng một phần/);
  assert.throws(() => cleanJourneyRows([{ depth: 0, title: 'I' }, { depth: 2, title: 'Lạc' }]), /không nằm dưới/);
  assert.throws(() => cleanJourneyRows([{ depth: 0, title: 'I' }, { depth: 1, title: ' ' }]), /tên bước/);
});

test('parts III and IV follow same-named work items of the production project, only when those change', () => {
  const j = [st(1, 0, 'todo', null, 'II', 'HỢP ĐỒNG'), st(2, 1, 'todo', null, '', 'Cài đặt hệ thống'),
    st(3, 0, 'todo', null, 'III', 'TRIỂN KHAI'), st(4, 1, 'todo', null, '', 'Cài đặt hệ thống'), st(5, 1, 'todo', null, '', 'Đào tạo'),
    st(6, 0, 'todo', null, 'IV', 'NGHIỆM THU'), st(7, 1, 'todo', null, '', 'Nghiệm thu nội bộ')];
  const issues = [{ id: 10, summary: 'cai dat  he thong', status_category: 'done', due_date: '2026-10-30' },
    { id: 11, summary: 'Nghiệm thu nội bộ', status_category: 'inprogress', due_date: null }];
  const u = syncUpdates(j, issues);
  // Bước cùng tên ở phần II không đồng bộ; Đào tạo không có đầu việc trùng tên
  assert.deepEqual(u.map((x) => [x.id, x.status, x.due_date]), [[4, 'done', '2026-10-30'], [7, 'doing', null]]);
  // Đã đồng bộ, Kinh doanh sửa tay → giữ nguyên cho tới khi đầu việc đổi
  const after = j.map((s) => (s.id === 4 ? { ...s, status: 'todo' as const, synced_status: 'done', synced_due: '2026-10-30', synced_issue_id: 10 }
    : s.id === 7 ? { ...s, synced_status: 'doing', synced_due: null, synced_issue_id: 11 } : s));
  assert.deepEqual(syncUpdates(after, issues), []);
  const moved = syncUpdates(after, [{ ...issues[0], due_date: '2026-11-05' }, issues[1]]);
  assert.deepEqual(moved.map((x) => [x.id, x.status, x.due_date]), [[4, undefined, '2026-11-05']]);
});
