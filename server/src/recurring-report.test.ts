import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Task báo cáo họp giao ban tự sinh: dựng Epic giống QLTB-406 trong CSDL tạm rồi chạy quy tắc ở các mốc thời gian khác nhau.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-recurring-'));
const { migrate, run, get, all } = await import('./db.ts');
const { seedRoles } = await import('./permissions.ts');
migrate();
seedRoles();
const { dueThursday, weekNumber, reportPeriod, runReportRule, generateRecurringReports } = await import('./recurring-report.ts');

const roleId = run("INSERT INTO roles(name, permissions) VALUES ('Làm việc', ?)", JSON.stringify(['issue.view'])).id;
const user = (username: string, active = 1) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_active) VALUES (?, ?, 'x', ?, ?)", username, username, roleId, active).id;
const hiep = user('hiep');
const other = user('other');

/** 9h thứ Năm giờ Việt Nam = 2h UTC */
const vn = (date: string, hour = 9) => new Date(Date.parse(`${date}T00:00:00Z`) + (hour - 7) * 3600_000);

let seq = 0;
function setup(epicDue: string | null = '2026-12-31') {
  seq += 1;
  const key = `P${seq}`;
  const pid = run("INSERT INTO projects(key, name, type) VALUES (?, 'Dự án', 'scrum')", key).id;
  run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?, ?, ?)', pid, hiep, roleId);
  const [todo, doing] = ['Chưa thực hiện', 'Đang thực hiện'].map((n, i) => run('INSERT INTO statuses(project_id, name, category, position) VALUES (?, ?, ?, ?)', pid, n, i ? 'inprogress' : 'todo', i).id);
  const add = (type: string, summary: string, parent: number | null, due: string | null = null, assignee: number | null = hiep) => {
    run('UPDATE projects SET issue_seq = issue_seq + 1 WHERE id = ?', pid);
    const n = get<{ issue_seq: number }>('SELECT issue_seq FROM projects WHERE id = ?', pid)!.issue_seq;
    return run(`INSERT INTO issues(project_id, number, key, type, summary, status_id, priority, assignee_id, reporter_id, parent_id, due_date, rank, created_at, updated_at)
      VALUES (?,?,?,?,?,?,'high',?,?,?,?,?,'2026-10-01','2026-10-01')`, pid, n, `${key}-${n}`, type, summary, todo, assignee, hiep, parent, due, n * 1000).id;
  };
  const epic = add('epic', 'Báo cáo họp giao ban các bên', null, epicDue);
  const prev = add('task', 'Báo cáo tuần và nhật ký thi công tuần 4', epic, '2026-10-22');
  const rule = { epicKey: `${key}-1`, week1Thursday: '2026-10-01', firstThursday: '2026-11-12' };
  const newest = () => get<any>('SELECT * FROM issues WHERE parent_id = ? ORDER BY number DESC LIMIT 1', epic);
  return { pid, doing, epic, prev, rule, add, newest };
}

test('tính đúng thứ Năm cuối kỳ theo giờ Việt Nam', () => {
  assert.equal(dueThursday(vn('2026-11-12', 7)), '2026-11-05', 'trước 8h thứ Năm vẫn là kỳ trước');
  assert.equal(dueThursday(vn('2026-11-12', 8)), '2026-11-12');
  assert.equal(dueThursday(vn('2026-11-13', 23)), '2026-11-12');
  assert.equal(dueThursday(vn('2026-11-18')), '2026-11-12');
  assert.equal(dueThursday(new Date('2026-11-11T17:30:00Z')), '2026-11-05', '0h30 thứ Năm giờ Việt Nam');
});

test('số tuần và kỳ báo cáo khớp các kỳ đã làm', () => {
  assert.equal(weekNumber('2026-10-22', '2026-10-01'), 4);
  assert.equal(weekNumber('2026-11-05', '2026-10-01'), 6);
  assert.deepEqual(reportPeriod('2026-11-05'), { from: '2026-10-30', to: '2026-11-05', send: '2026-11-06' });
});

