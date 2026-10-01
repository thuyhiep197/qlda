import { Router } from 'express';
import { all, get, run, tx } from '../db.ts';
import type { NextFunction, Request, Response } from 'express';
import { hashPassword, validatePassword } from '../auth.ts';
import {
  accountRoleId, ACTIONS, badRequest, cleanPermissionList, FEATURE_GROUPS, forbidden, isPermission, notFound,
  requireUserPerm, userPermissions,
} from '../permissions.ts';

/** Middleware: bắt buộc có quyền (theo tài khoản). */
const need = (perm: string) => (req: Request, _res: Response, next: NextFunction) => { requireUserPerm(req.user, perm); next(); };

const r = Router();

const USER_COLS = `id, username, full_name, email, is_admin, is_active, must_change_password, created_at, last_login_at,
  default_role_id, (SELECT name FROM roles WHERE roles.id = users.default_role_id) AS default_role_name`;

function checkRole(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const role = get('SELECT id FROM roles WHERE id = ?', Number(v));
  if (!role) throw badRequest('Vai trò không hợp lệ');
  return role.id;
}

/** Danh sách rút gọn cho mọi người dùng đã đăng nhập (dùng khi chọn người). */
r.get('/users/basic', (_req, res) => {
  res.json(all(`SELECT u.id, u.username, u.full_name, u.default_role_id, r.name AS default_role_name
    FROM users u LEFT JOIN roles r ON r.id = u.default_role_id WHERE u.is_active = 1 ORDER BY u.full_name`));
});

function memberships(userId: number) {
  return all(`SELECT pm.project_id, p.key AS project_key, p.name AS project_name, pm.role_id, r.name AS role_name
    FROM project_members pm JOIN projects p ON p.id = pm.project_id JOIN roles r ON r.id = pm.role_id
    WHERE pm.user_id = ? AND p.is_archived = 0 ORDER BY p.name`, userId);
}

/** Thay toàn bộ danh sách dự án người dùng được tham gia (vai trò lấy theo tài khoản). */
function setProjects(userId: number, list: unknown) {
  if (!Array.isArray(list)) throw badRequest('Danh sách dự án không hợp lệ');
  const ids = [...new Set(list.map(Number))];
  for (const id of ids) if (!get('SELECT 1 FROM projects WHERE id = ?', id)) throw badRequest('Dự án không hợp lệ');
  const roleId = accountRoleId(userId);
  run('DELETE FROM project_members WHERE user_id = ? AND project_id IN (SELECT id FROM projects WHERE is_archived = 0)', userId);
  for (const id of ids) run('INSERT OR REPLACE INTO project_members(project_id, user_id, role_id) VALUES (?,?,?)', id, userId, roleId);
}

r.get('/users', need('user.view'), (_req, res) => {
  const users = all(`SELECT ${USER_COLS} FROM users ORDER BY is_active DESC, full_name`);
  res.json(users.map((u) => ({ ...u, memberships: memberships(u.id) })));
});

function checkUsername(v: unknown) {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(s)) throw badRequest('Tên đăng nhập 3–50 ký tự, chỉ gồm chữ thường không dấu, số, dấu . _ -');
  return s;
}

r.post('/users', need('user.create'), (req, res) => {
  const b = req.body || {};
  const username = checkUsername(b.username);
  const full_name = String(b.full_name || '').trim();
  if (!full_name) throw badRequest('Họ tên không được để trống');
  if (get('SELECT 1 FROM users WHERE username = ?', username)) throw badRequest('Tên đăng nhập đã tồn tại');
  const password = validatePassword(b.password);
  const roleId = checkRole(b.default_role_id);
  if (!roleId) throw badRequest('Vui lòng chọn nhóm người dùng cho tài khoản');
  if (b.is_admin && !req.user.is_admin) throw forbidden('Chỉ quản trị hệ thống được tạo tài khoản quản trị');
  const id = tx(() => {
    const { id } = run(
      'INSERT INTO users(username, full_name, email, password_hash, is_admin, default_role_id, must_change_password) VALUES (?,?,?,?,?,?,1)',
      username, full_name, b.email || null, hashPassword(password), !!b.is_admin, roleId,
    );
    if (b.project_ids !== undefined) setProjects(id, b.project_ids);
    return id;
  });
  res.status(201).json(get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id));
});

r.patch('/users/:id', need('user.edit'), (req, res) => {
  const id = Number(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  const b = req.body || {};
  if (b.is_admin !== undefined && !!b.is_admin !== !!u.is_admin && !req.user.is_admin) throw forbidden('Chỉ quản trị hệ thống được cấp hoặc gỡ quyền quản trị');
  if (b.is_active === false && u.is_active) requireUserPerm(req.user, 'user.delete');
  if (id === req.user.id && (b.is_active === false || b.is_admin === false)) {
    throw badRequest('Không thể tự khóa hoặc tự gỡ quyền quản trị của chính mình');
  }
  const full_name = b.full_name !== undefined ? String(b.full_name).trim() : u.full_name;
  if (!full_name) throw badRequest('Họ tên không được để trống');
  tx(() => {
    run('UPDATE users SET full_name = ?, email = ?, is_admin = ?, is_active = ?, default_role_id = ? WHERE id = ?',
      full_name,
      b.email !== undefined ? b.email || null : u.email,
      b.is_admin !== undefined ? !!b.is_admin : u.is_admin,
      b.is_active !== undefined ? !!b.is_active : u.is_active,
      b.default_role_id !== undefined ? checkRole(b.default_role_id) : u.default_role_id,
      id);
    run('UPDATE project_members SET role_id = ? WHERE user_id = ?', accountRoleId(id), id);
    if (b.project_ids !== undefined) setProjects(id, b.project_ids);
  });
  res.json(get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id));
});

