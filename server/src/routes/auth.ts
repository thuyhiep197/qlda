import { Router } from 'express';
import { get, now, run } from '../db.ts';
import { COOKIE, DUMMY_HASH, hashPassword, issueToken, requireAuth, validatePassword, verifyPassword } from '../auth.ts';
import { audit } from '../audit.ts';
import { HttpError, userPermissions } from '../permissions.ts';

const r = Router();

// Chống dò mật khẩu (BẬT mặc định; chỉ tắt khi đặt LOGIN_LOCKOUT=off trong .env):
// trong 15 phút, tối đa 5 lần sai cho mỗi tài khoản và 30 lần sai cho mỗi địa chỉ IP
const LOCKOUT = process.env.LOGIN_LOCKOUT !== 'off';
const WINDOW = 15 * 60_000;
const LIMITS = { user: 5, ip: 30 };
const failures = new Map<string, { count: number; until: number }>();

const blocked = (key: string, limit: number) => {
  const f = failures.get(key);
  return !!f && f.until > Date.now() && f.count >= limit;
};
const fail = (key: string) => {
  const f = failures.get(key);
  const cur = f && f.until > Date.now() ? f : { count: 0, until: 0 };
  failures.set(key, { count: cur.count + 1, until: Date.now() + WINDOW });
};
setInterval(() => {
  for (const [k, f] of failures) if (f.until <= Date.now()) failures.delete(k);
}, WINDOW).unref();

r.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const userKey = `u:${username}`, ipKey = `ip:${req.ip}`;
  if (LOCKOUT && (blocked(userKey, LIMITS.user) || blocked(ipKey, LIMITS.ip))) {
    audit(req, 'login_blocked', { userId: null, username, detail: 'Bị chặn do sai mật khẩu quá nhiều lần' });
    throw new HttpError(429, 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút');
  }
  const user = get('SELECT * FROM users WHERE username = ?', username);
  const okPw = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !okPw) {
    fail(userKey);
    fail(ipKey);
    audit(req, 'login_failed', { userId: user?.id ?? null, username, detail: user ? 'Sai mật khẩu' : 'Tên đăng nhập không tồn tại' });
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  if (!user.is_active) {
    audit(req, 'login_failed', { userId: user.id, username, detail: 'Tài khoản đã bị khóa' });
    throw new HttpError(403, 'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
  }
  failures.delete(userKey);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), user.id);
  issueToken(res, user.id);
  audit(req, 'login', { userId: user.id, username: user.username, detail: user.is_admin ? 'Quản trị hệ thống' : null });
  res.json({ ok: true });
});

r.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  const extra = get<{ preferences: string; phone: string | null; job_title: string | null; created_at: string; last_login_at: string | null; role_name: string | null; role_permissions: string | null }>(
    `SELECT u.preferences, u.phone, u.job_title, u.created_at, u.last_login_at, r.name AS role_name, r.permissions AS role_permissions
     FROM users u LEFT JOIN roles r ON r.id = u.default_role_id WHERE u.id = ?`, req.user.id)!;
  let preferences = {};
  try { preferences = JSON.parse(extra.preferences || '{}'); } catch { /* giữ mặc định */ }
  const { role_permissions: _rp, ...info } = extra;
  // Quyền thực tế của tài khoản (nhóm + quyền riêng) — giao diện dùng để ẩn/hiện chức năng
  res.json({ ...req.user, ...info, preferences, permissions: [...userPermissions(req.user)] });
});

// ---------------------------------------------------------------------------
// Cài đặt tài khoản cá nhân
// ---------------------------------------------------------------------------
const THEMES = ['light', 'dark', 'system'];
const NOTIFY_TYPES = ['mention', 'assigned', 'comment', 'status', 'flag'];

/** Giao diện và loại thông báo muốn nhận. Chỉ ghi các khóa hợp lệ. */
r.put('/preferences', requireAuth, (req, res) => {
  const cur = JSON.parse(get<{ p: string }>('SELECT preferences p FROM users WHERE id = ?', req.user.id)!.p || '{}');
  const b = req.body || {};
  if (b.theme !== undefined) {
    if (!THEMES.includes(b.theme)) throw new HttpError(400, 'Giao diện không hợp lệ');
    cur.theme = b.theme;
  }
  if (b.notify !== undefined) {
    cur.notify = { ...(cur.notify || {}) };
    for (const t of NOTIFY_TYPES) if (typeof b.notify?.[t] === 'boolean') cur.notify[t] = b.notify[t];
  }
  run('UPDATE users SET preferences = ? WHERE id = ?', JSON.stringify(cur), req.user.id);
  res.json({ ok: true, preferences: cur });
});

/** Đăng xuất khỏi mọi thiết bị khác (thu hồi mọi phiên cũ, giữ phiên hiện tại). */
r.post('/logout-others', requireAuth, (req, res) => {
  run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', req.user.id);
  audit(req, 'logout_others');
  issueToken(res, req.user.id);
  res.json({ ok: true });
});

r.post('/change-password', requireAuth, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(String(req.body?.current_password || ''), user.password_hash)) {
    throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  }
  const next = validatePassword(req.body?.new_password, req.user.username);
  if (next === req.body?.current_password) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
  run('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?', hashPassword(next), req.user.id);
  audit(req, 'password_changed');
  issueToken(res, req.user.id);
  res.json({ ok: true });
});

r.patch('/profile', requireAuth, (req, res) => {
  const full_name = String(req.body?.full_name || '').trim();
  if (!full_name) throw new HttpError(400, 'Họ tên không được để trống');
  const email = String(req.body?.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  const phone = String(req.body?.phone || '').trim();
  if (phone && !/^[0-9+().\s-]{8,20}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ');
  run('UPDATE users SET full_name = ?, email = ?, phone = ?, job_title = ? WHERE id = ?',
    full_name.slice(0, 100), email || null, phone || null, String(req.body?.job_title || '').trim().slice(0, 100) || null, req.user.id);
  res.json({ ok: true });
});

export default r;