test('sinh task theo khuôn task tuần trước, ở trạng thái đang thực hiện', () => {
  const s = setup();
  const key = runReportRule(s.rule, vn('2026-11-12'));
  const t = get<any>('SELECT * FROM issues WHERE key = ?', key)!;
  assert.equal(t.summary, 'Báo cáo tuần và nhật ký thi công tuần 7');
  assert.equal(t.type, 'task');
  assert.equal(t.parent_id, s.epic);
  assert.equal(t.status_id, s.doing);
  assert.equal(t.assignee_id, hiep);
  assert.equal(t.reporter_id, hiep);
  assert.equal(t.priority, 'high');
  assert.equal(t.start_date, '2026-11-12');
  assert.equal(t.due_date, '2026-11-12');
  assert.match(t.description, /06\/11\/2026 – 12\/11\/2026/);
  assert.match(t.description, /13\/11\/2026/);
  assert.ok(get('SELECT 1 FROM issue_links WHERE source_id = ? AND target_id = ?', t.id, s.prev), 'liên kết với task tuần trước');
});

test('người thực hiện cũng là người tạo vẫn nhận thông báo từ hệ thống', () => {
  const s = setup();
  const key = runReportRule(s.rule, vn('2026-11-12'));
  const t = get<any>('SELECT id FROM issues WHERE key = ?', key)!;
  const notes = all<any>('SELECT * FROM notifications WHERE issue_id = ?', t.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].user_id, hiep);
  assert.equal(notes[0].actor_id, null);
  assert.equal(notes[0].type, 'assigned');
});

test('không sinh trước kỳ đầu tiên và trước 8h thứ Năm', () => {
  const s = setup();
  assert.equal(runReportRule(s.rule, vn('2026-11-07')), null, 'kỳ 05/11 không sinh bù');
  assert.equal(runReportRule(s.rule, vn('2026-11-12', 7)), null);
  assert.equal(s.newest().id, s.prev);
});

test('mỗi kỳ chỉ sinh một lần, xóa tay không sinh lại, kỳ sau sinh tiếp', () => {
  const s = setup();
  const first = runReportRule(s.rule, vn('2026-11-12'));
  assert.ok(first);
  assert.equal(runReportRule(s.rule, vn('2026-11-12', 15)), null);
  run('DELETE FROM issues WHERE key = ?', first);
  assert.equal(runReportRule(s.rule, vn('2026-11-13')), null, 'task đã xóa không sinh lại');
  const next = get<any>('SELECT * FROM issues WHERE key = ?', runReportRule(s.rule, vn('2026-11-19')))!;
  assert.equal(next.summary, 'Báo cáo tuần và nhật ký thi công tuần 8');
});

test('đã có task của kỳ trong Epic thì không sinh thêm', () => {
  const byName = setup();
  byName.add('task', 'Báo cáo tuần và nhật ký thi công tuần 7', byName.epic);
  assert.equal(runReportRule(byName.rule, vn('2026-11-12')), null);
  const byDue = setup();
  byDue.add('task', 'Báo cáo đặc biệt', byDue.epic, '2026-11-12');
  assert.equal(runReportRule(byDue.rule, vn('2026-11-12')), null);
  // "tuần 70" không bị hiểu nhầm là tuần 7
  const longer = setup();
  longer.add('task', 'Báo cáo tuần 70', longer.epic);
  assert.ok(runReportRule(longer.rule, vn('2026-11-12')));
});

test('dừng khi qua hạn Epic, dự án lưu trữ hoặc không có Epic', () => {
  const overdue = setup('2026-11-11');
  assert.equal(runReportRule(overdue.rule, vn('2026-11-12')), null);
  const archived = setup();
  run('UPDATE projects SET is_archived = 1 WHERE id = ?', archived.pid);
  assert.equal(runReportRule(archived.rule, vn('2026-11-12')), null);
  assert.equal(runReportRule({ epicKey: 'KHONG-1', week1Thursday: '2026-10-01', firstThursday: '2026-11-12' }, vn('2026-11-12')), null);
});

test('người thực hiện cũ đã rời dự án thì giao cho người của Epic', () => {
  const s = setup();
  run('UPDATE issues SET assignee_id = ? WHERE id = ?', other, s.prev);
  const t = get<any>('SELECT * FROM issues WHERE key = ?', runReportRule(s.rule, vn('2026-11-12')))!;
  assert.equal(t.assignee_id, hiep);
});

test('job tổng không ném lỗi khi Epic thật chưa có trong CSDL', () => {
  assert.doesNotThrow(() => generateRecurringReports(vn('2026-11-12')));
});