r.post('/users/:id/reset-password', need('user.edit'), (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw notFound();
  const password = validatePassword(req.body?.password);
  run('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?', hashPassword(password), id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Vai trò & quyền
// ---------------------------------------------------------------------------
r.get('/permissions', (_req, res) => res.json({ actions: ACTIONS, groups: FEATURE_GROUPS }));

r.get('/roles', (_req, res) => {
  const rows = all(`SELECT r.*, (SELECT COUNT(*) FROM project_members pm WHERE pm.role_id = r.id)
      + (SELECT COUNT(*) FROM users u WHERE u.default_role_id = r.id) AS usage
    FROM roles r ORDER BY r.id`);
  res.json(rows.map((x) => ({ ...x, permissions: JSON.parse(x.permissions) })));
});

function cleanPerms(v: unknown) {
  if (!Array.isArray(v)) throw badRequest('Danh sách quyền không hợp lệ');
  return JSON.stringify(cleanPermissionList(v));
}

r.post('/roles', need('role.create'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Tên nhóm không được để trống');
  if (get('SELECT 1 FROM roles WHERE name = ?', name)) throw badRequest('Tên nhóm đã tồn tại');
  const { id } = run('INSERT INTO roles(name, description, permissions) VALUES (?,?,?)',
    name, req.body?.description || null, cleanPerms(req.body?.permissions || []));
  res.status(201).json({ id });
});

r.patch('/roles/:id', need('role.edit'), (req, res) => {
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

r.delete('/roles/:id', need('role.delete'), (req, res) => {
  const id = Number(req.params.id);
  if (get('SELECT 1 FROM users WHERE default_role_id = ?', id)) {
    throw badRequest('Vai trò đang là vai trò chính của một số tài khoản, hãy đổi vai trò của các tài khoản đó trước khi xóa');
  }
  if (get('SELECT 1 FROM project_members WHERE role_id = ?', id)) {
    throw badRequest('Vai trò đang được sử dụng trong dự án, hãy đổi vai trò của các thành viên trước khi xóa');
  }
  run('DELETE FROM roles WHERE id = ?', id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Phân quyền riêng theo người dùng: cho phép thêm / chặn từng quyền ngoài quyền của nhóm
// ---------------------------------------------------------------------------
function userPermView(userId: number) {
  const u = get<{ id: number; is_admin: number; default_role_id: number | null; full_name: string }>('SELECT id, is_admin, default_role_id, full_name FROM users WHERE id = ?', userId);
  if (!u) throw notFound();
  const role = u.default_role_id ? get<{ name: string; permissions: string }>('SELECT name, permissions FROM roles WHERE id = ?', u.default_role_id) : null;
  let group: string[] = [];
  try { group = role ? JSON.parse(role.permissions) : []; } catch { /* nhóm lỗi */ }
  const overrides = Object.fromEntries(all<{ permission: string; effect: string }>('SELECT permission, effect FROM user_permissions WHERE user_id = ?', userId)
    .map((o) => [o.permission, o.effect]));
  const effective = [...userPermissions(u)].filter(isPermission);
  return { user_id: u.id, full_name: u.full_name, is_admin: !!u.is_admin, role_name: role?.name ?? null, group: group.filter(isPermission), overrides, effective };
}

r.get('/users/:id/permissions', (req, res) => {
  const id = Number(req.params.id);
  if (id !== req.user.id) { const p = userPermissions(req.user); if (!p.has('role.view') && !p.has('user.view')) throw forbidden(); }
  res.json(userPermView(id));
});

/** Ghi đè quyền riêng: { overrides: { issue.import: allow, issue.delete: deny, ... } } — quyền không có trong danh sách = theo nhóm. */
r.put('/users/:id/permissions', need('role.edit'), (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw notFound();
  const o = req.body?.overrides;
  if (!o || typeof o !== 'object') throw badRequest('Dữ liệu phân quyền không hợp lệ');
  const entries = Object.entries(o as Record<string, unknown>).filter(([p, e]) => isPermission(p) && (e === 'allow' || e === 'deny'));
  // Không tự chặn quyền phân quyền của chính mình (tránh tự khóa)
  if (id === req.user.id && entries.some(([p, e]) => e === 'deny' && p.startsWith('role.'))) throw badRequest('Không thể tự chặn quyền phân quyền của chính mình');
  tx(() => {
    run('DELETE FROM user_permissions WHERE user_id = ?', id);
    for (const [p, e] of entries) run('INSERT INTO user_permissions(user_id, permission, effect) VALUES (?,?,?)', id, p, String(e));
  });
  res.json(userPermView(id));
});

export default r;
