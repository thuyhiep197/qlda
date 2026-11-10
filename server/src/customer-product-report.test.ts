import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Một dự án của khách hàng chọn nhiều sản phẩm; báo cáo khách hàng theo sản phẩm kèm hiện trạng tương tác, theo phạm vi và ô quyền của người xem.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-preport-'));
const { migrate, run, get, all, localDate } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const customerReportRoutes = (await import('./routes/customer-report.ts')).default;
const salesProjectRoutes = (await import('./routes/sales-projects.ts')).default;
const customerWorkRoutes = (await import('./routes/customer-work.ts')).default;
const customerRoutes = (await import('./routes/customers.ts')).default;
const productRoutes = (await import('./routes/products.ts')).default;

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, roleId: number | null, isAdmin = 0) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES (?, ?, 'x', ?, ?)", username, username, roleId, isAdmin).id;
const admin = user('admin', null, 1);
const sale = user('sale', role('Sale', ['customer.view', 'sales_project.view', 'ctalk.view']));
const projectOnly = user('ponly', role('Chỉ dự án KH', ['sales_project.view']));
const journeyOnly = user('jonly', role('Chỉ hành trình', ['journey.view']));

const typeId = get<{ id: number }>("SELECT id FROM product_types WHERE is_project = 0")!.id;
const product = (name: string) => get<{ id: number }>('SELECT id FROM products WHERE name = ?', name)!.id;
const imate = product('Trợ lý VBĐH (imate)'), ai = product('Trợ lý công chức AI'), meet = product('Trợ lý họp thông minh');

const customer = (name: string, status = 'Mới', archived = 0) => run('INSERT INTO customers(name, status, is_archived) VALUES (?, ?, ?)', name, status, archived).id;
const xa = customer('Xã A', 'Đang tư vấn'), so = customer('Sở B'), empty = customer('Phường C'), gone = customer('Đã lưu trữ', 'Mới', 1);
run("INSERT INTO customer_owners(customer_id, user_id, role) VALUES (?, ?, 'kd')", xa, sale);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user']))!; next(); });
app.use('/api/customers', customerReportRoutes, salesProjectRoutes, customerWorkRoutes, customerRoutes);
app.use('/api/products', productRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, url: string, method = 'GET', body?: unknown) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'x-user': String(userId), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() as any };
};
const addProject = async (customerId: number, body: Record<string, unknown>) => (await api(admin, `/customers/${customerId}/projects`, 'POST', body)).body;

let combo: any, single: any, bare: any;

test('a customer project keeps several products in the chosen order', async () => {
  combo = await addProject(xa, { name: 'GovOne combo', product_ids: [meet, imate, ai] });
  assert.deepEqual(combo.product_ids, [meet, imate, ai]);
  assert.equal(combo.product_name, 'Trợ lý họp thông minh, Trợ lý VBĐH (imate), Trợ lý công chức AI');
  assert.equal(combo.product_type_id, typeId);
  single = await addProject(so, { name: 'iMate', product_id: imate });
  assert.deepEqual(single.product_ids, [imate]);
  bare = await addProject(so, { name: 'Chưa rõ', product_type_id: typeId });
  assert.deepEqual(bare.product_ids, []);
  assert.equal(bare.product_type_id, typeId);
  assert.equal((await api(admin, `/customers/${xa}/projects`, 'POST', { name: 'Sai', product_ids: [999999] })).status, 400);
});

test('editing without product fields keeps the products; product_ids replaces them', async () => {
  await api(admin, `/customers/${xa}/projects/${combo.id}`, 'PATCH', { note: 'ghi chú' });
  assert.deepEqual((await api(admin, `/customers/${xa}/projects/${combo.id}`)).body.product_ids, [meet, imate, ai]);
  await api(admin, `/customers/${so}/projects/${single.id}`, 'PATCH', { product_ids: [imate, ai] });
  assert.deepEqual((await api(admin, `/customers/${so}/projects/${single.id}`)).body.product_ids, [imate, ai]);
  await api(admin, `/customers/${so}/projects/${single.id}`, 'PATCH', { product_id: imate });
  assert.deepEqual((await api(admin, `/customers/${so}/projects/${single.id}`)).body.product_ids, [imate]);
});

test('the product catalogue counts distinct customers per product', async () => {
  const list = (await api(admin, '/products')).body;
  const count = (id: number) => list.find((p: any) => p.id === id).customer_count;
  assert.deepEqual([count(imate), count(ai), count(meet)], [2, 1, 1]);
});

