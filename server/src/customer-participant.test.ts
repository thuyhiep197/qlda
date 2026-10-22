import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Người chỉ tham gia hành trình / công việc / trao đổi (không có Thông tin khách hàng – Xem):
// dùng phân hệ Khách hàng với ô Xem của module mình tham gia, chỉ thấy tên khách hàng và dự án mình tham gia.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-cpart-'));
const { migrate, run, get, all } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const salesProjectRoutes = (await import('./routes/sales-projects.ts')).default;
const customerWorkRoutes = (await import('./routes/customer-work.ts')).default;
const customerRoutes = (await import('./routes/customers.ts')).default;
const notificationRoutes = (await import('./routes/notifications.ts')).default;
const searchRoutes = (await import('./routes/search.ts')).default;
const { notifyCustomer, mentionedCustomerUsers } = await import('./notify.ts');

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, roleId: number | null, isAdmin = 0) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES (?, ?, 'x', ?, ?)", username, username, roleId, isAdmin).id;

const journeyOnly = user('jp', role('Chỉ hành trình', ['dashboard.view', 'journey.view']));
const journeyPlus = user('jps', role('Hành trình + dự án', ['dashboard.view', 'journey.view', 'sales_project.view']));
const worker = user('worker', role('Tham gia việc, trao đổi', ['dashboard.view', 'ctask.view', 'ctask.create', 'ctalk.view', 'ctalk.create', 'journey.view']));
const noCells = user('nocell', role('Không có ô phân hệ Khách hàng', ['dashboard.view']));
const noDash = user('nodash', role('Hành trình, không Dashboard', ['journey.view']));
const sale = user('sale', role('Sale', ['customer.view']));
const admin = user('admin', null, 1);

const past = '2020-01-01';
run("INSERT INTO geo_provinces(code, name) VALUES ('01', 'Hà Nội')");
const cust = run("INSERT INTO customers(name, province_code, status, source) VALUES ('Sở A', '01', 'Đang chăm sóc', 'Website')").id;
run("INSERT INTO customer_contacts(customer_id, full_name, phone) VALUES (?, 'Ông B', '0900')", cust);
run("INSERT INTO customer_owners(customer_id, user_id, role) VALUES (?, ?, 'kd')", cust, sale);
const other = run("INSERT INTO customers(name) VALUES ('Sở Khác')").id;
const spIn = run("INSERT INTO sales_projects(customer_id, code, name, note) VALUES (?, 'SA-01', 'Dự án tham gia', 'ghi chú')", cust).id;
const spOut = run("INSERT INTO sales_projects(customer_id, code, name) VALUES (?, 'SA-02', 'Dự án khác')", cust).id;
const spOther = run("INSERT INTO sales_projects(customer_id, code, name) VALUES (?, 'SK-01', 'Dự án KH khác')", other).id;
run("INSERT INTO sales_project_owners(sales_project_id, user_id, role) VALUES (?, ?, 'kd')", spIn, sale);
const step = (sp: number, c: number, pos: number, title: string, assignee: number | null) =>
  run('INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title, assignee_id, due_date) VALUES (?, ?, ?, 1, ?, ?, ?)', c, sp, pos, title, assignee, past).id;
const myStep = step(spIn, cust, 10, 'Khảo sát', journeyOnly);
step(spIn, cust, 20, 'Báo giá', admin);
const outStep = step(spOut, cust, 10, 'Khảo sát dự án khác', admin);
step(spOther, other, 10, 'Khảo sát KH khác', admin);
run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', myStep, journeyPlus);
run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', myStep, worker);
run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', myStep, noCells);
run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', myStep, noDash);
run("INSERT INTO customer_tasks(customer_id, title, assignee_id, due_date) VALUES (?, 'Việc chung', ?, ?)", cust, worker, past);
run("INSERT INTO customer_tasks(customer_id, sales_project_id, title, assignee_id, due_date) VALUES (?, ?, 'Việc dự án', ?, ?)", cust, spIn, worker, past);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user']))!; next(); });
app.use('/api/customers', salesProjectRoutes, customerWorkRoutes, customerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const call = async (userId: number, url: string, method = 'GET', body?: unknown) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'x-user': String(userId), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() as any };
};
const api = (userId: number, url: string, method?: string, body?: unknown) => call(userId, `/customers${url}`, method, body);

