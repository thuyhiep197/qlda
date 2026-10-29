import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// API key cá nhân: gọi API bằng Authorization: Bearer thay cho cookie; thu hồi / hết hạn / đổi mật khẩu thì key mất hiệu lực;
// key không dùng được để quản lý key hay đổi mật khẩu
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-apikey-'));
const { migrate, run, get } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
const { hashPassword, requireAuth } = await import('./auth.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const cookieParser = (await import('cookie-parser')).default;
const authRoutes = (await import('./routes/auth.ts')).default;

const user = (username: string) =>
  run('INSERT INTO users(username, full_name, password_hash) VALUES (?, ?, ?)', username, username, hashPassword('Dung2026x')).id;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.get('/api/ping', (req, res) => { res.json({ id: req.user.id }); });
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());

const call = async (method: string, url: string, auth: { cookie?: string; key?: string }, body?: unknown) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth.cookie) headers.cookie = auth.cookie;
  if (auth.key) headers.authorization = `Bearer ${auth.key}`;
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() as any, cookie: r.headers.getSetCookie().find((c) => c.startsWith('qlda_token='))?.split(';')[0] };
};
const login = async (username: string) => (await call('POST', '/auth/login', {}, { username, password: 'Dung2026x' })).cookie!;

test('a key created on the web authenticates API calls as its owner, and stops working once revoked', async () => {
  const id = user('key1');
  const cookie = await login('key1');
  const created = await call('POST', '/auth/api-keys', { cookie }, { name: 'Claude' });
  assert.equal(created.status, 201);
  assert.match(created.body.key, /^qlda_/);
  // CSDL không giữ key nguyên văn
  assert.equal(get('SELECT 1 FROM api_keys WHERE key_hash = ?', created.body.key), undefined);
  assert.deepEqual((await call('GET', '/ping', { key: created.body.key })).body, { id });
  const list = await call('GET', '/auth/api-keys', { cookie });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].key, undefined);
  assert.ok(list.body[0].last_used_at);
  assert.equal((await call('DELETE', `/auth/api-keys/${created.body.id}`, { cookie })).status, 200);
  assert.equal((await call('GET', '/ping', { key: created.body.key })).status, 401);
});

test('the owner can view a key again on the web, nobody else can, and the key itself cannot', async () => {
  user('key6');
  const other = user('key7');
  const cookie = await login('key6');
  const created = (await call('POST', '/auth/api-keys', { cookie }, { name: 'Xem lại' })).body;
  // CSDL chỉ có bản mã hóa, không có key nguyên văn
  assert.ok(!get<{ key_enc: string }>('SELECT key_enc FROM api_keys WHERE id = ?', created.id)!.key_enc.includes(created.key.slice(5)));
  const shown = await call('GET', `/auth/api-keys/${created.id}/reveal`, { cookie });
  assert.equal(shown.status, 200);
  assert.equal(shown.body.key, created.key);
  assert.ok(get("SELECT 1 FROM audit_log WHERE action = 'api_key_viewed' AND target = 'Xem lại'"));
  assert.equal((await call('GET', `/auth/api-keys/${created.id}/reveal`, { key: created.key })).status, 403);
  assert.ok(other);
  const otherCookie = await login('key7');
  assert.equal((await call('GET', `/auth/api-keys/${created.id}/reveal`, { cookie: otherCookie })).status, 404);
});

test('a key cannot manage keys or change the password', async () => {
  user('key2');
  const cookie = await login('key2');
  const { key } = (await call('POST', '/auth/api-keys', { cookie }, { name: 'Script' })).body;
  assert.equal((await call('POST', '/auth/api-keys', { key }, { name: 'Khác' })).status, 403);
  assert.equal((await call('GET', '/auth/api-keys', { key })).status, 403);
  assert.equal((await call('POST', '/auth/change-password', { key }, { current_password: 'Dung2026x', new_password: 'MoiHon2026x' })).status, 403);
  assert.equal((await call('GET', '/auth/me', { key })).status, 200);
});

test('changing the password revokes every key of the account', async () => {
  user('key3');
  const cookie = await login('key3');
  const { key } = (await call('POST', '/auth/api-keys', { cookie }, { name: 'MCP' })).body;
  assert.equal((await call('POST', '/auth/change-password', { cookie }, { current_password: 'Dung2026x', new_password: 'MoiHon2026x' })).status, 200);
  assert.equal((await call('GET', '/ping', { key })).status, 401);
});

test('expired keys, locked accounts and made-up keys are rejected', async () => {
  const id = user('key4');
  const cookie = await login('key4');
  const { key, id: keyId } = (await call('POST', '/auth/api-keys', { cookie }, { name: 'Hạn 1 ngày', expires_days: 1 })).body;
  assert.equal((await call('GET', '/ping', { key })).status, 200);
  run("UPDATE api_keys SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", keyId);
  assert.equal((await call('GET', '/ping', { key })).status, 401);

  const { key: k2 } = (await call('POST', '/auth/api-keys', { cookie }, { name: 'Khóa' })).body;
  run('UPDATE users SET is_active = 0 WHERE id = ?', id);
  assert.equal((await call('GET', '/ping', { key: k2 })).status, 401);
  assert.equal((await call('GET', '/ping', { key: 'qlda_khongtontai' })).status, 401);
  assert.equal((await call('GET', '/ping', { key: 'abc' })).status, 401);
});

test('a key needs a name and each account holds at most 10 keys', async () => {
  user('key5');
  const cookie = await login('key5');
  assert.equal((await call('POST', '/auth/api-keys', { cookie }, { name: ' ' })).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/auth/api-keys', { cookie }, { name: `k${i}` })).status, 201);
  assert.equal((await call('POST', '/auth/api-keys', { cookie }, { name: 'k10' })).status, 400);
});
