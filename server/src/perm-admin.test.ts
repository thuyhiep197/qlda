import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Mở CSDL trong thư mục tạm; gọi API thật (Quản trị, Tài liệu nội bộ, Tìm kiếm, Thông báo) với người dùng thiếu từng ô quyền
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-perm-admin-'));
const { migrate, run, get, all } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
const { notifyCustomer } = await import('./notify.ts');
const { verifyPassword } = await import('./auth.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const adminRoutes = (await import('./routes/admin.ts')).default;
const docRoutes = (await import('./routes/docs.ts')).default;
const searchRoutes = (await import('./routes/search.ts')).default;
const notificationRoutes = (await import('./routes/notifications.ts')).default;

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, roleId: number | null, isAdmin = 0) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES (?, ?, 'x', ?, ?)", username, username, roleId, isAdmin).id;
const roleId = (name: string) => get<{ id: number }>('SELECT id FROM roles WHERE name = ?', name)!.id;

const adminGroup = get<{ id: number }>('SELECT id FROM roles WHERE is_admin = 1')!.id;
const admin = user('admin', adminGroup, 1);
const userMgr = role('Quản lý tài khoản', ['user.view', 'user.create', 'user.edit']);
const mgr = user('mgr', userMgr);
const accountManagerRole = role('Quản lý tài khoản qua quyền riêng', []);
const accountManager = user('accountmanager', accountManagerRole);
for (const permission of ['user.view', 'user.create', 'user.edit', 'user.delete', 'role.view', 'role.create', 'role.edit', 'role.delete']) {
  run("INSERT INTO user_permissions(user_id, permission, effect) VALUES (?, ?, 'allow')", accountManager, permission);
}
const viewer = role('Chỉ xem dự án', ['plan.view']);
const other = user('other', viewer);
const nobody = user('nobody', role('Không quyền', []));
const roleEditor = user('roleed', role('Sửa phân quyền', ['role.view', 'role.edit']));
const proj = run("INSERT INTO projects(key, name, type) VALUES ('PX', 'Dự án X', 'scrum')").id;
const todo = run("INSERT INTO statuses(project_id, name, category) VALUES (?, 'Cần làm', 'todo')", proj).id;
const issue = run("INSERT INTO issues(project_id, key, number, type, summary, status_id) VALUES (?, 'PX-1', 1, 'task', 'Khảo sát', ?)", proj, todo).id;

// Ứng dụng thử: người dùng theo header x-user, lỗi quyền → mã HTTP như server thật
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get<any>('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user'])); next(); });
app.use('/api/docs', docRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', adminRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, method: string, url: string, body?: unknown) => {
  const isForm = body instanceof FormData;
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'x-user': String(userId), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() as any };
};

test('a non-admin cannot raise their own group or assign a group with more permissions than they have', async () => {
  assert.equal((await api(mgr, 'PATCH', `/users/${mgr}`, { default_role_id: roleId('BA Lead') })).status, 403);
  assert.equal((await api(mgr, 'PATCH', `/users/${other}`, { default_role_id: roleId('BA Lead') })).status, 403);
  assert.equal((await api(mgr, 'PATCH', `/users/${other}`, { default_role_id: adminGroup })).status, 403);
  assert.equal(get<{ default_role_id: number }>('SELECT default_role_id FROM users WHERE id = ?', other)!.default_role_id, viewer);
  // Nhóm có quyền nằm trong quyền của mình: được gán
  const sub = role('Chỉ xem người dùng', ['user.view']);
  assert.equal((await api(mgr, 'PATCH', `/users/${other}`, { default_role_id: sub })).status, 200);
  // Sửa thông tin của chính mình (không đổi nhóm) vẫn được
  assert.equal((await api(mgr, 'PATCH', `/users/${mgr}`, { full_name: 'Quản lý', default_role_id: userMgr })).status, 200);
  const create = (username: string, group: number) => api(mgr, 'POST', '/users', { username, full_name: username, password: 'Matkhau2026x', default_role_id: group });
  assert.equal((await create('lead2', roleId('BA Lead'))).status, 403);
  assert.equal((await create('admin2', adminGroup)).status, 403);
  assert.equal((await create('sub1', sub)).status, 201);
  // Quản trị hệ thống: gán nhóm nào cũng được
  assert.equal((await api(admin, 'PATCH', `/users/${other}`, { default_role_id: roleId('BA Lead') })).status, 200);
});

