import { positionCodes, primaryCode } from '../positions.ts';
import { Router } from 'express';
import { all, get, now, run, tx } from '../db.ts';
import { revokeAllApiKeys } from '../api-keys.ts';
import type { NextFunction, Request, Response } from 'express';
import { hashPassword, validatePassword } from '../auth.ts';
import { audit, listAudit } from '../audit.ts';
import {
  accountRoleId, ACTIONS, canManageAccountPermissions, isAdminRole, badRequest, cleanPermissionList, FEATURE_GROUPS, forbidden, isPermission, notFound, SUBSYSTEMS,
  requireUserPerm, userPermissions,
} from '../permissions.ts';
import { avatarUrl } from '../avatar.ts';
import { cleanPlacement } from './staff.ts';

/** Middleware: bắt buộc có quyền (theo tài khoản). */
const need = (perm: string) => (req: Request, _res: Response, next: NextFunction) => { requireUserPerm(req.user, perm); next(); };

const r = Router();

const USER_COLS = `id, username, full_name, email, avatar, is_admin, is_active, must_change_password, created_at, last_login_at, department_id, positions,
  default_role_id, (SELECT name FROM roles WHERE roles.id = users.default_role_id) AS default_role_name,
  (SELECT CASE WHEN pd.id IS NULL OR pd.parent_id IS NULL THEN d.name ELSE pd.name || ' › ' || d.name END FROM departments d LEFT JOIN departments pd ON pd.id = d.parent_id
    WHERE d.id = users.department_id) AS department_name`;
/** Tài khoản trả về: ảnh đại diện, vị trí dạng danh sách */
const userJson = (u: any) => { const { avatar, ...user } = u; return { ...user, positions: String(u.positions ?? '').split(',').filter(Boolean), avatar_url: avatarUrl(avatar) }; };

function checkRole(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const role = get('SELECT id FROM roles WHERE id = ?', Number(v));
  if (!role) throw badRequest('Vai trò không hợp lệ');
  return role.id;
}

/**
 * Người không phải quản trị hệ thống không đổi được nhóm của chính mình và không gán nhóm Quản trị hệ thống.
 * Tài khoản được phân đủ quyền quản lý người dùng và nhóm được gán mọi nhóm thường;
 * quyền nhóm và quyền cấp riêng đều được tính. Nhóm Quản trị hệ thống vẫn dành riêng cho quản trị hệ thống.
 */
function checkAssignableRole(user: Express.Request['user'], roleId: number, targetId?: number) {
  if (user.is_admin) return;
  if (targetId === user.id) throw forbidden('Không thể tự đổi nhóm người dùng của mình');
  if (isAdminRole(roleId)) throw forbidden('Chỉ quản trị hệ thống được gán nhóm Quản trị hệ thống');
  if (canManageAccountPermissions(user)) return;
  const role = get<{ permissions: string }>('SELECT permissions FROM roles WHERE id = ?', roleId);
  let list: unknown = [];
  try { list = JSON.parse(role?.permissions || '[]'); } catch { /* nhóm lỗi → coi như rỗng */ }
  const mine = userPermissions(user);
  if (cleanPermissionList(list).some((p) => !mine.has(p))) throw forbidden('Chỉ được gán nhóm có quyền nằm trong quyền của bạn');
}

/** Tài khoản Quản trị hệ thống: chỉ quản trị hệ thống được sửa thông tin, khóa / mở khóa, đặt lại mật khẩu */
function guardAdminAccount(user: Express.Request['user'], target: { is_admin: number }) {
  if (target.is_admin && !user.is_admin) throw forbidden('Chỉ quản trị hệ thống được sửa tài khoản Quản trị hệ thống');
}

