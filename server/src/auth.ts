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

export function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Mật khẩu phải có ít nhất 8 ký tự');
  }
  return password;
}

export function issueToken(res: Response, userId: number) {
  const token = jwt.sign({ uid: userId }, secret(), { expiresIn: `${TOKEN_DAYS}d` });
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
  let uid: number;
  try {
    uid = (jwt.verify(token, secret()) as { uid: number }).uid;
  } catch {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn');
  }
  const user = get<AuthUser & { is_active: number }>(
    'SELECT id, username, full_name, email, is_admin, is_active, must_change_password FROM users WHERE id = ?', uid,
  );
  if (!user || !user.is_active) throw new HttpError(401, 'Tài khoản không tồn tại hoặc đã bị khóa');
  req.user = user;
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
  run(
    'INSERT INTO users(username, full_name, password_hash, is_admin, must_change_password) VALUES (?, ?, ?, 1, 1)',
    username, 'Quản trị hệ thống', hashPassword(password),
  );
  console.log(`[auth] Đã tạo tài khoản quản trị mặc định: ${username} / ${password} (bắt buộc đổi mật khẩu khi đăng nhập lần đầu)`);
}