test('all effective user and role management permissions allow full account administration', async () => {
  const crossModule = role('Quyền khách hàng', ['customer.view', 'customer.edit']);
  const target = user('accounttarget', viewer);
  assert.equal((await api(accountManager, 'GET', '/roles')).status, 200);

  const created = await api(accountManager, 'POST', '/users', {
    username: 'accountcreated', full_name: 'Account Created', password: 'Matkhau2026x', default_role_id: crossModule,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.default_role_id, crossModule);

  assert.equal((await api(accountManager, 'PATCH', `/users/${target}`, { default_role_id: crossModule })).status, 200);
  assert.equal((await api(accountManager, 'PUT', `/users/${target}/permissions`, {
    overrides: { 'customer.view_all': 'allow' },
  })).status, 200);

  const createdRole = await api(accountManager, 'POST', '/roles', {
    name: 'Nhóm nhiều phân hệ', permissions: ['customer.view', 'issue.create'],
  });
  assert.equal(createdRole.status, 201);
  assert.equal((await api(accountManager, 'PATCH', `/roles/${createdRole.body.id}`, {
    permissions: ['customer.view', 'issue.create', 'document.export'],
  })).status, 200);

  // Quyền theo người dùng không cho phép tự đổi nhóm, tự cấp quyền riêng, hay sửa nhóm của mình để tự nâng quyền.
  assert.equal((await api(accountManager, 'PATCH', `/users/${accountManager}`, { default_role_id: crossModule })).status, 403);
  assert.equal((await api(accountManager, 'PUT', `/users/${accountManager}/permissions`, {
    overrides: { 'customer.view': 'allow' },
  })).status, 403);
  assert.equal((await api(accountManager, 'PATCH', `/roles/${accountManagerRole}`, {
    permissions: ['customer.view'],
  })).status, 403);

  // Nhóm và tài khoản Quản trị hệ thống tiếp tục dành riêng cho quản trị hệ thống.
  assert.equal((await api(accountManager, 'POST', '/users', {
    username: 'accountadmin', full_name: 'Account Admin', password: 'Matkhau2026x', default_role_id: adminGroup,
  })).status, 403);
  assert.equal((await api(accountManager, 'PATCH', `/users/${target}`, { default_role_id: adminGroup })).status, 403);
  assert.equal((await api(accountManager, 'PUT', `/users/${admin}/permissions`, {
    overrides: { 'customer.view': 'allow' },
  })).status, 403);
});

test('group permissions and per-user extra permissions: only grant what you have, never to yourself', async () => {
  assert.equal((await api(roleEditor, 'PUT', `/users/${roleEditor}/permissions`, { overrides: { 'role.view': 'allow' } })).status, 403);
  assert.equal((await api(roleEditor, 'PUT', `/users/${nobody}/permissions`, { overrides: { 'user.delete': 'allow' } })).status, 403);
  assert.equal((await api(roleEditor, 'PUT', `/users/${nobody}/permissions`, { overrides: { 'role.view': 'allow' } })).status, 200);
  const own = get<{ default_role_id: number }>('SELECT default_role_id FROM users WHERE id = ?', roleEditor)!.default_role_id;
  assert.equal((await api(roleEditor, 'PATCH', `/roles/${own}`, { permissions: ['role.view', 'role.edit', 'user.delete'] })).status, 403);
  assert.equal((await api(roleEditor, 'PATCH', `/roles/${own}`, { permissions: ['role.view', 'role.edit'] })).status, 200);
});

test('only an admin edits, locks or resets the password of an admin account', async () => {
  assert.equal((await api(mgr, 'POST', `/users/${admin}/reset-password`, { password: 'Matkhau2026x' })).status, 403);
  assert.equal((await api(mgr, 'PATCH', `/users/${admin}`, { full_name: 'Hacked' })).status, 403);
  assert.equal((await api(mgr, 'PATCH', `/users/${admin}`, { email: 'x@y.z' })).status, 403);
  assert.equal(get<{ full_name: string }>('SELECT full_name FROM users WHERE id = ?', admin)!.full_name, 'admin');
  assert.equal((await api(mgr, 'POST', `/users/${nobody}/reset-password`, { password: 'Matkhau2026x' })).status, 200);
  const second = user('admin3', adminGroup, 1);
  assert.equal((await api(admin, 'POST', `/users/${second}/reset-password`, { password: 'Matkhau2026x' })).status, 200);
});

test('reset password always sets the default temporary password qlda@868686 and forces a change', async () => {
  const r = await api(mgr, 'POST', `/users/${nobody}/reset-password`);
  assert.equal(r.status, 200);
  assert.equal(r.body.password, 'qlda@868686');
  const u = get<{ password_hash: string; must_change_password: number }>('SELECT password_hash, must_change_password FROM users WHERE id = ?', nobody)!;
  assert.ok(verifyPassword('qlda@868686', u.password_hash));
  assert.equal(u.must_change_password, 1);
});

test('department and positions on the user form need Nhân sự – Thêm / Sửa; project_ids is ignored', async () => {
  const dep = get<{ id: number }>('SELECT id FROM departments ORDER BY id LIMIT 1')!.id;
  assert.equal((await api(mgr, 'PATCH', `/users/${nobody}`, { department_id: dep, positions: ['kd'] })).status, 403);
  assert.equal((await api(mgr, 'POST', '/users', { username: 'dep1', full_name: 'Dep 1', password: 'Matkhau2026x', default_role_id: viewer, department_id: dep, positions: ['kd'] })).status, 403);
  assert.equal((await api(admin, 'PATCH', `/users/${nobody}`, { project_ids: [proj] })).status, 200);
  assert.ok(!get('SELECT 1 FROM project_members WHERE user_id = ?', nobody));
});

test('group list needs Phân quyền – Xem or Người dùng – Xem', async () => {
  assert.equal((await api(user('noroles', role('Không xem nhóm', ['plan.view'])), 'GET', '/roles')).status, 403);
  assert.equal((await api(mgr, 'GET', '/roles')).status, 200);
  assert.equal((await api(roleEditor, 'GET', '/roles')).status, 200);
});

test('uploading a file with the name of someone else\'s file in the same folder is rejected (unless Tài liệu nội bộ – Sửa)', async () => {
  // Tải lên cần Tài liệu nội bộ – Xem + Thêm
  const DOC = ['document.view', 'document.create'];
  const other = user('docother', role('Tài liệu A', DOC)), nobody = user('docnobody', role('Tài liệu B', DOC));
  const upload = (userId: number, name: string, content: string) => {
    const fd = new FormData();
    fd.append('files', new Blob([content], { type: 'application/pdf' }), name);
    return api(userId, 'POST', '/docs/files?folder=root', fd);
  };
  assert.equal((await upload(other, 'quy-che.pdf', 'v1')).status, 201);
  const before = get<{ uploader_id: number; stored_name: string }>("SELECT uploader_id, stored_name FROM doc_files WHERE filename = 'quy-che.pdf'")!;
  const r = await upload(nobody, 'Quy-che.pdf', 'v2');
  assert.equal(r.status, 403);
  assert.match(r.body.error, /người khác/);
  const now = get<{ uploader_id: number; stored_name: string }>("SELECT uploader_id, stored_name FROM doc_files WHERE filename = 'quy-che.pdf'")!;
  assert.deepEqual(now, before);
  // Người tải lên bản cũ thay được; người có quyền Sửa tài liệu cũng thay được
  assert.equal((await upload(other, 'quy-che.pdf', 'v3')).status, 201);
  assert.equal((await upload(admin, 'quy-che.pdf', 'v4')).status, 201);
  assert.equal(all("SELECT 1 FROM doc_files WHERE filename = 'quy-che.pdf'").length, 1);
});

// ---- Tìm kiếm & thông báo: khách hàng có dự án, bước hành trình, việc ----
const cust = run("INSERT INTO customers(name) VALUES ('Sở Tài chính')").id;
const sp = run("INSERT INTO sales_projects(customer_id, code, name) VALUES (?, 'TC-01', 'Dự án TC')", cust).id;
const step = run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title) VALUES (?, ?, 10, 1, 'Khảo sát hiện trạng')", cust, sp).id;
const BASE = ['customer.view', 'customer.view_all', 'sales_project.view'];
const noJourney = user('nojourney', role('Không hành trình', BASE));
const withJourney = user('withjourney', role('Có hành trình', [...BASE, 'journey.view', 'ctalk.view']));

