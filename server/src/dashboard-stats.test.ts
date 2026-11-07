import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Dashboard thống kê: khách hàng theo Sale/AM/tình trạng, dự án theo BA/Dev/trạng thái — đúng ô quyền, đúng phạm vi, bỏ mục đã lưu trữ.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-dash-'));
const { migrate, run, get } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const reportRoutes = (await import('./routes/reports.ts')).default;
const customerWork = (await import('./routes/customer-work.ts')).default;

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, fullName: string, roleId: number, positions = '') =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, positions) VALUES (?, ?, 'x', ?, ?)", username, fullName, roleId, positions).id;

const ALL = role('Xem tất cả', ['dashboard.view', 'customer.view', 'customer.view_all', 'project.view', 'project.view_all']);
const SCOPED = role('Xem phần tham gia', ['dashboard.view', 'customer.view', 'project.view']);
const NO_INFO = role('Chỉ Dashboard và kế hoạch', ['dashboard.view', 'plan.view', 'journey.view']);
const NO_DASH = role('Không Dashboard', ['customer.view', 'customer.view_all', 'project.view', 'project.view_all']);

const boss = user('boss', 'Sếp', ALL);
const sale = user('sale', 'An Sale', SCOPED, 'kd');
const sale2 = user('sale2', 'Bình Sale', SCOPED, 'kd');
const am = user('am', 'Chi AM', SCOPED, 'am');
const ba = user('ba', 'Dung BA', SCOPED, 'ba_pm');
const dev = user('dev', 'Em Dev', SCOPED, 'dev');
const dev2 = user('dev2', 'Giang Dev', SCOPED, 'dev');
const noInfo = user('noinfo', 'Thiếu ô', NO_INFO);
const noDash = user('nodash', 'Không Dashboard', NO_DASH);

const customer = (name: string, code: string, status: string, archived = 0) =>
  run('INSERT INTO customers(name, code, status, source, is_archived) VALUES (?, ?, ?, ?, ?)', name, code, status, 'Giới thiệu', archived).id;
const owner = (c: number, u: number, r: string) => run('INSERT INTO customer_owners(customer_id, user_id, role) VALUES (?,?,?)', c, u, r);
const c1 = customer('KH 1', 'K1', 'Mới'), c2 = customer('KH 2', 'K2', 'Mới'), c3 = customer('KH 3', 'K3', 'Đang tư vấn');
const cOld = customer('KH lưu trữ', 'K9', 'Mới', 1);
owner(c1, sale, 'kd'); owner(c1, sale2, 'kd'); owner(c1, am, 'am');
owner(c2, sale, 'kd');
owner(cOld, sale, 'kd');

const project = (key: string, pinned: string | null, archived = 0) =>
  run("INSERT INTO projects(key, name, type, project_status, is_archived) VALUES (?, ?, 'scrum', ?, ?)", key, `Dự án ${key}`, pinned, archived).id;
const person = (p: number, u: number, r: string) => {
  run('INSERT INTO project_people(project_id, user_id, role) VALUES (?,?,?)', p, u, r);
  run('INSERT OR IGNORE INTO project_members(project_id, user_id, role_id) VALUES (?, ?, (SELECT default_role_id FROM users WHERE id = ?))', p, u, u);
};
const p1 = project('P1', 'Xây dựng'), p2 = project('P2', 'Xây dựng'), p3 = project('P3', null), p4 = project('P4', null);
const pOld = project('P9', 'Kiểm thử', 1);
person(p1, ba, 'ba'); person(p1, dev, 'dev'); person(p1, dev2, 'dev');
person(p2, dev, 'dev');
person(pOld, dev, 'dev');
// P4: có việc đang làm nhưng chưa Epic nào gắn được giai đoạn → không xác định được trạng thái
const doing = run("INSERT INTO statuses(project_id, name, category, position) VALUES (?, 'Đang làm', 'inprogress', 0)", p4).id;
run("INSERT INTO issues(project_id, number, key, type, summary, status_id, rank) VALUES (?, 1, 'P4-1', 'task', 'Việc', ?, 1000)", p4, doing);

const app = express();
app.use((req, _res, next) => { req.user = get('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user']))!; next(); });
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerWork);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, url: string) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, { headers: { 'x-user': String(userId) } });
  return { status: r.status, body: await r.json() as any };
};
const rows = (s: { people: { name: string; n: number }[] }) => s.people.map((p) => [p.name, p.n]);
const statusMap = (list: { status: string | null; n: number }[]) => Object.fromEntries(list.map((x) => [String(x.status), x.n]));

test('khách hàng: tổng, theo tình trạng, theo Sale/AM; nhiều người thì tính cho từng người; bỏ khách hàng đã lưu trữ', async () => {
  const s = (await api(boss, '/customers/summary')).body;
  assert.equal(s.total, 3);
  assert.deepEqual(statusMap(s.by_status), { 'Mới': 2, 'Đang tư vấn': 1 });
  assert.deepEqual(rows(s.by_kd), [['An Sale', 2], ['Bình Sale', 1]]);
  assert.equal(s.by_kd.none, 1, 'KH 3 chưa có Sale');
  assert.deepEqual(rows(s.by_am), [['Chi AM', 1]]);
  assert.equal(s.by_am.none, 2);
});

test('khách hàng: chỉ tính trong phạm vi được xem', async () => {
  const s = (await api(sale2, '/customers/summary')).body;
  assert.equal(s.total, 1);
  assert.deepEqual(rows(s.by_kd), [['An Sale', 1], ['Bình Sale', 1]]);
  assert.deepEqual(rows(s.by_am), [['Chi AM', 1]]);
  assert.equal(s.by_am.none, 0);
});

test('khách hàng: không có Thông tin khách hàng – Xem thì không có số liệu', async () => {
  const s = (await api(noInfo, '/customers/summary')).body;
  assert.equal(s.total, 0);
  assert.deepEqual(s.by_kd, { people: [], none: 0 });
  assert.deepEqual(s.by_am, { people: [], none: 0 });
});

test('dự án: tổng, theo trạng thái (ghim / tự tính / chưa xác định), theo BA/Dev; bỏ dự án đã lưu trữ', async () => {
  const s = (await api(boss, '/reports/project-overview')).body;
  assert.equal(s.total, 4);
  assert.deepEqual(statusMap(s.by_status), { 'Xây dựng': 2, 'Chưa bắt đầu': 1, null: 1 });
  assert.deepEqual(rows(s.by_ba), [['Dung BA', 1]]);
  assert.equal(s.by_ba.none, 3);
  assert.deepEqual(rows(s.by_dev), [['Em Dev', 2], ['Giang Dev', 1]]);
  assert.equal(s.by_dev.none, 2);
});

test('dự án: chỉ tính dự án được vào', async () => {
  const s = (await api(dev2, '/reports/project-overview')).body;
  assert.equal(s.total, 1);
  assert.deepEqual(statusMap(s.by_status), { 'Xây dựng': 1 });
  assert.deepEqual(rows(s.by_dev), [['Em Dev', 1], ['Giang Dev', 1]]);
});

test('dự án: thiếu Dự án – Xem hoặc Dashboard – Xem thì bị chặn', async () => {
  assert.equal((await api(noInfo, '/reports/project-overview')).status, 403);
  assert.equal((await api(noDash, '/reports/project-overview')).status, 403);
});
