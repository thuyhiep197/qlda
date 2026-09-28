import { Router } from 'express';
import { all, get, run } from '../db.ts';
import { hashPassword, requireAdmin, validatePassword } from '../auth.ts';
import { ALL_PERMISSIONS, badRequest, notFound, PERMISSIONS } from '../permissions.ts';

const r = Router();

const USER_COLS = 'id, username, full_name, email, is_admin, is_active, must_change_password, created_at, last_login_at';

/** Danh sách rút gọn cho mọi người dùng đã đăng nhập (dùng khi chọn người). */
r.get('/users/basic', (_req, res) => {
  res.json(all('SELECT id, username, full_name FROM users WHERE is_active = 1 ORDER BY full_name'));
});

r.get('/users', requireAdmin, (_req, res) => {
  res.json(all(`SELECT ${USER_COLS},
    (SELECT COUNT(*) FROM project_members pm WHERE pm.user_id = users.id) AS project_count
    FROM users ORDER BY is_active DESC, full_name`));
});

function checkUsername(v: unknown) {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(s)) throw badRequest('Tên đăng nhập 3–50 ký tự, chỉ gồm chữ thường không dấu, số, dấu . _ -');
  return s;
}

r.post('/users', requireAdmin, (req, res) => {
  const b = req.body || {};
  const username = checkUsername(b.username);
  const full_name = String(b.full_name || '').trim();
  if (!full_name) throw badRequest('Họ tên không được để trống');
  if (get('SELECT 1 FROM users WHERE username = ?', username)) throw badRequest('Tên đăng nhập đã tồn tại');
  const password = validatePassword(b.password);
  const { id } = run(
    'INSERT INTO users(username, full_name, email, password_hash, is_admin, must_change_password) VALUES (?,?,?,?,?,1)',
    username, full_name, b.email || null, hashPassword(password), !!b.is_admin,
  );
  res.status(201).json(get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id));
});

r.patch('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  const b = req.body || {};
  if (id === req.user.id && (b.is_active === false || b.is_admin === false)) {
    throw badRequest('Không thể tự khóa hoặc tự gỡ quyền quản trị của chính mình');
  }
  const full_name = b.full_name !== undefined ? String(b.full_name).trim() : u.full_name;
  if (!full_name) throw badRequest('Họ tên không được để trống');
  run('UPDATE users SET full_name = ?, email = ?, is_admin = ?, is_active = ? WHERE id = ?',
    full_name,
    b.email !== undefined ? b.email || null : u.email,
    b.is_admin !== undefined ? !!b.is_admin : u.is_admin,
    b.is_active !== undefined ? !!b.is_active : u.is_active,
    id);
  res.json(get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id));
});

r.post('/users/:id/reset-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw notFound();
  const password = validatePassword(req.body?.password);
  run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', hashPassword(password), id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Vai trò & quyền
// ---------------------------------------------------------------------------
r.get('/permissions', (_req, res) => res.json(PERMISSIONS));

r.get('/roles', (_req, res) => {
  const rows = all(`SELECT r.*, (SELECT COUNT(*) FROM project_members pm WHERE pm.role_id = r.id) AS usage
    FROM roles r ORDER BY r.id`);
  res.json(rows.map((x) => ({ ...x, permissions: JSON.parse(x.permissions) })));
});

function cleanPerms(v: unknown) {
  if (!Array.isArray(v)) throw badRequest('Danh sách quyền không hợp lệ');
  return JSON.stringify(v.filter((p) => ALL_PERMISSIONS.includes(p)));
}

r.post('/roles', requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Tên vai trò không được để trống');
  if (get('SELECT 1 FROM roles WHERE name = ?', name)) throw badRequest('Tên vai trò đã tồn tại');
  const { id } = run('INSERT INTO roles(name, description, permissions) VALUES (?,?,?)',
    name, req.body?.description || null, cleanPerms(req.body?.permissions || []));
  res.status(201).json({ id });
});

r.patch('/roles/:id', requireAdmin, (req, res) => {
  const role = get('SELECT * FROM roles WHERE id = ?', Number(req.params.id));
  if (!role) throw notFound();
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : role.name;
  if (!name) throw badRequest('Tên vai trò không được để trống');
  if (get('SELECT 1 FROM roles WHERE name = ? AND id <> ?', name, role.id)) throw badRequest('Tên vai trò đã tồn tại');
  run('UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?',
    name,
    req.body?.description !== undefined ? req.body.description || null : role.description,
    req.body?.permissions !== undefined ? cleanPerms(req.body.permissions) : role.permissions,
    role.id);
  res.json({ ok: true });
});

r.delete('/roles/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (get('SELECT 1 FROM project_members WHERE role_id = ?', id)) {
    throw badRequest('Vai trò đang được sử dụng trong dự án, hãy đổi vai trò của các thành viên trước khi xóa');
  }
  run('DELETE FROM roles WHERE id = ?', id);
  res.json({ ok: true });
});

export default r;
