/**
 * Nhật ký bảo mật: đăng nhập (thành công / thất bại), đổi mật khẩu, và mọi thao tác quản trị
 * (tài khoản, quyền quản trị, nhóm người dùng, phân quyền, dự án, thành viên). Giữ 365 ngày.
 */
import type { Request } from 'express';
import { all, now, run } from './db.ts';

export function audit(req: Request, action: string, opts: { target?: string; detail?: unknown; userId?: number | null; username?: string | null } = {}) {
  const ua = String(req.headers['user-agent'] || '').slice(0, 300);
  const detail = opts.detail == null ? null : typeof opts.detail === 'string' ? opts.detail : JSON.stringify(opts.detail);
  try {
    run('INSERT INTO audit_log(at, user_id, username, action, target, detail, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)',
      now(), opts.userId !== undefined ? opts.userId : req.user?.id ?? null, opts.username !== undefined ? opts.username : req.user?.username ?? null,
      action, opts.target ?? null, detail, req.ip ?? null, ua || null);
  } catch (e) {
    console.error('[audit] không ghi được nhật ký', e);
  }
}

export function pruneAudit() {
  run("DELETE FROM audit_log WHERE at < datetime('now', '-365 days')");
}

export function listAudit(f: { action?: string; user?: string; q?: string; limit?: number }) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.action) { where.push('action = ?'); params.push(f.action); }
  if (f.user) { where.push('(username = ? OR target LIKE ?)'); params.push(f.user, `%${f.user}%`); }
  if (f.q) { where.push('(username LIKE ? OR target LIKE ? OR detail LIKE ? OR ip LIKE ?)'); params.push(...Array(4).fill(`%${f.q}%`)); }
  return all(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${Math.min(f.limit || 500, 2000)}`, ...params);
}
