import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Phân hệ Tài liệu nội bộ: mỗi API theo đúng ô quyền (Xem, Xem tất cả, Thêm, Sửa, Xóa, Tải về).
// Mở CSDL trong thư mục tạm rồi gọi API thật với người dùng thiếu từng ô quyền.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-docs-perm-'));
const { migrate, run, get } = await import('./db.ts');
const { seedRoles, HttpError } = await import('./permissions.ts');
migrate();
seedRoles();
const express = (await import('express')).default;
const docRoutes = (await import('./routes/docs.ts')).default;

const role = (name: string, perms: string[]) => run('INSERT INTO roles(name, permissions) VALUES (?, ?)', name, JSON.stringify(perms)).id;
const user = (username: string, perms: string[]) =>
  run("INSERT INTO users(username, full_name, password_hash, default_role_id) VALUES (?, ?, 'x', ?)", username, username, role(username, perms)).id;

const none = user('none', ['plan.view']);
const viewer = user('viewer', ['document.view']);
const author = user('author', ['document.view', 'document.create', 'document.export']);
const author2 = user('author2', ['document.view', 'document.create']);
const allViewer = user('allviewer', ['document.view_all', 'document.export']);
const editor = user('editor', ['document.view_all', 'document.edit']);
const deleter = user('deleter', ['document.view_all', 'document.delete']);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = get<any>('SELECT * FROM users WHERE id = ?', Number(req.headers['x-user'])); next(); });
app.use('/api/docs', docRoutes);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 500).json({ error: String(err?.message) }));
const server = app.listen(0);
after(() => server.close());
const api = async (userId: number, method: string, url: string, body?: unknown) => {
  const isForm = body instanceof FormData;
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${url}`, {
    method, headers: { 'x-user': String(userId), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* tải về: nội dung tệp */ }
  return { status: r.status, body: json };
};
const upload = (userId: number, name: string, folder: number | 'root' = 'root') => {
  const fd = new FormData();
  fd.append('files', new Blob(['%PDF'], { type: 'application/pdf' }), name);
  return api(userId, 'POST', `/docs/files?folder=${folder}`, fd);
};
const fileId = (name: string) => get<{ id: number }>('SELECT id FROM doc_files WHERE filename = ?', name)!.id;

test('every docs API needs Tài liệu nội bộ – Xem or Xem tất cả', async () => {
  for (const [m, u] of [['GET', '/docs/folders'], ['GET', '/docs/files'], ['GET', '/docs/files?q=a'], ['POST', '/docs/folders']] as const) {
    assert.equal((await api(none, m, u, m === 'POST' ? { name: 'X' } : undefined)).status, 403, `${m} ${u}`);
  }
  assert.equal((await api(viewer, 'GET', '/docs/folders')).status, 200);
  assert.equal((await api(allViewer, 'GET', '/docs/folders')).status, 200);
});

test('creating folders and uploading need Thêm', async () => {
  assert.equal((await api(viewer, 'POST', '/docs/folders', { name: 'Không được' })).status, 403);
  assert.equal((await upload(viewer, 'khong.pdf')).status, 403);
  assert.equal((await api(author, 'POST', '/docs/folders', { name: 'Quy chế' })).status, 201);
  assert.equal((await upload(author, 'cua-author.pdf')).status, 201);
  assert.equal((await upload(author2, 'cua-author2.pdf')).status, 201);
});

test('Xem shows every folder but only my own files; Xem tất cả shows everyone\'s', async () => {
  // Thư mục: ai có Xem cũng thấy mọi thư mục
  assert.deepEqual((await api(viewer, 'GET', '/docs/folders')).body.map((f: any) => f.name), ['Quy chế']);
  const names = async (u: number, url: string) => (await api(u, 'GET', url)).body.map((f: any) => f.filename).sort();
  assert.deepEqual(await names(author, '/docs/files?folder=root'), ['cua-author.pdf']);
  assert.deepEqual(await names(author2, '/docs/files?folder=root'), ['cua-author2.pdf']);
  assert.deepEqual(await names(viewer, '/docs/files?folder=root'), []);
  assert.deepEqual(await names(allViewer, '/docs/files?folder=root'), ['cua-author.pdf', 'cua-author2.pdf']);
  // Tìm kiếm cũng chỉ trong tệp mình thấy
  assert.deepEqual(await names(author, '/docs/files?q=cua'), ['cua-author.pdf']);
  assert.deepEqual(await names(allViewer, '/docs/files?q=cua'), ['cua-author.pdf', 'cua-author2.pdf']);
});

test('download needs Tải về and a file I can see', async () => {
  assert.equal((await api(author, 'GET', `/docs/files/${fileId('cua-author.pdf')}/download`)).status, 200);
  assert.equal((await api(author2, 'GET', `/docs/files/${fileId('cua-author2.pdf')}/download`)).status, 403);
  assert.equal((await api(author, 'GET', `/docs/files/${fileId('cua-author2.pdf')}/download`)).status, 404);
  assert.equal((await api(allViewer, 'GET', `/docs/files/${fileId('cua-author2.pdf')}/download`)).status, 200);
});

test('editing / deleting my own items needs Thêm; someone else\'s needs Sửa / Xóa', async () => {
  const folder = get<{ id: number }>("SELECT id FROM doc_folders WHERE name = 'Quy chế'")!.id;
  // Người tạo mất ô Thêm → không sửa / xóa được của mình
  const lost = user('lost', ['document.view']);
  run("INSERT INTO doc_files(folder_id, filename, stored_name, mime, size, uploader_id, created_at) VALUES (NULL, 'cua-lost.pdf', 'x-lost', 'application/pdf', 1, ?, '2026-01-01')", lost);
  assert.equal((await api(lost, 'PATCH', `/docs/files/${fileId('cua-lost.pdf')}`, { filename: 'doi.pdf' })).status, 403);
  assert.equal((await api(lost, 'DELETE', `/docs/files/${fileId('cua-lost.pdf')}`)).status, 403);
  // Có ô Thêm: sửa của mình được, của người khác không
  assert.equal((await api(author, 'PATCH', `/docs/files/${fileId('cua-author.pdf')}`, { folder_id: folder })).status, 200);
  assert.equal((await api(author, 'PATCH', `/docs/folders/${folder}`, { name: 'Quy chế mới' })).status, 200);
  assert.equal((await api(author2, 'PATCH', `/docs/folders/${folder}`, { name: 'Đổi' })).status, 403);
  assert.equal((await api(author2, 'DELETE', `/docs/folders/${folder}`)).status, 403);
  // Sửa / Xóa của người khác
  assert.equal((await api(editor, 'PATCH', `/docs/files/${fileId('cua-author2.pdf')}`, { filename: 'doi-ten.pdf' })).status, 200);
  assert.equal((await api(editor, 'DELETE', `/docs/files/${fileId('doi-ten.pdf')}`)).status, 403);
  assert.equal((await api(deleter, 'PATCH', `/docs/files/${fileId('doi-ten.pdf')}`, { filename: 'x.pdf' })).status, 403);
  assert.equal((await api(deleter, 'DELETE', `/docs/files/${fileId('doi-ten.pdf')}`)).status, 200);
  assert.equal((await api(author, 'DELETE', `/docs/files/${fileId('cua-author.pdf')}`)).status, 200);
});
