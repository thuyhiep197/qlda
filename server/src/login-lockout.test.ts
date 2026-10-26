import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Sai mật khẩu 5 lần liên tiếp → khóa hẳn tài khoản (không tự mở sau một thời gian); quản trị viên mở khóa thì đăng nhập lại được
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-lockout-'));
const { migrate, run, get } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
const { hashPassword } = await import('./auth.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const authRoutes = (await import('./routes/auth.ts')).default;
const { MAX_FAILED_LOGINS } = await import('./routes/auth.ts');
const adminRoutes = (await import('./routes/admin.ts')).default;

const adminGroup = get<{ id: number }>('SELECT id FROM roles WHERE is_admin = 1')!.id;
const admin = run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES ('admin', 'Admin', 'x', ?, 1)", adminGroup).id;
const user = (username: string) =>
  run('INSERT INTO users(username, full_name, password_hash) VALUES (?, ?, ?)', username, username, hashPassword('Dung2026x')).id;

const app = express();
app.use(express.json());
app.use((req, _res, next) => { if (req.headers['x-user']) req.user = get<any>('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user'])); next(); });
app.use('/api/auth', authRoutes);
app.use('/api', adminRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (method: string, url: string, body: unknown, userId?: number) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'content-type': 'application/json', ...(userId ? { 'x-user': String(userId) } : {}) }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as any };
};
const login = (username: string, password: string) => api('POST', '/auth/login', { username, password });
const isActive = (id: number) => get<{ is_active: number }>('SELECT is_active FROM users WHERE id = ?', id)!.is_active;

test('wrong password 5 times in a row locks the account until an admin unlocks it', async () => {
  const id = user('khoa1');
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) assert.equal((await login('khoa1', 'sai')).status, 401);
  assert.equal(isActive(id), 1);
  const locked = await login('khoa1', 'sai');
  assert.equal(locked.status, 403);
  assert.match(locked.body.error, /khóa/);
  assert.equal(isActive(id), 0);
  // Đúng mật khẩu vẫn không vào được — không có thời hạn tự mở
  assert.equal((await login('khoa1', 'Dung2026x')).status, 403);
  assert.ok(get("SELECT 1 FROM audit_log WHERE action = 'account_locked' AND target = 'khoa1'"));
  // Quản trị mở khóa → đăng nhập được, đếm lại từ đầu
  assert.equal((await api('PATCH', `/users/${id}`, { is_active: true }, admin)).status, 200);
  assert.equal(get<{ n: number }>('SELECT failed_logins n FROM users WHERE id = ?', id)!.n, 0);
  assert.equal((await login('khoa1', 'Dung2026x')).status, 200);
});

test('a successful login resets the count of wrong passwords', async () => {
  const id = user('khoa2');
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) await login('khoa2', 'sai');
  assert.equal((await login('khoa2', 'Dung2026x')).status, 200);
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) assert.equal((await login('khoa2', 'sai')).status, 401);
  assert.equal(isActive(id), 1);
});
