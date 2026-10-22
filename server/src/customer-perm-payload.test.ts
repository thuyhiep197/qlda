import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Mở CSDL trong thư mục tạm, dựng một khách hàng có dự án (gắn dự án sản xuất), việc, trao đổi, tài liệu, lịch gọi, hành trình;
// gọi API thật (3 router của phân hệ Khách hàng) với người dùng thiếu từng ô quyền
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-cpayload-'));
const { migrate, run, get } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const salesProjectRoutes = (await import('./routes/sales-projects.ts')).default;
const customerWorkRoutes = (await import('./routes/customer-work.ts')).default;
const customerRoutes = (await import('./routes/customers.ts')).default;

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, roleId: number | null, isAdmin = 0) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES (?, ?, 'x', ?, ?)", username, username, roleId, isAdmin).id;

const BASE = ['customer.view', 'customer.view_all', 'sales_project.view'];
const bare = user('bare', role('Chỉ xem khách hàng', BASE));
const journeyOnly = user('journey', role('Xem hành trình', [...BASE, 'journey.view']));
const projectCreator = user('creator', role('Tạo dự án', ['project.create']));
const admin = user('admin', null, 1);

const past = '2020-01-01';
const cust = run("INSERT INTO customers(name) VALUES ('Sở Y')").id;
const prod = run("INSERT INTO projects(key, name, type, customer_id) VALUES ('SY', 'Sản xuất Y', 'scrum', ?)", cust).id;
const sp = run("INSERT INTO sales_projects(customer_id, code, name, project_id) VALUES (?, 'SY-01', 'Dự án Y', ?)", cust, prod).id;
const step = run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title, assignee_id, due_date) VALUES (?, ?, 10, 1, 'Bước 1', ?, ?)",
  cust, sp, bare, past).id;
run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title, assignee_id, due_date) VALUES (?, ?, 20, 1, 'Bước 2', ?, ?)", cust, sp, admin, past);
run("INSERT INTO customer_tasks(customer_id, sales_project_id, title, assignee_id, due_date) VALUES (?, ?, 'Gửi báo giá', ?, ?)", cust, sp, bare, past);
run("INSERT INTO customer_tasks(customer_id, sales_project_id, title, assignee_id, due_date) VALUES (?, ?, 'Gọi lại', ?, ?)", cust, sp, admin, past);
run("INSERT INTO customer_activities(customer_id, user_id, kind, activity_date, content) VALUES (?, ?, 'meeting', '2026-01-05', 'Gặp khách')", cust, admin);
run("INSERT INTO customer_activities(customer_id, user_id, kind, activity_date, content, step_id, sales_project_id) VALUES (?, ?, 'internal', '2026-01-06', 'Bàn về bước', ?, ?)", cust, admin, step, sp);
run("INSERT INTO customer_files(customer_id, uploader_id, filename, stored_name, step_id, sales_project_id) VALUES (?, ?, 'ketqua.pdf', 'x.pdf', ?, ?)", cust, admin, step, sp);
run("INSERT INTO customer_calls(customer_id, sales_project_id, call_date, assignee_id, created_by) VALUES (?, ?, ?, ?, ?)", cust, sp, past, admin, admin);

