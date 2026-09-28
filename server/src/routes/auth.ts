import { Router } from 'express';
import { get, now, run } from '../db.ts';
import { COOKIE, hashPassword, issueToken, requireAuth, validatePassword, verifyPassword } from '../auth.ts';
import { HttpError } from '../permissions.ts';

const r = Router();

// Chống dò mật khẩu đơn giản: tối đa 10 lần sai / 15 phút cho mỗi username
const failures = new Map<string, { count: number; until: number }>();

r.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const f = failures.get(username);
  if (f && f.count >= 10 && f.until > Date.now()) {
    throw new HttpError(429, 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút');
  }
  const user = get('SELECT * FROM users WHERE username = ?', username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    const cur = f && f.until > Date.now() ? f : { count: 0, until: 0 };
    failures.set(username, { count: cur.count + 1, until: Date.now() + 15 * 60_000 });
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  if (!user.is_active) throw new HttpError(403, 'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
  failures.delete(username);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), user.id);
  issueToken(res, user.id);
  res.json({ ok: true });
});

r.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

r.post('/change-password', requireAuth, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(String(req.body?.current_password || ''), user.password_hash)) {
    throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  }
  const next = validatePassword(req.body?.new_password);
  if (next === req.body?.current_password) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hashPassword(next), req.user.id);
  res.json({ ok: true });
});

r.patch('/profile', requireAuth, (req, res) => {
  const full_name = String(req.body?.full_name || '').trim();
  if (!full_name) throw new HttpError(400, 'Họ tên không được để trống');
  run('UPDATE users SET full_name = ?, email = ? WHERE id = ?', full_name, req.body?.email || null, req.user.id);
  res.json({ ok: true });
});

export default r;