test('list without Thông tin khách hàng – Xem: only customers holding my projects, name + province only, only my projects', async () => {
  const list = (await api(journeyOnly, '/')).body;
  assert.deepEqual(list.map((c: any) => c.id), [cust]);
  const c = list[0];
  assert.deepEqual(Object.keys(c).sort(), ['id', 'is_archived', 'is_mine', 'name', 'province_code', 'province_name', 'sales_projects']);
  assert.equal(c.province_name, 'Hà Nội');
  assert.deepEqual(c.sales_projects.map((p: any) => p.id), [spIn]);
  const p = c.sales_projects[0];
  assert.equal(p.name, 'Dự án tham gia');
  for (const k of ['code', 'status', 'note', 'kd_names', 'product_name']) assert.ok(!(k in p), `no ${k}`);
  assert.ok('journey_pct' in p, 'journey progress follows Hành trình – Xem');

  const plus = (await api(journeyPlus, '/')).body[0].sales_projects[0];
  assert.equal(plus.code, 'SA-01');
  assert.equal(plus.kd_names, 'sale');
  assert.equal((await api(noCells, '/')).status, 403);
});

test('customer screen and customer-level items need Thông tin khách hàng – Xem', async () => {
  assert.equal((await api(journeyOnly, `/${cust}`)).status, 403);
  assert.equal((await api(worker, `/${cust}`)).status, 403);
  assert.equal((await api(sale, `/${cust}`)).status, 200);
  // Việc / trao đổi chung của khách hàng: không; của dự án mình tham gia: có
  assert.equal((await api(worker, `/${cust}/tasks`, 'POST', { title: 'Chung' })).status, 403);
  assert.equal((await api(worker, `/${cust}/tasks`, 'POST', { title: 'Của dự án', sales_project_id: spIn })).status, 201);
  assert.equal((await api(worker, `/${cust}/tasks`, 'POST', { title: 'Ngoài phạm vi', sales_project_id: spOut })).status, 403);
  assert.equal((await api(worker, `/${cust}/activities`, 'POST', { kind: 'internal', content: 'chung' })).status, 403);
  assert.equal((await api(worker, `/${cust}/activities`, 'POST', { kind: 'internal', content: 'dự án', sales_project_id: spIn })).status, 201);
});

test('customer project screen: reachable in scope; project info only with Dự án của khách hàng – Xem', async () => {
  const p = await api(journeyOnly, `/${cust}/projects/${spIn}`);
  assert.equal(p.status, 200);
  assert.equal(p.body.name, 'Dự án tham gia');
  assert.equal(p.body.customer_name, 'Sở A');
  for (const k of ['code', 'status', 'note', 'kd_names', 'kd_ids', 'product_type_name']) assert.ok(!(k in p.body), `no ${k}`);
  assert.deepEqual(p.body.tasks, []);
  assert.equal((await api(journeyOnly, `/${cust}/projects/${spOut}`)).status, 403);

  const plus = (await api(journeyPlus, `/${cust}/projects/${spIn}`)).body;
  assert.equal(plus.code, 'SA-01');
  assert.equal(plus.note, 'ghi chú');
  assert.deepEqual(plus.kd_ids, [sale]);
  // Công việc của dự án theo Công việc – Xem, không cần thông tin dự án
  const w = (await api(worker, `/${cust}/projects/${spIn}`)).body;
  assert.ok(w.tasks.some((t: any) => t.title === 'Việc dự án'));
  assert.ok(!('code' in w));
});

test('journey: the whole journey of an in-scope project with Hành trình – Xem; updates need Hành trình – Cập nhật', async () => {
  const j = await api(journeyOnly, `/${cust}/projects/${spIn}/journey`);
  assert.equal(j.status, 200);
  assert.equal(j.body.steps.length, 2);
  assert.equal((await api(journeyOnly, `/${cust}/journey/${myStep}`)).status, 200);
  assert.equal((await api(journeyOnly, `/${cust}/journey/${outStep}`)).status, 403);
  assert.equal((await api(journeyOnly, `/${cust}/journey/${myStep}`, 'PATCH', { status: 'doing' })).status, 403);
  assert.equal((await api(sale, `/${cust}/projects/${spIn}/journey`)).status, 403);
});

test('dashboard summary: Dashboard – Xem required; counts by status need Thông tin khách hàng – Xem; steps need only Hành trình – Xem', async () => {
  assert.equal((await api(noDash, '/summary')).status, 403);
  assert.equal((await api(noCells, '/summary')).status, 403);
  const s = (await api(journeyOnly, '/summary')).body;
  assert.equal(s.total, 0);
  assert.deepEqual(s.by_status, []);
  assert.deepEqual(s.my_steps.map((x: any) => [x.id, x.sales_project_name]), [[myStep, 'Dự án tham gia']]);
  assert.equal(s.overdue.steps, 2, 'only steps of projects in scope');
  // Việc chung của khách hàng không hiện khi không có Thông tin khách hàng – Xem
  const w = (await api(worker, '/summary')).body;
  assert.ok(w.my_tasks.every((t: any) => t.sales_project_id === spIn));
  assert.ok(w.my_tasks.length >= 1);
});

