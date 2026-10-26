import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Phân hệ Dự án: mỗi thao tác chỉ theo đúng ô quyền của nó (không suy từ thành viên / người tạo / người được giao).
// Mở CSDL trong thư mục tạm, dựng một dự án gắn khách hàng rồi gọi API thật với người dùng thiếu từng ô quyền.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-pperm-'));
const { migrate, run, get, all } = await import('./db.ts');
const { seedRoles, HttpError, ALL_PERMISSIONS } = await import('./permissions.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const projectRoutes = (await import('./routes/projects.ts')).default;
const issueRoutes = (await import('./routes/issues.ts')).default;
const issueExtraRoutes = (await import('./routes/issue-extras.ts')).default;
const reportRoutes = (await import('./routes/reports.ts')).default;

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, roleId: number) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id) VALUES (?, ?, 'x', ?)", username, username, roleId).id;

const cust = run("INSERT INTO customers(name, code, status, source) VALUES ('Sở Z', 'SZ', 'Mới', 'Giới thiệu')").id;
run("INSERT INTO customer_contacts(customer_id, full_name, phone, email) VALUES (?, 'Anh A', '0900', 'a@x.vn')", cust);
const pid = run("INSERT INTO projects(key, name, type, description, priority, customer_id, customer) VALUES ('PZ', 'Dự án Z', 'scrum', 'Mô tả', 'Cao', ?, 'Sở Z')", cust).id;
run("INSERT INTO sales_projects(customer_id, code, name, project_id) VALUES (?, 'SZ-01', 'Dự án KH Z', ?)", cust, pid);
const [todo, doing] = ['Cần làm', 'Đang làm'].map((n, i) => run('INSERT INTO statuses(project_id, name, category, position) VALUES (?, ?, ?, ?)', pid, n, i ? 'inprogress' : 'todo', i).id);
const sprint = run("INSERT INTO sprints(project_id, name) VALUES (?, 'Sprint 1')", pid).id;

const WORK = ['dashboard.view', 'plan.view', 'issue.view', 'issue.create', 'issue_own.edit', 'transition.edit'];
const worker = user('worker', role('Làm việc', WORK));
const assigner = user('assigner', role('Giao việc', [...WORK, 'assign.edit', 'backlog.edit']));
const board = user('board', role('Chỉ xem kế hoạch', ['plan.view', 'dashboard.view']));
const issueOnly = user('issueonly', role('Chỉ xem issue', ['issue.view']));
const crm = user('crm', role('Khách hàng không dự án KH', ['plan.view', 'project.view', 'customer.view']));
const crmFull = user('crmfull', role('Khách hàng đủ', ['plan.view', 'project.view', 'customer.view', 'sales_project.view']));
const archiver = user('archiver', role('Lưu trữ dự án', ['plan.view', 'project.delete']));
for (const u of [worker, assigner, board, issueOnly, crm, crmFull, archiver]) {
  run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?, ?, (SELECT default_role_id FROM users WHERE id = ?))', pid, u, u);
}
const outsider = user('outsider', role('Lưu trữ, không là thành viên', ['plan.view', 'project.delete']));

// Ứng dụng thử: người dùng theo header x-user, lỗi quyền → mã HTTP như server thật
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user']))!; next(); });
app.use('/api/projects', projectRoutes);
app.use('/api/issues', issueExtraRoutes, issueRoutes);
app.use('/api/reports', reportRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, method: string, url: string, body?: unknown) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'x-user': String(userId), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as any };
};

test('issue list accepts any screen view cell (Kế hoạch, Danh sách, Sprint, Backlog); Issue – Xem alone is not a list', async () => {
  run("INSERT INTO issues(project_id, number, key, type, summary, status_id, rank) VALUES (?, 1, 'PZ-1', 'task', 'Việc 1', ?, 1000)", pid, todo);
  run('UPDATE projects SET issue_seq = 1 WHERE id = ?', pid);
  const ok = await api(board, 'GET', '/issues?project=PZ');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.length, 1);
  assert.ok(!('time_spent' in ok.body[0]), 'logged time needs Ghi thời gian – Xem');
  assert.equal((await api(issueOnly, 'GET', '/issues?project=PZ')).status, 403);
  // Mở chi tiết issue cần Issue – Xem
  assert.equal((await api(board, 'GET', '/issues/PZ-1')).status, 403);
  assert.equal((await api(issueOnly, 'GET', '/issues/PZ-1')).status, 200);
});