/** Danh sách rút gọn cho mọi người dùng đã đăng nhập (dùng khi chọn người, gợi ý nhắc tên) — không gồm tài khoản Quản trị hệ thống */
r.get('/users/basic', (_req, res) => {
  const users = all(`SELECT u.id, u.username, u.full_name, u.avatar, u.default_role_id, r.name AS default_role_name,
      u.department_id, CASE WHEN pd.id IS NULL OR pd.parent_id IS NULL THEN d.name ELSE pd.name || ' › ' || d.name END AS department_name, d.name AS department_short,
      COALESCE(pd.position, d.position) * 100 + d.position AS department_order, u.positions
    FROM users u LEFT JOIN roles r ON r.id = u.default_role_id LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN departments pd ON pd.id = d.parent_id
    WHERE u.is_active = 1 AND u.is_admin = 0 AND COALESCE(r.is_admin, 0) = 0 ORDER BY u.full_name`);
  // Vị trí của tài khoản (lọc người theo vai trò) và mã vị trí (KD, AM, BA, DEV, HC, BGĐ) hiện cạnh tên trong hành trình khách hàng
  res.json(users.map((u: any) => { const { avatar, ...user } = u; return { ...user, positions: (u.positions ?? '').split(',').filter(Boolean), position_codes: positionCodes(u.positions), department_code: primaryCode(u.positions), avatar_url: avatarUrl(avatar) }; }));
});

function memberships(userId: number) {
  return all(`SELECT pm.project_id, p.key AS project_key, p.name AS project_name, pm.role_id, r.name AS role_name
    FROM project_members pm JOIN projects p ON p.id = pm.project_id JOIN roles r ON r.id = pm.role_id
    WHERE pm.user_id = ? AND p.is_archived = 0 ORDER BY p.name`, userId);
}

r.get('/users', need('user.view'), (_req, res) => {
  const users = all(`SELECT ${USER_COLS} FROM users ORDER BY is_active DESC, full_name`);
  // Số quyền cấp thêm riêng (ngoài nhóm) — hiện ở Phân quyền → Theo người dùng
  const extra = new Map(all<{ user_id: number; n: number }>("SELECT user_id, COUNT(*) n FROM user_permissions WHERE effect = 'allow' GROUP BY user_id").map((x) => [x.user_id, x.n]));
  res.json(users.map((u: any) => ({ ...userJson(u), memberships: memberships(u.id), extra_permissions: extra.get(u.id) ?? 0 })));
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
  const password = validatePassword(b.password, username);
  const roleId = checkRole(b.default_role_id);
  if (!roleId) throw badRequest('Vui lòng chọn nhóm người dùng cho tài khoản');
  // Thuộc nhóm Quản trị hệ thống = quản trị hệ thống
  const isAdmin = isAdminRole(roleId);
  if (isAdmin && !req.user.is_admin) throw forbidden('Chỉ quản trị hệ thống được tạo tài khoản quản trị');
  checkAssignableRole(req.user, roleId);
  // Phòng ban + vị trí (sơ đồ Phòng ban & Nhân sự): bắt buộc khi tạo, là một phần của Tài khoản – Thêm;
  // tài khoản Quản trị hệ thống không nằm trong sơ đồ nên được bỏ trống
  if (!isAdmin && !b.department_id) throw badRequest('Vui lòng chọn phòng ban cho tài khoản');
  const place = cleanPlacement(isAdmin && !b.department_id ? {} : b, !isAdmin);
  const { id } = run(
    'INSERT INTO users(username, full_name, email, password_hash, is_admin, default_role_id, must_change_password, department_id, positions) VALUES (?,?,?,?,?,?,1,?,?)',
    username, full_name, b.email || null, hashPassword(password), isAdmin ? 1 : 0, roleId, place.department_id, place.positions,
  );
  audit(req, 'user_created', { target: username, detail: { full_name, role: get('SELECT name FROM roles WHERE id = ?', roleId)?.name, is_admin: isAdmin } });
  res.status(201).json(userJson(get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id)));
});

