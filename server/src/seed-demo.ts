/**
 * Tạo dữ liệu mẫu để dùng thử: vài người dùng, 1 dự án Scrum có epic/story/bug và sprint đang chạy.
 * Chạy: npm run seed:demo   (chỉ chạy khi chưa có dự án DEMO)
 */
import { get, migrate, run } from './db.ts';
import { ensureAdmin, hashPassword } from './auth.ts';
import { seedRoles, type AuthUser } from './permissions.ts';
import { createIssue, updateIssue, type IssueRow } from './issues.ts';
import { ALL_PERMISSIONS } from './permissions.ts';

migrate();
seedRoles();
ensureAdmin();

if (get("SELECT 1 FROM projects WHERE key = 'DEMO'")) {
  console.log('Dự án DEMO đã tồn tại, bỏ qua.');
  process.exit(0);
}

const role = (name: string) => get('SELECT id FROM roles WHERE name = ?', name)!.id;
const people = [
  ['ba.lan', 'Nguyễn Thị Lan', 'BA'],
  ['dev.minh', 'Trần Văn Minh', 'Dev'],
  ['dev.hung', 'Lê Quốc Hùng', 'Dev'],
  ['qa.thao', 'Phạm Thu Thảo', 'BA'],
];
const ids: Record<string, number> = {};
for (const [u, name] of people) {
  ids[u] = get('SELECT id FROM users WHERE username = ?', u)?.id ??
    run('INSERT INTO users(username, full_name, password_hash) VALUES (?,?,?)', u, name, hashPassword('Demo@123')).id;
}
const admin = get<AuthUser>('SELECT * FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1')!;

const pid = run("INSERT INTO projects(key, name, description, type, lead_id) VALUES ('DEMO', 'Cổng dịch vụ công', 'Dự án mẫu để dùng thử', 'scrum', ?)", admin.id).id;
[['Cần làm', 'todo'], ['Đang làm', 'inprogress'], ['Đang review', 'inprogress'], ['Kiểm thử', 'inprogress'], ['Hoàn thành', 'done']]
  .forEach(([n, c], i) => run('INSERT INTO statuses(project_id, name, category, position) VALUES (?,?,?,?)', pid, n, c, i));
run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?,?,?)', pid, admin.id, role('BA Lead'));
for (const [u, , r] of people) run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?,?,?)', pid, ids[u], role(r));

const perms = new Set(ALL_PERMISSIONS);
const st = (name: string) => get('SELECT id FROM statuses WHERE project_id = ? AND name = ?', pid, name)!.id;
const mk = (d: any) => createIssue(admin, pid, perms, d);
const upd = (i: any, d: any) => updateIssue(admin, get<IssueRow>('SELECT * FROM issues WHERE id = ?', i.id)!, perms, d);

const today = new Date();
const iso = (offset: number) => new Date(today.getTime() + offset * 86400_000).toISOString().slice(0, 10);

const e1 = mk({ type: 'epic', summary: 'Đăng nhập & tài khoản công dân', start_date: iso(-20), due_date: iso(10) });
const e2 = mk({ type: 'epic', summary: 'Nộp hồ sơ trực tuyến', start_date: iso(-5), due_date: iso(40) });
const e3 = mk({ type: 'epic', summary: 'Tra cứu & thanh toán phí', start_date: iso(20), due_date: iso(70) });

run("INSERT INTO sprints(project_id, name, goal) VALUES (?, 'DEMO Sprint 1', 'Hoàn thiện luồng đăng nhập')", pid);
run('UPDATE projects SET sprint_seq = 2 WHERE id = ?', pid);
const sprint1 = get('SELECT id FROM sprints WHERE project_id = ?', pid)!.id;
const sprint2 = run("INSERT INTO sprints(project_id, name) VALUES (?, 'DEMO Sprint 2')", pid).id;

