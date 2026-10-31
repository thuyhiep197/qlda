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
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) assert.equal((await login('khoa1', `sai${i}`)).status, 401);
  assert.equal(isActive(id), 1);
  const locked = await login('khoa1', 'sai-cuoi');
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
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) await login('khoa2', `sai${i}`);
  assert.equal((await login('khoa2', 'Dung2026x')).status, 200);
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) assert.equal((await login('khoa2', `lai${i}`)).status, 401);
  assert.equal(isActive(id), 1);
});

test('sending the same wrong password again (Enter held down, double click) counts as one mistake, not several', async () => {
  const id = user('khoa3');
  for (let i = 0; i < 10; i++) assert.equal((await login('khoa3', 'qlda@868686')).status, 401);
  assert.equal(isActive(id), 1);
  assert.equal(get<{ n: number }>('SELECT failed_logins n FROM users WHERE id = ?', id)!.n, 1);
  // Mật khẩu sai khác nhau vẫn bị đếm đủ và khóa
  for (let i = 2; i < MAX_FAILED_LOGINS; i++) assert.equal((await login('khoa3', `khac${i}`)).status, 401);
  assert.equal((await login('khoa3', 'khac-cuoi')).status, 403);
  assert.equal(isActive(id), 0);
});

test('an admin password reset starts the wrong-password count from zero', async () => {
  const id = user('khoa4');
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) await login('khoa4', `sai${i}`);
  assert.equal((await api('POST', `/users/${id}/reset-password`, {}, admin)).status, 200);
  assert.equal(get<{ n: number }>('SELECT failed_logins n FROM users WHERE id = ?', id)!.n, 0);
  // Gõ nhầm mật khẩu tạm một lần không bị khóa
  assert.equal((await login('khoa4', 'gonham123')).status, 401);
  assert.equal(isActive(id), 1);
});

test('a wrong password tells how many tries are left before the account is locked', async () => {
  user('khoa5');
  assert.match((await login('khoa5', 'sai1')).body.error, /Còn 4 lần thử/);
  assert.match((await login('khoa5', 'sai1')).body.error, /Còn 4 lần thử/); // gửi lại đúng mật khẩu sai đó: không trừ thêm
  assert.match((await login('khoa5', 'sai2')).body.error, /Còn 3 lần thử/);
  // Tên đăng nhập không tồn tại: không báo số lần
  assert.equal((await login('khongcoai', 'sai1')).body.error, 'Sai tên đăng nhập hoặc mật khẩu');
});

test('new passwords may not contain Vietnamese accented letters', async () => {
  const { validatePassword } = await import('./auth.ts');
  assert.throws(() => validatePassword('Matkhau2026â', 'abc'), /có dấu/);
  assert.throws(() => validatePassword('Đổimậtkhẩu2026', 'abc'), /có dấu/);
  assert.equal(validatePassword('Matkhau2026aa', 'abc'), 'Matkhau2026aa');
  // Người đã có mật khẩu có dấu từ trước vẫn đăng nhập được
  run('INSERT INTO users(username, full_name, password_hash) VALUES (?, ?, ?)', 'cudau', 'cudau', hashPassword('Mậtkhẩu2026'));
  assert.equal((await login('cudau', 'Mậtkhẩu2026')).status, 200);
});
