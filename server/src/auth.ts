import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { get, getSetting, run, setSetting } from './db.ts';
import { HttpError, type AuthUser } from './permissions.ts';

export const COOKIE = 'qlda_token';
const TOKEN_DAYS = 7;

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let s = getSetting('jwt_secret');
  if (!s) {
    s = crypto.randomBytes(48).toString('hex');
    setSetting('jwt_secret', s);
  }
  return s;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const COMMON = ['admin@123', 'admin@1234', 'admin@12345', 'admin123', 'password', 'password1', 'matkhau', '12345678', '123456789', '1234567890', 'qwerty123', 'abc@1234', 'abc12345'];

/** Mật khẩu: ≥ 10 ký tự, có chữ và số, không chứa tên đăng nhập, không phải mật khẩu phổ biến. */
export function validatePassword(password: unknown, username?: string): string {
  if (typeof password !== 'string' || password.length < 10) throw new HttpError(400, 'Mật khẩu phải có ít nhất 10 ký tự');
  if (password.length > 200) throw new HttpError(400, 'Mật khẩu quá dài');
  if (!/[A-Za-zÀ-ỹ]/.test(password) || !/\d/.test(password)) throw new HttpError(400, 'Mật khẩu phải có cả chữ và số');
  const low = password.toLowerCase();
  if (COMMON.includes(low) || /^(.)\1+$/.test(password)) throw new HttpError(400, 'Mật khẩu quá dễ đoán, hãy chọn mật khẩu khác');
  if (username && username.length >= 3 && low.includes(username.toLowerCase())) throw new HttpError(400, 'Mật khẩu không được chứa tên đăng nhập');
  return password;
}

/** Hash giả để thời gian kiểm tra như nhau khi tên đăng nhập không tồn tại (không lộ tài khoản nào có thật). */
export const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export function issueToken(res: Response, userId: number) {
  const tv = get<{ token_version: number }>('SELECT token_version FROM users WHERE id = ?', userId)?.token_version ?? 0;
  const token = jwt.sign({ uid: userId, tv }, secret(), { expiresIn: `${TOKEN_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: TOKEN_DAYS * 86400_000,
  });
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'Chưa đăng nhập');
  let uid: number, tv: number;
  try {
    ({ uid, tv = 0 } = jwt.verify(token, secret()) as { uid: number; tv?: number });
  } catch {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn');
  }
  const user = get<AuthUser & { is_active: number; token_version: number }>(
    'SELECT id, username, full_name, email, is_admin, is_active, must_change_password, token_version FROM users WHERE id = ?', uid,
  );
  if (!user || !user.is_active) throw new HttpError(401, 'Tài khoản không tồn tại hoặc đã bị khóa');
  if (user.token_version !== tv) throw new HttpError(401, 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');
  delete (user as { token_version?: number }).token_version;
  req.user = user;
  // Tài khoản mới tạo / vừa được đặt lại mật khẩu: chỉ được dùng các API tài khoản cho tới khi đổi mật khẩu
  if (user.must_change_password && !req.originalUrl.startsWith('/api/auth/')) {
    throw new HttpError(403, 'Bạn cần đổi mật khẩu trước khi tiếp tục');
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.is_admin) throw new HttpError(403, 'Chỉ quản trị hệ thống được thực hiện thao tác này');
  next();
}

/** Tạo tài khoản admin mặc định khi hệ thống chưa có user nào. */
export function ensureAdmin() {
  const count = get<{ c: number }>('SELECT COUNT(*) c FROM users')!.c;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const fullName = process.env.ADMIN_FULLNAME || 'Quản trị hệ thống';
  run(
    `INSERT INTO users(username, full_name, password_hash, is_admin, must_change_password, default_role_id)
     VALUES (?, ?, ?, 1, 1, (SELECT id FROM roles WHERE permissions LIKE '%project.admin%' ORDER BY id LIMIT 1))`,
    username, fullName, hashPassword(password),
  );
  console.log(`[auth] Đã tạo tài khoản quản trị mặc định: ${username} / ${password} (bắt buộc đổi mật khẩu khi đăng nhập lần đầu)`);
}