test('self-assigning, moving to a sprint and ranking need their own cells, not issue edit rights', async () => {
  const mine = await api(worker, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Của tôi' });
  assert.equal(mine.status, 201, mine.body.error);
  // Người tạo sửa được issue của mình nhưng không tự giao việc, đổi sprint, sắp xếp
  assert.equal((await api(worker, 'PATCH', `/issues/${mine.body.key}`, { summary: 'Đổi tên' })).status, 200);
  assert.equal((await api(worker, 'PATCH', `/issues/${mine.body.key}`, { assignee_id: worker })).status, 403);
  assert.equal((await api(worker, 'PATCH', `/issues/${mine.body.key}`, { sprint_id: sprint })).status, 403);
  assert.equal((await api(worker, 'PATCH', `/issues/${mine.body.key}`, { rank: 5 })).status, 403);
  assert.equal((await api(worker, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Tự nhận', assignee_id: worker })).status, 403);
  assert.equal((await api(worker, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Vào sprint', sprint_id: sprint })).status, 403);
  // Có Giao việc, Sửa Backlog thì được
  assert.equal((await api(assigner, 'PATCH', `/issues/${mine.body.key}`, { assignee_id: assigner, sprint_id: sprint, rank: 5 })).status, 200);
  const created = await api(assigner, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Giao luôn', assignee_id: worker, sprint_id: sprint });
  assert.equal(created.status, 201);
  assert.equal(created.body.assignee_id, worker);
  // Nhân bản không giữ người thực hiện / sprint khi thiếu quyền
  const clone = await api(worker, 'POST', `/issues/${created.body.key}/clone`, {});
  assert.equal(clone.status, 201);
  assert.equal(clone.body.assignee_id, null);
  assert.equal(clone.body.sprint_id, null);
});

test('creating an issue in a non-initial status needs Chuyển trạng thái', async () => {
  const noTransition = user('notransition', role('Tạo không chuyển', ['plan.view', 'issue.view', 'issue.create']));
  run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?, ?, (SELECT default_role_id FROM users WHERE id = ?))', pid, noTransition, noTransition);
  assert.equal((await api(noTransition, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Đang làm', status_id: doing })).status, 403);
  assert.equal((await api(noTransition, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Cần làm', status_id: todo })).status, 201);
  assert.equal((await api(worker, 'POST', '/issues', { project_key: 'PZ', type: 'task', summary: 'Đang làm', status_id: doing })).status, 201);
});

test('project payload: info-tab fields need Dự án – Xem; customer shows only its name without Thông tin khách hàng – Xem', async () => {
  const p = (await api(board, 'GET', '/projects/PZ')).body;
  assert.equal(p.description, null);
  assert.equal(p.priority, null);
  assert.equal(p.customer, 'Sở Z');
  assert.deepEqual(Object.keys(p.customer_info).sort(), ['contacts', 'id', 'name', 'sales_project']);
  assert.equal(p.customer_info.name, 'Sở Z');
  assert.deepEqual(p.customer_info.contacts, []);
  assert.equal(p.customer_info.sales_project, null);
  assert.ok(p.statuses.length && p.members.length, 'statuses and members stay for the other screens');

  const c = (await api(crm, 'GET', '/projects/PZ')).body;
  assert.equal(c.description, 'Mô tả');
  assert.equal(c.customer_info.code, 'SZ');
  assert.equal(c.customer_info.contacts[0].phone, '0900');
  assert.equal(c.customer_info.sales_project, null, 'linked customer project needs Dự án của khách hàng – Xem');
  assert.equal((await api(crmFull, 'GET', '/projects/PZ')).body.customer_info.sales_project.code, 'SZ-01');
});

test('archiving needs Dự án – Lưu trữ on a project I can open; archived list is not admin-only', async () => {
  assert.equal((await api(outsider, 'POST', '/projects/PZ/archive', { archived: true })).status, 403);
  assert.equal((await api(worker, 'POST', '/projects/PZ/archive', { archived: true })).status, 403);
  assert.equal((await api(archiver, 'POST', '/projects/PZ/archive', { archived: true })).status, 200);
  assert.deepEqual((await api(archiver, 'GET', '/projects?archived=1')).body.map((x: any) => x.key), ['PZ']);
  assert.deepEqual((await api(worker, 'GET', '/projects?archived=1')).body.map((x: any) => x.key), []);
  assert.equal((await api(archiver, 'POST', '/projects/PZ/archive', { archived: false })).status, 200);
});

test('sprint list, worklog and sprint reports, home dashboard follow their view cells', async () => {
  assert.equal((await api(board, 'GET', '/projects/PZ/sprints')).status, 403);
  assert.equal((await api(issueOnly, 'GET', '/projects/PZ/sprints')).status, 200);
  assert.equal((await api(board, 'GET', '/reports/projects/PZ/worklogs')).status, 403);
  assert.equal((await api(board, 'GET', '/reports/projects/PZ/velocity')).status, 403);
  const dash = (await api(board, 'GET', '/reports/dashboard')).body;
  assert.deepEqual([dash.mine, dash.activity, dash.toTest], [[], [], []]);
  assert.ok(!('myModules' in dash));
  assert.ok((await api(worker, 'GET', '/reports/dashboard')).body.activity.length > 0);
  // Phân hệ Dashboard cần Dashboard – Xem
  assert.equal((await api(issueOnly, 'GET', '/reports/dashboard')).status, 403);
});

// Chạy sau cùng: bước v30 chạy lại trên mọi nhóm người dùng của CSDL thử
test('migration v30 grants Dự án – Xem to roles and user extras with any project-module cell', () => {
  const plain = role('Cũ: có ô dự án', ['issue.view', 'comment.view']);
  const crmOnly = role('Cũ: chỉ khách hàng', ['customer.view']);
  const extra = user('extra', crmOnly);
  run("INSERT INTO user_permissions(user_id, permission, effect) VALUES (?, 'plan.view', 'allow')", extra);
  const sales = user('sales', crmOnly);
  // Chạy lại bước v30 trên dữ liệu đang ở v29 (gỡ cột của các bước sau để chạy lại được)
  const toV29 = () => { run('ALTER TABLE users DROP COLUMN failed_logins'); run('PRAGMA user_version = 29'); };
  toV29();
  migrate();
  const perms = (id: number) => JSON.parse(get<{ permissions: string }>('SELECT permissions FROM roles WHERE id = ?', id)!.permissions) as string[];
  assert.ok(perms(plain).includes('project.view'));
  assert.ok(!perms(crmOnly).includes('project.view'));
  assert.equal(perms(plain).filter((p) => p === 'project.view').length, 1);
  const extras = (id: number) => all<{ permission: string }>("SELECT permission FROM user_permissions WHERE user_id = ? AND effect = 'allow'", id).map((x) => x.permission);
  assert.ok(extras(extra).includes('project.view'));
  assert.ok(!extras(sales).includes('project.view'));
  assert.ok(ALL_PERMISSIONS.includes('project.view'));
  // BA Lead (toàn quyền) có sẵn ô mới
  assert.ok(perms(get<{ id: number }>("SELECT id FROM roles WHERE name = 'BA Lead'")!.id).includes('project.view'));
  // Mọi nhóm (trừ Quản trị hệ thống) có Dashboard – Xem và Tài liệu nội bộ Xem, Xem tất cả, Thêm, Tải về; Sửa / Xóa giữ nguyên
  const NEW = ['dashboard.view', 'document.view', 'document.view_all', 'document.create', 'document.export'];
  for (const r of all<{ id: number; is_admin: number }>('SELECT id, is_admin FROM roles')) {
    for (const p of NEW) assert.equal(perms(r.id).filter((x) => x === p).length, r.is_admin ? 0 : 1, `role ${r.id}: ${p}`);
  }
  assert.ok(!perms(crmOnly).includes('document.edit') && !perms(crmOnly).includes('document.delete'));
  // Chạy lại lần nữa không nhân đôi
  toV29();
  migrate();
  for (const p of NEW) assert.equal(perms(plain).filter((x) => x === p).length, 1);
});