test('search: journey steps need Hành trình – Xem and Dự án của khách hàng – Xem; issues need Danh sách & tìm kiếm issue – Xem', async () => {
  const a = (await api(noJourney, 'GET', '/search?q=khao sat')).body;
  assert.equal(a.steps.length, 0);
  const b = (await api(withJourney, 'GET', '/search?q=khao sat')).body;
  assert.equal(b.steps.length, 1);
  assert.equal(b.steps[0].id, step);
  const issueViewer = user('issueviewer', role('Xem issue', ['issue.view', 'project.view_all']));
  assert.equal((await api(issueViewer, 'GET', `/search?q=${encodeURIComponent('Khảo sát')}`)).body.issues.length, 0);
  assert.ok((await api(admin, 'GET', `/search?q=${encodeURIComponent('Khảo sát')}`)).body.issues.length >= 1);
});

test('notifications only reach / show to people with the view cell of the function behind them', async () => {
  const items = async (u: number) => (await api(u, 'GET', '/notifications')).body.items as any[];
  // Lúc tạo: không có Hành trình – Xem thì không nhận thông báo của bước; không có Công việc – Xem thì không nhận thông báo việc
  notifyCustomer([noJourney, withJourney], admin, cust, 'assigned', `step:${step}`, 'Bước mới');
  notifyCustomer([noJourney, withJourney], admin, cust, 'assigned', 'tasks', 'Việc mới');
  assert.equal(get<{ c: number }>("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND link LIKE 'step:%'", noJourney)!.c, 0);
  assert.equal(get<{ c: number }>("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND link LIKE 'step:%'", withJourney)!.c, 1);
  assert.equal(get<{ c: number }>("SELECT COUNT(*) c FROM notifications WHERE link = 'tasks'")!.c, 0);
  // Lúc đọc: thông báo đã có từ trước (quyền đã đổi) cũng ẩn
  const add = (u: number, link: string, type = 'assigned') =>
    run("INSERT INTO notifications(user_id, actor_id, customer_id, link, type, text, created_at) VALUES (?, ?, ?, ?, ?, 'x', '2026-10-01')", u, admin, cust, link, type);
  add(noJourney, `step:${step}`); add(noJourney, `call:${sp}`); add(noJourney, 'tasks'); add(noJourney, 'info', 'mention');
  assert.deepEqual(await items(noJourney), []);
  add(withJourney, `call:${sp}`); add(withJourney, 'info', 'mention'); add(withJourney, 'tasks');
  const links = (await items(withJourney)).map((n) => n.link).sort();
  assert.deepEqual(links, [`call:${sp}`, 'info', `step:${step}`]);
  // Issue: cần Issue – Xem; nội dung bình luận chỉ hiện khi có Bình luận – Xem
  const issueOnly = user('issueonly', role('Issue không bình luận', ['issue.view', 'project.view_all']));
  const plan = user('planonly', role('Chỉ kế hoạch', ['plan.view', 'project.view_all']));
  for (const u of [issueOnly, plan]) run("INSERT INTO notifications(user_id, actor_id, issue_id, type, text, created_at) VALUES (?, ?, ?, 'comment', 'Bí mật', '2026-10-01')", u, admin, issue);
  assert.deepEqual(await items(plan), []);
  const n = await items(issueOnly);
  assert.equal(n.length, 1);
  assert.equal(n[0].text, '');
});

test('admin accounts are never offered when picking people or @mentioning', async () => {
  const { activeUsersWith } = await import('./permissions.ts');
  const basic = (await api(other, 'GET', '/users/basic')).body.map((u: any) => u.id);
  assert.ok(!basic.includes(admin));
  assert.ok(basic.includes(mgr));
  assert.ok(!activeUsersWith(['plan.view']).includes(admin));
  assert.ok(activeUsersWith(['plan.view']).includes(other));
});
