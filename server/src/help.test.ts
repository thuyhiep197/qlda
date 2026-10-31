import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Hướng dẫn sử dụng: mọi tài khoản đọc được bài đã sửa trên tool; chỉ Quản trị hệ thống được sửa / thêm / khôi phục.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-help-'));
const { migrate, run, get } = await import('./db.ts');
const { HttpError } = await import('./permissions.ts');
const { default: helpRoutes, cleanHelpArticle, HELP_SECTIONS } = await import('./routes/help.ts');
migrate();

const admin = run("INSERT INTO users(username, full_name, password_hash, is_admin) VALUES ('qt', 'Quản trị', 'x', 1)").id;
// Người có đủ quyền Người dùng & Phân quyền nhưng không thuộc nhóm Quản trị hệ thống vẫn không được sửa
const roleId = run("INSERT INTO roles(name, permissions) VALUES ('Đủ quyền', ?)", JSON.stringify(['user.view', 'user.edit', 'role.view', 'role.edit'])).id;
const manager = run("INSERT INTO users(username, full_name, password_hash, default_role_id) VALUES ('ql', 'Quản lý', 'x', ?)", roleId).id;
const plain = run("INSERT INTO users(username, full_name, password_hash) VALUES ('nv', 'Nhân viên', 'x')").id;

const express = (await import('express')).default;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get<any>('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user'])); next(); });
app.use('/api/help', helpRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, method: string, url: string, body?: unknown) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'x-user': String(userId), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};

test('help article ids are lower-case slugs', () => {
  assert.throws(() => cleanHelpArticle('Ke hoach', { title: 'x', body: 'y' }), /Mã bài không hợp lệ/);
  assert.throws(() => cleanHelpArticle('a', { title: 'x', body: 'y' }), /Mã bài không hợp lệ/);
  assert.equal(cleanHelpArticle('da-ke-hoach-chi-tiet', { title: 'x', body: 'y' }).title, 'x');
});

test('title and body are required; unknown section falls back to general', () => {
  assert.throws(() => cleanHelpArticle('bai-moi', { title: '  ', body: 'y' }), /Tiêu đề/);
  assert.throws(() => cleanHelpArticle('bai-moi', { title: 'x', body: ' ' }), /Nội dung/);
  const a = cleanHelpArticle('bai-moi', { title: ' Bài   mới ', body: 'Nội dung', section: 'khac', module: '', is_custom: true });
  assert.deepEqual(a, { title: 'Bài mới', body: 'Nội dung', section: 'general', module: null, is_custom: 1 });
  assert.equal(cleanHelpArticle('bai-moi', { title: 'x', body: 'y', section: 'customer' }).section, 'customer');
  assert.ok(HELP_SECTIONS.includes('start'));
});

test('only system admins edit, add and restore articles; everyone reads them', async () => {
  for (const u of [manager, plain]) {
    assert.equal((await api(u, 'PUT', '/help/gioi-thieu', { title: 'Sửa', body: 'x' })).status, 403);
  }
  const saved = await api(admin, 'PUT', '/help/gioi-thieu', { title: 'Giới thiệu (sửa)', body: 'Nội dung mới', section: 'start' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.updated_by, admin);
  const list = await api(plain, 'GET', '/help');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((a: any) => [a.id, a.title, a.updated_by_name]), [['gioi-thieu', 'Giới thiệu (sửa)', 'Quản trị']]);
  assert.equal((await api(manager, 'DELETE', '/help/gioi-thieu')).status, 403);
  assert.equal((await api(admin, 'DELETE', '/help/gioi-thieu')).status, 200);
  assert.equal((await api(admin, 'DELETE', '/help/gioi-thieu')).status, 404);
  assert.deepEqual((await api(plain, 'GET', '/help')).body, []);
  assert.ok(get("SELECT 1 FROM audit_log WHERE action = 'help_saved' AND target = 'gioi-thieu'"));
});