r.patch('/users/:id', need('user.edit'), (req, res) => {
  const id = Number(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw notFound();
  const b = req.body || {};
  guardAdminAccount(req.user, u);
  // Quản trị hệ thống theo nhóm: vào / rời nhóm Quản trị hệ thống là cấp / gỡ quyền quản trị
  const roleId = b.default_role_id !== undefined ? checkRole(b.default_role_id) : u.default_role_id;
  const isAdmin = isAdminRole(roleId);
  if (isAdmin !== !!u.is_admin && !req.user.is_admin) throw forbidden('Chỉ quản trị hệ thống được cấp hoặc gỡ quyền quản trị');
  if (roleId && roleId !== u.default_role_id) checkAssignableRole(req.user, roleId, id);
  // Phòng ban + vị trí: cần quyền Nhân sự – Sửa
  const placing = b.department_id !== undefined || b.positions !== undefined;
  if (placing) requireUserPerm(req.user, 'staff.edit');
  if (b.is_active === false && u.is_active) requireUserPerm(req.user, 'user.delete');
  if (id === req.user.id && (b.is_active === false || (u.is_admin && !isAdmin))) {
    throw badRequest('Không thể tự khóa hoặc tự rời nhóm Quản trị hệ thống');
  }
  // Luôn còn ít nhất một quản trị hệ thống đang hoạt động
  if (u.is_admin && u.is_active && (!isAdmin || b.is_active === false)
    && !get('SELECT 1 FROM users WHERE is_admin = 1 AND is_active = 1 AND id <> ?', id)) throw badRequest('Phải còn ít nhất một tài khoản Quản trị hệ thống');
  const full_name = b.full_name !== undefined ? String(b.full_name).trim() : u.full_name;
  if (!full_name) throw badRequest('Họ tên không được để trống');
  tx(() => {
    run('UPDATE users SET full_name = ?, email = ?, is_admin = ?, is_active = ?, default_role_id = ? WHERE id = ?',
      full_name,
      b.email !== undefined ? b.email || null : u.email,
      isAdmin ? 1 : 0,
      b.is_active !== undefined ? !!b.is_active : u.is_active,
      roleId,
      id);
    run('UPDATE project_members SET role_id = ? WHERE user_id = ?', accountRoleId(id), id);
    // Mở khóa → đếm lại số lần sai mật khẩu từ đầu
    if (b.is_active === true && !u.is_active) run('UPDATE users SET failed_logins = 0 WHERE id = ?', id);
    // Phòng ban + vị trí (gửi kèm thì cập nhật; bỏ trống phòng ban = chưa xếp phòng)
    if (placing) {
      const place = cleanPlacement({ department_id: u.department_id, positions: u.positions, note: u.staff_note, ...b }, false);
      run('UPDATE users SET department_id = ?, positions = ?, manager_id = CASE WHEN ? IS NULL THEN NULL ELSE manager_id END WHERE id = ?', place.department_id, place.positions, place.department_id, id);
    }
  });
  const after = get('SELECT * FROM users WHERE id = ?', id);
  const changes: Record<string, unknown> = {};
  if (!!after.is_admin !== !!u.is_admin) changes.quan_tri_he_thong = after.is_admin ? 'CẤP' : 'GỠ';
  if (!!after.is_active !== !!u.is_active) changes.tai_khoan = after.is_active ? 'Mở khóa' : 'Khóa';
  if (after.default_role_id !== u.default_role_id) changes.nhom = `${get('SELECT name FROM roles WHERE id = ?', u.default_role_id)?.name ?? '—'} → ${get('SELECT name FROM roles WHERE id = ?', after.default_role_id)?.name ?? '—'}`;
  if (after.full_name !== u.full_name) changes.ho_ten = `${u.full_name} → ${after.full_name}`;
  if (after.email !== u.email) changes.email = `${u.email ?? '—'} → ${after.email ?? '—'}`;
  audit(req, 'user_updated', { target: u.username, detail: changes });
  res.json(userJson(get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id)));
});

/** Mật khẩu tạm khi admin đặt lại: cố định; người dùng bắt buộc đổi khi đăng nhập. */
export const RESET_PASSWORD = 'qlda@868686';

r.post('/users/:id/reset-password', need('user.edit'), (req, res) => {
  const id = Number(req.params.id);
  const target = get<{ username: string; is_admin: number }>('SELECT username, is_admin FROM users WHERE id = ?', id);
  if (!target) throw notFound();
  guardAdminAccount(req.user, target);
  // Cấp mật khẩu mới thì đếm lại số lần sai từ đầu (trước đây giữ số cũ: đã sai 4 lần thì gõ nhầm mật khẩu tạm 1 lần là bị khóa)
  run('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, token_version = token_version + 1 WHERE id = ?', hashPassword(RESET_PASSWORD), id);
  revokeAllApiKeys(id);
  audit(req, 'password_reset', { target: target.username });
  res.json({ ok: true, password: RESET_PASSWORD });
});

// ---------------------------------------------------------------------------
// Vai trò & quyền
// ---------------------------------------------------------------------------
r.get('/permissions', (_req, res) => res.json({ actions: ACTIONS, subsystems: SUBSYSTEMS, groups: FEATURE_GROUPS }));