test('report groups customers by product with their interaction state', async () => {
  const today = localDate();
  run("INSERT INTO customer_activities(customer_id, sales_project_id, user_id, kind, activity_date, content) VALUES (?, ?, ?, 'call', '2026-01-05', 'Gọi lần 1')", xa, combo.id, sale);
  run("INSERT INTO customer_activities(customer_id, user_id, kind, activity_date, content) VALUES (?, ?, 'note', '2026-02-01', 'Trao đổi chung')", xa, sale);
  run("INSERT INTO customer_calls(customer_id, sales_project_id, call_date, assignee_id) VALUES (?, ?, '2020-01-01', ?)", xa, combo.id, sale);
  run("INSERT INTO customer_tasks(customer_id, sales_project_id, title) VALUES (?, ?, 'Gửi báo giá')", xa, combo.id);
  run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, code, title) VALUES (?, ?, 10, 0, 'I', 'GIẢI PHÁP')", xa, combo.id);
  run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title, status) VALUES (?, ?, 20, 1, 'Khảo sát', 'doing')", xa, combo.id);

  const r = (await api(admin, '/customers/report/by-product')).body;
  assert.equal(r.today, today);
  assert.equal(r.total, 3);
  // Danh mục để chọn lọc gồm cả sản phẩm chưa có khách hàng
  assert.ok(r.products.some((p: any) => p.name === 'Phần mềm quản lý chợ' && p.type_name));
  assert.ok(r.products.length > r.groups.filter((g: any) => g.product_id).length);
  assert.deepEqual(r.groups.map((g: any) => [g.name, g.customers.map((c: any) => c.name)]), [
    ['Trợ lý VBĐH (imate)', ['Sở B', 'Xã A']],
    ['Trợ lý công chức AI', ['Xã A']],
    ['Trợ lý họp thông minh', ['Xã A']],
    ['Dự án chưa chọn sản phẩm', ['Sở B']],
    ['Khách hàng chưa có dự án', ['Phường C']],
  ]);
  const c = r.groups[1].customers[0];
  assert.equal(c.status, 'Đang tư vấn');
  assert.deepEqual(c.last_activity, { date: '2026-02-01', content: 'Trao đổi chung', user_name: 'sale' });
  assert.equal(c.activity_count, 2);
  assert.equal(c.next_call_date, '2020-01-01');
  assert.equal(c.calls_due, 1);
  assert.equal(c.open_tasks, 1);
  assert.equal(c.kd_names, null);
  assert.deepEqual(c.projects, [{ id: combo.id, code: combo.code, name: 'GovOne combo', status: 'I. Giải pháp', journey_pct: 0, journey_overdue: 0 }]);
  assert.ok(r.statuses.includes('Đang tư vấn'));
  assert.ok(!JSON.stringify(r).includes('Đã lưu trữ'));
  void gone; void empty;
});

test('report follows the viewer scope and permission cells', async () => {
  // Sale: chỉ khách hàng mình phụ trách; không có Hành trình / Công việc – Xem thì không có số liệu đó
  const mine = (await api(sale, '/customers/report/by-product')).body;
  assert.equal(mine.total, 1);
  assert.deepEqual(mine.groups.map((g: any) => g.customers.map((c: any) => c.name)), [['Xã A'], ['Xã A'], ['Xã A']]);
  const c = mine.groups[0].customers[0];
  assert.ok(!('open_tasks' in c) && !('journey_pct' in c.projects[0]));
  assert.equal(c.activity_count, 2);
  // Chỉ Dự án của khách hàng – Xem, không phụ trách khách hàng nào: báo cáo trống, không có tình trạng khách hàng
  const none = (await api(projectOnly, '/customers/report/by-product')).body;
  assert.deepEqual([none.total, none.groups, none.statuses], [0, [], []]);
  assert.equal((await api(journeyOnly, '/customers/report/by-product')).status, 403);
});

test('archived projects and deleted products leave the report', async () => {
  await api(admin, `/customers/${so}/projects/${bare.id}/archive`, 'POST', { archived: true });
  const extra = run('INSERT INTO products(type_id, name) VALUES (?, ?)', typeId, 'Sản phẩm tạm').id;
  await api(admin, `/customers/${so}/projects/${single.id}`, 'PATCH', { product_ids: [extra] });
  run('DELETE FROM products WHERE id = ?', extra);
  assert.deepEqual(all('SELECT * FROM sales_project_products WHERE sales_project_id = ?', single.id), []);
  const r = (await api(admin, '/customers/report/by-product')).body;
  assert.deepEqual(r.groups.map((g: any) => [g.name, g.customers.map((c: any) => c.name)]).slice(-2), [
    ['Dự án chưa chọn sản phẩm', ['Sở B']], ['Khách hàng chưa có dự án', ['Phường C']]]);
});