const items = [
  { type: 'story', summary: 'Đăng nhập bằng tài khoản VNeID', parent_id: e1.id, story_points: 8, assignee_id: ids['dev.minh'], priority: 'high', sprint_id: sprint1 },
  { type: 'story', summary: 'Quên mật khẩu qua email/SMS', parent_id: e1.id, story_points: 5, assignee_id: ids['dev.hung'], sprint_id: sprint1 },
  { type: 'story', summary: 'Quản lý thông tin cá nhân', parent_id: e1.id, story_points: 3, assignee_id: ids['dev.minh'], sprint_id: sprint1 },
  { type: 'bug', summary: 'Lỗi hiển thị captcha trên Safari', parent_id: e1.id, story_points: 2, assignee_id: ids['dev.hung'], priority: 'highest', sprint_id: sprint1, labels: ['frontend'] },
  { type: 'task', summary: 'Viết test case luồng đăng nhập', story_points: 3, assignee_id: ids['qa.thao'], sprint_id: sprint1, labels: ['testing'] },
  { type: 'story', summary: 'Form nộp hồ sơ nhiều bước', parent_id: e2.id, story_points: 13, assignee_id: ids['ba.lan'], sprint_id: sprint2 },
  { type: 'story', summary: 'Đính kèm giấy tờ và ký số', parent_id: e2.id, story_points: 8, sprint_id: sprint2 },
  { type: 'story', summary: 'Theo dõi trạng thái hồ sơ', parent_id: e2.id, story_points: 5 },
  { type: 'story', summary: 'Tra cứu hồ sơ theo mã', parent_id: e3.id, story_points: 3 },
  { type: 'story', summary: 'Tích hợp cổng thanh toán', parent_id: e3.id, story_points: 8, labels: ['integration'] },
  { type: 'task', summary: 'Phân tích yêu cầu báo cáo thống kê', assignee_id: ids['ba.lan'] },
];
const created = items.map((d) => mk({ ...d, description: 'Mô tả chi tiết yêu cầu...\n\n**Tiêu chí chấp nhận:**\n- Tiêu chí 1\n- Tiêu chí 2' }));
mk({ type: 'subtask', summary: 'Thiết kế màn hình đăng nhập', parent_id: created[0].id, assignee_id: ids['ba.lan'] });
mk({ type: 'subtask', summary: 'API xác thực OAuth2', parent_id: created[0].id, assignee_id: ids['dev.minh'] });

// Bắt đầu sprint 1 cách đây 6 ngày và mô phỏng tiến độ
const startedAt = new Date(today.getTime() - 6 * 86400_000);
const pts = get("SELECT COUNT(*) c, SUM(story_points) p FROM issues WHERE sprint_id = ? AND type <> 'subtask'", sprint1)!;
run("UPDATE sprints SET state = 'active', start_date = ?, end_date = ?, started_at = ?, committed_points = ?, committed_issues = ? WHERE id = ?",
  iso(-6), iso(8), startedAt.toISOString(), pts.p, pts.c, sprint1);
run("UPDATE issue_history SET created_at = ? WHERE created_at > ?", new Date(startedAt.getTime() - 3600_000).toISOString(), startedAt.toISOString());

upd(created[3], { status_id: st('Hoàn thành') });
upd(created[2], { status_id: st('Hoàn thành') });
upd(created[0], { status_id: st('Đang làm') });
upd(created[1], { status_id: st('Đang review') });
upd(created[4], { status_id: st('Đang làm') });
// Dời mốc thời gian lịch sử hoàn thành để biểu đồ burndown có hình dạng
const backdate = (issueId: number, days: number) =>
  run("UPDATE issue_history SET created_at = ? WHERE issue_id = ? AND field = 'status'", new Date(today.getTime() - days * 86400_000).toISOString(), issueId);
backdate(created[3].id, 4);
backdate(created[2].id, 2);
run('UPDATE issues SET resolved_at = ? WHERE id = ?', new Date(today.getTime() - 4 * 86400_000).toISOString(), created[3].id);
run('UPDATE issues SET resolved_at = ? WHERE id = ?', new Date(today.getTime() - 2 * 86400_000).toISOString(), created[2].id);

console.log('Đã tạo dữ liệu mẫu: dự án DEMO, người dùng ba.lan / dev.minh / dev.hung / qa.thao (mật khẩu Demo@123)');