// Ứng dụng thử: người dùng theo header x-user, lỗi quyền → mã HTTP như server thật
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user']))!; next(); });
app.use('/api/customers', salesProjectRoutes, customerWorkRoutes, customerRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, url: string) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/customers${url}`, { headers: { 'x-user': String(userId) } });
  return { status: r.status, body: await r.json() as any };
};

test('pickers of the project form (customer names, customer project names) need Dự án – Thêm or Sửa', async () => {
  assert.equal((await api(bare, '/names')).status, 403);
  assert.equal((await api(bare, `/${cust}/project-names`)).status, 403);
  assert.equal((await api(projectCreator, '/names')).status, 200);
  const names = await api(projectCreator, `/${cust}/project-names`);
  assert.equal(names.status, 200);
  assert.equal(names.body[0].code, 'SY-01');
});

test('customer list: open tasks, last activity, production count and project extras only with their view cells', async () => {
  const c = (await api(bare, '/')).body.find((x: any) => x.id === cust);
  assert.ok(!('open_tasks' in c));
  assert.equal(c.last_activity_date, null);
  assert.equal(c.project_count, null);
  const p = c.sales_projects[0];
  assert.ok(p.status === null || typeof p.status === 'string', 'auto status is sales-project data');
  assert.ok(!('open_tasks' in p) && !('journey_pct' in p) && !('journey_overdue' in p));
  assert.equal(p.call_alert, null);
  assert.equal(p.project_key, null);
  assert.equal(p.project_name, null);

  const full = (await api(admin, '/')).body.find((x: any) => x.id === cust);
  assert.equal(full.open_tasks, 2);
  assert.equal(full.last_activity_date, '2026-01-06');
  assert.equal(full.project_count, 1);
  const fp = full.sales_projects[0];
  assert.equal(fp.open_tasks, 2);
  assert.ok('journey_pct' in fp);
  assert.equal(typeof fp.journey_overdue, 'number');
  assert.equal(fp.call_alert.date, past);
  assert.equal(fp.project_key, 'SY');
});

test('customer detail no longer carries production issues; sales project detail strips the other functions', async () => {
  const c = (await api(bare, `/${cust}`)).body;
  assert.ok(!('issues' in c));
  assert.deepEqual([c.tasks, c.files, c.activities, c.projects], [[], [], [], []]);
  const p = (await api(bare, `/${cust}/projects/${sp}`)).body;
  assert.ok(!('open_tasks' in p) && !('journey_pct' in p));
  assert.equal(p.call_alert, null);
  assert.equal(p.project_key, null);
  assert.equal(p.production, null);
  const fp = (await api(admin, `/${cust}/projects/${sp}`)).body;
  assert.equal(fp.project_key, 'SY');
  assert.equal(fp.call_alert.count, 1);
});

test('dashboard summary: my tasks need Công việc – Xem, my steps need Hành trình – Xem + Dự án của khách hàng – Xem', async () => {
  const s = (await api(bare, '/summary')).body;
  assert.deepEqual(s.my_tasks, []);
  assert.deepEqual(s.my_steps, []);
  assert.deepEqual(s.overdue, { tasks: 0, steps: 0 });
  const j = (await api(journeyOnly, '/summary')).body;
  assert.deepEqual(j.my_tasks, []);
  assert.deepEqual(j.overdue, { tasks: 0, steps: 2 });
  const a = (await api(admin, '/summary')).body;
  assert.equal(a.my_tasks.length, 1);
  assert.equal(a.my_steps.length, 1);
  assert.deepEqual(a.overdue, { tasks: 2, steps: 2 });
});

test('journey: template needs Hành trình – Áp dụng mẫu; talk counts / files / step talk & files need Trao đổi – Xem / Tài liệu – Xem', async () => {
  assert.equal((await api(journeyOnly, '/journey-template')).status, 403);
  assert.equal((await api(admin, '/journey-template')).status, 200);
  assert.equal((await api(bare, `/${cust}/projects/${sp}/journey`)).status, 403);

  const j = (await api(journeyOnly, `/${cust}/projects/${sp}/journey`)).body;
  const st = j.steps.find((x: any) => x.id === step);
  assert.equal(st.talk_count, 0);
  assert.deepEqual(st.files, []);
  const d = (await api(journeyOnly, `/${cust}/journey/${step}`)).body;
  assert.deepEqual(d.activities, []);
  assert.deepEqual(d.files, []);

  const fj = (await api(admin, `/${cust}/projects/${sp}/journey`)).body.steps.find((x: any) => x.id === step);
  assert.equal(fj.talk_count, 1);
  assert.equal(fj.files.length, 1);
  const fd = (await api(admin, `/${cust}/journey/${step}`)).body;
  assert.equal(fd.activities.length, 1);
  assert.equal(fd.files.length, 1);
});
