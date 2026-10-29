/**
 * API key cá nhân: gửi kèm header `Authorization: Bearer qlda_…` để gọi API với quyền của chính người tạo key
 * (dùng cho MCP / script). Xác thực theo SHA-256 của key; key còn được lưu mã hóa (AES-256-GCM) để chủ key xem lại.
 * Khóa mã hóa: API_KEY_SECRET trong .env, không có thì tự sinh và lưu trong settings.
 */
import crypto from 'node:crypto';
import { all, get, getSetting, now, run, setSetting } from './db.ts';
import { badRequest, notFound } from './permissions.ts';

export const KEY_PREFIX = 'qlda_';
export const MAX_KEYS_PER_USER = 10;
const MAX_DAYS = 3650;
/** Ghi "lần dùng gần nhất" thưa lại để không ghi CSDL ở mọi request */
const TOUCH_MS = 60_000;

const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

function cipherKey() {
  let s = process.env.API_KEY_SECRET || getSetting('api_key_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSetting('api_key_secret', s); }
  return crypto.createHash('sha256').update(s).digest();
}

function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function decrypt(enc: string) {
  const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export function isApiKey(token: string) {
  return token.startsWith(KEY_PREFIX);
}

export function listApiKeys(userId: number) {
  return all(`SELECT id, name, prefix, created_at, expires_at, last_used_at, last_used_ip FROM api_keys
    WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC`, userId);
}

/** Xem lại key nguyên văn (chỉ của chính mình). */
export function revealApiKey(userId: number, id: number) {
  const k = get<{ id: number; name: string; key_enc: string }>('SELECT id, name, key_enc FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL', id, userId);
  if (!k) throw notFound('Không tìm thấy API key');
  try {
    return { id: k.id, name: k.name, key: decrypt(k.key_enc) };
  } catch {
    // Đổi API_KEY_SECRET thì key cũ không giải mã được nữa (vẫn dùng được để xác thực)
    throw badRequest('Không xem lại được key này (khóa mã hóa trên máy chủ đã đổi). Hãy tạo key mới nếu cần.');
  }
}

/** Tạo key; expiresDays bỏ trống / 0 = không hết hạn. Trả về key nguyên văn. */
export function createApiKey(userId: number, name: unknown, expiresDays: unknown) {
  const label = String(name ?? '').trim();
  if (!label) throw badRequest('Đặt tên cho API key (VD: Claude trên máy làm việc)');
  if (label.length > 100) throw badRequest('Tên API key tối đa 100 ký tự');
  const days = expiresDays === undefined || expiresDays === null || expiresDays === '' ? 0 : Number(expiresDays);
  if (!Number.isInteger(days) || days < 0 || days > MAX_DAYS) throw badRequest(`Số ngày hiệu lực từ 1 đến ${MAX_DAYS} (0 = không hết hạn)`);
  const count = get<{ c: number }>('SELECT COUNT(*) c FROM api_keys WHERE user_id = ? AND revoked_at IS NULL', userId)!.c;
  if (count >= MAX_KEYS_PER_USER) throw badRequest(`Mỗi tài khoản tối đa ${MAX_KEYS_PER_USER} API key, hãy thu hồi key không dùng nữa`);
  const key = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  const expires = days ? new Date(Date.now() + days * 86400_000).toISOString() : null;
  const { id } = run('INSERT INTO api_keys(user_id, name, prefix, key_hash, key_enc, created_at, expires_at) VALUES (?,?,?,?,?,?,?)',
    userId, label, key.slice(0, KEY_PREFIX.length + 6), hash(key), encrypt(key), now(), expires);
  return { id, name: label, key, expires_at: expires };
}

export function revokeApiKey(userId: number, id: number) {
  const k = get<{ id: number; name: string }>('SELECT id, name FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL', id, userId);
  if (!k) throw notFound('Không tìm thấy API key');
  run('UPDATE api_keys SET revoked_at = ? WHERE id = ?', now(), k.id);
  return k;
}

/** Thu hồi mọi key của một tài khoản (đổi mật khẩu, quản trị đặt lại mật khẩu / đăng xuất tất cả). */
export function revokeAllApiKeys(userId: number) {
  run('UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now(), userId);
}

/** Key hợp lệ (chưa thu hồi, chưa hết hạn) → id người dùng; ngược lại null. */
export function userIdFromApiKey(key: string, ip: string | undefined) {
  const k = get<{ id: number; user_id: number; expires_at: string | null; last_used_at: string | null }>(
    'SELECT id, user_id, expires_at, last_used_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL', hash(key));
  if (!k || (k.expires_at && k.expires_at <= now())) return null;
  if (!k.last_used_at || Date.now() - Date.parse(k.last_used_at) > TOUCH_MS) {
    run('UPDATE api_keys SET last_used_at = ?, last_used_ip = ? WHERE id = ?', now(), ip ?? null, k.id);
  }
  return { keyId: k.id, userId: k.user_id };
}