r.get('/roles', (req, res) => {
  // Danh sách nhóm: màn hình Người dùng (chọn nhóm) và Phân quyền
  const p = userPermissions(req.user);
  if (!p.has('role.view') && !p.has('user.view')) throw forbidden();
  // Số người = số tài khoản thuộc nhóm (không cộng lượt tham gia dự án — vai trò trong dự án theo nhóm của tài khoản)
  const rows = all(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.default_role_id = r.id) AS usage,
      (SELECT COUNT(*) FROM project_members pm WHERE pm.role_id = r.id) AS project_usage
    FROM roles r ORDER BY r.id`);
  res.json(rows.map((x) => ({ ...x, permissions: cleanPermissionList(JSON.parse(x.permissions)) })));
});

function cleanPerms(v: unknown) {
  if (!Array.isArray(v)) throw badRequest('Danh sách quyền không hợp lệ');
  return JSON.stringify(cleanPermissionList(v));
}

/** Tài khoản được phân đủ quyền quản lý tài khoản có thể cấp quyền cho người khác theo đúng quyền đã được cấp. */
function checkGrantable(user: Express.Request['user'], perms: string, before: string[] = []) {
  if (canManageAccountPermissions(user)) return;
  const mine = userPermissions(user);
  if ((JSON.parse(perms) as string[]).some((p) => !before.includes(p) && !mine.has(p))) throw forbidden('Chỉ được cấp quyền nằm trong quyền của bạn');
}

r.post('/roles', need('role.create'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Tên nhóm không được để trống');
  if (get('SELECT 1 FROM roles WHERE name = ?', name)) throw badRequest('Tên nhóm đã tồn tại');
  const perms = cleanPerms(req.body?.permissions || []);
  checkGrantable(req.user, perms);
  const { id } = run('INSERT INTO roles(name, description, permissions) VALUES (?,?,?)', name, req.body?.description || null, perms);
  audit(req, 'role_created', { target: name });
  res.status(201).json({ id });
});

r.patch('/roles/:id', need('role.edit'), (req, res) => {
  const role = get('SELECT * FROM roles WHERE id = ?', Number(req.params.id));
  if (!role) throw notFound();
  // Nhóm Quản trị hệ thống: toàn quyền cố định, không đổi tên / quyền
  if (role.is_admin && ((req.body?.name !== undefined && String(req.body.name).trim() !== role.name) || req.body?.permissions !== undefined)) {
    throw badRequest('Nhóm Quản trị hệ thống luôn có toàn quyền, không đổi tên hay sửa quyền được');
  }
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : role.name;
  if (!name) throw badRequest('Tên vai trò không được để trống');
  if (get('SELECT 1 FROM roles WHERE name = ? AND id <> ?', name, role.id)) throw badRequest('Tên vai trò đã tồn tại');
  if (req.body?.permissions !== undefined) {
    const permissions = cleanPerms(req.body.permissions);
    checkGrantable(req.user, permissions, JSON.parse(role.permissions || '[]'));
    // Không cho người quản lý tài khoản tự nâng quyền qua nhóm đang gán cho chính mình.
    if (!req.user.is_admin && role.id === accountRoleId(req.user.id)) {
      const mine = userPermissions(req.user);
      if ((JSON.parse(permissions) as string[]).some((permission) => !mine.has(permission))) {
        throw forbidden('Không thể tự nâng quyền qua nhóm người dùng của mình');
      }
    }
  }
  run('UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?',
    name,
    req.body?.description !== undefined ? req.body.description || null : role.description,
    req.body?.permissions !== undefined ? cleanPerms(req.body.permissions) : role.permissions,
    role.id);
  if (req.body?.permissions !== undefined) {
    const before = new Set<string>(JSON.parse(role.permissions || '[]'));
    const now2 = new Set<string>(JSON.parse(cleanPerms(req.body.permissions)));
    audit(req, 'role_permissions', { target: name, detail: { them: [...now2].filter((p) => !before.has(p)), bo: [...before].filter((p) => !now2.has(p)) } });
  } else audit(req, 'role_updated', { target: name });
  res.json({ ok: true });
});

r.delete('/roles/:id', need('role.delete'), (req, res) => {
  const id = Number(req.params.id);
  if (isAdminRole(id)) throw badRequest('Không xóa được nhóm Quản trị hệ thống');
  if (get('SELECT 1 FROM users WHERE default_role_id = ?', id)) {
    throw badRequest('Vai trò đang là vai trò chính của một số tài khoản, hãy đổi vai trò của các tài khoản đó trước khi xóa');
  }
  if (get('SELECT 1 FROM project_members WHERE role_id = ?', id)) {
    throw badRequest('Vai trò đang được sử dụng trong dự án, hãy đổi vai trò của các thành viên trước khi xóa');
  }
  audit(req, 'role_deleted', { target: get('SELECT name FROM roles WHERE id = ?', id)?.name });
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
  // Quyền cấp thêm riêng (ngoài nhóm)
  const overrides = Object.fromEntries(all<{ permission: string }>("SELECT permission FROM user_permissions WHERE user_id = ? AND effect = 'allow'", userId)
    .filter((o) => isPermission(o.permission) && !group.includes(o.permission)).map((o) => [o.permission, 'allow']));
  const effective = [...userPermissions(u)].filter(isPermission);
  return { user_id: u.id, full_name: u.full_name, is_admin: !!u.is_admin, role_name: role?.name ?? null, group: group.filter(isPermission), overrides, effective };
}

r.get('/users/:id/permissions', (req, res) => {
  const id = Number(req.params.id);
  if (id !== req.user.id) { const p = userPermissions(req.user); if (!p.has('role.view') && !p.has('user.view')) throw forbidden(); }
  res.json(userPermView(id));
});

/** Quyền cấp thêm riêng cho người dùng: { overrides: { issue.import: 'allow', ... } } — quyền thực tế = quyền nhóm + các quyền này (không chặn bớt quyền nhóm). */
r.put('/users/:id/permissions', need('role.edit'), (req, res) => {
  const id = Number(req.params.id);
  const target = get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', id);
  if (!target) throw notFound();
  if (target.is_admin && !req.user.is_admin) throw forbidden('Chỉ quản trị hệ thống được phân quyền tài khoản Quản trị hệ thống');
  const o = req.body?.overrides;
  if (!o || typeof o !== 'object') throw badRequest('Dữ liệu phân quyền không hợp lệ');
  const entries = Object.entries(o as Record<string, unknown>).filter(([p, e]) => isPermission(p) && e === 'allow');
  // Không ai ngoài quản trị hệ thống được tự cấp quyền riêng cho mình.
  if (!req.user.is_admin && id === req.user.id) throw forbidden('Không thể tự cấp quyền riêng cho mình');
  if (!req.user.is_admin && !canManageAccountPermissions(req.user)) {
    const mine = userPermissions(req.user);
    const before = new Set(all<{ permission: string }>("SELECT permission FROM user_permissions WHERE user_id = ? AND effect = 'allow'", id).map((x) => x.permission));
    if (entries.some(([p]) => !before.has(p) && !mine.has(p))) throw forbidden('Chỉ được cấp quyền nằm trong quyền của bạn');
  }
  tx(() => {
    run('DELETE FROM user_permissions WHERE user_id = ?', id);
    for (const [p, e] of entries) run('INSERT INTO user_permissions(user_id, permission, effect) VALUES (?,?,?)', id, p, String(e));
  });
  audit(req, 'user_permissions', { target: get('SELECT username FROM users WHERE id = ?', id)?.username, detail: Object.fromEntries(entries) });
  res.json(userPermView(id));
});

// ---------------------------------------------------------------------------
// Nhật ký bảo mật & đăng xuất khẩn cấp
// ---------------------------------------------------------------------------
r.get('/audit', need('user.view'), (req, res) => {
  res.json(listAudit({ action: req.query.action ? String(req.query.action) : undefined, user: req.query.user ? String(req.query.user) : undefined,
    q: req.query.q ? String(req.query.q) : undefined, limit: Number(req.query.limit) || 500 }));
});

/** Khẩn cấp: thu hồi mọi phiên đăng nhập của mọi người (trừ phiên của người bấm). Chỉ quản trị hệ thống. */
r.post('/users/logout-all', (req, res) => {
  if (!req.user.is_admin) throw forbidden('Chỉ quản trị hệ thống được thực hiện');
  const n = run('UPDATE users SET token_version = token_version + 1 WHERE id <> ?', req.user.id).changes;
  // API key của mọi người (trừ người bấm) cũng thu hồi
  run('UPDATE api_keys SET revoked_at = ? WHERE user_id <> ? AND revoked_at IS NULL', now(), req.user.id);
  audit(req, 'logout_all', { detail: `Thu hồi phiên của ${n} tài khoản` });
  res.json({ ok: true, count: n });
});

export default r;