test('notifications: module cell + project scope, not Thông tin khách hàng – Xem', async () => {
  run('DELETE FROM notifications');
  notifyCustomer([journeyOnly, worker, sale], admin, cust, 'assigned', `step:${myStep}`, 'bước');
  notifyCustomer([journeyOnly, worker], admin, cust, 'assigned', `tasks:${spIn}`, 'việc dự án');
  notifyCustomer([worker], admin, cust, 'assigned', 'tasks', 'việc chung');
  notifyCustomer([worker], admin, cust, 'assigned', `call:${spOut}`, 'lịch gọi ngoài phạm vi');
  const got = (uid: number) => all<{ link: string }>('SELECT link FROM notifications WHERE user_id = ? ORDER BY id', uid).map((n) => n.link);
  assert.deepEqual(got(journeyOnly), [`step:${myStep}`]);
  assert.deepEqual(got(worker), [`step:${myStep}`, `tasks:${spIn}`]);
  assert.deepEqual(got(sale), [], 'sale has no Hành trình – Xem');
  assert.deepEqual(mentionedCustomerUsers('@worker xem', cust, 'info'), []);
  // Chỉ người của dự án (Sale / AM / BA / Dev / Tester) được nhắc: người được giao việc chưa có tên ở dự án thì không
  assert.deepEqual(mentionedCustomerUsers('@worker xem', cust, `info:${spIn}`), []);
  run("INSERT INTO sales_project_owners(sales_project_id, user_id, role) VALUES (?, ?, 'dev')", spIn, worker);
  assert.deepEqual(mentionedCustomerUsers('@worker xem', cust, `info:${spIn}`), [worker]);
  run("DELETE FROM sales_project_owners WHERE sales_project_id = ? AND user_id = ?", spIn, worker);

  const bell = (await call(journeyOnly, '/notifications')).body;
  assert.equal(bell.items.length, 1);
  assert.equal(bell.items[0].sales_project_id, spIn);
  // Quyền bị bỏ sau khi đã nhận → ẩn lúc đọc
  run("INSERT INTO notifications(user_id, actor_id, customer_id, link, type, text, created_at) VALUES (?, ?, ?, 'tasks', 'assigned', 'cũ', '2026-01-01')", journeyOnly, admin, cust);
  assert.equal((await call(journeyOnly, '/notifications')).body.items.length, 1);
});

test('global search: customers need Thông tin khách hàng – Xem; steps need Hành trình – Xem in my projects', async () => {
  const r = (await call(journeyOnly, `/search?q=${encodeURIComponent('khảo sát')}`)).body;
  assert.deepEqual(r.customers, []);
  assert.deepEqual(r.steps.map((s: any) => s.id), [myStep]);
  const c = (await call(sale, `/search?q=${encodeURIComponent('sở a')}`)).body;
  assert.deepEqual(c.customers.map((x: any) => x.id), [cust]);
  assert.deepEqual(c.steps, []);
});

test('global search: internal documents need Tài liệu nội bộ – Xem (own uploads) or Xem tất cả (all)', async () => {
  const docReader = user('docreader', role('Xem tài liệu của mình', ['document.view']));
  const docAll = user('docall', role('Xem mọi tài liệu', ['document.view', 'document.view_all']));
  run("INSERT INTO doc_files(filename, stored_name, uploader_id) VALUES ('quy-che.pdf', 'a', ?)", docReader);
  run("INSERT INTO doc_files(filename, stored_name, uploader_id) VALUES ('quy-dinh.pdf', 'b', ?)", admin);
  const names = async (uid: number) => (await call(uid, '/search?q=quy')).body.docs.map((d: any) => d.filename);
  assert.deepEqual(await names(journeyOnly), []);
  assert.deepEqual(await names(docReader), ['quy-che.pdf']);
  assert.deepEqual(await names(docAll), ['quy-che.pdf', 'quy-dinh.pdf']);
});

test('"Khách hàng của tôi" = customers I take part in, even with Xem tất cả khách hàng (with or without Thông tin khách hàng – Xem)', async () => {
  const allNoInfo = user('allnoinfo', role('Xem tất cả, không xem thông tin', ['dashboard.view', 'sales_project.view', 'customer.view_all']));
  const allInfo = user('allinfo', role('Xem tất cả + thông tin', ['dashboard.view', 'customer.view', 'customer.view_all']));
  for (const u of [allNoInfo, allInfo]) {
    const list = (await api(u, '/')).body;
    assert.deepEqual(list.map((c: any) => c.id).sort(), [cust, other].sort());
    assert.ok(list.every((c: any) => !c.is_mine), 'không tham gia khách hàng nào');
  }
  run("INSERT INTO sales_project_owners(sales_project_id, user_id, role) VALUES (?, ?, 'ba')", spOther, allNoInfo);
  const mine = (await api(allNoInfo, '/')).body.filter((c: any) => c.is_mine).map((c: any) => c.id);
  assert.deepEqual(mine, [other]);
});
