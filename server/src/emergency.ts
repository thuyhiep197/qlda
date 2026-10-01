/**
 * Cứu hộ khẩn cấp (chạy trực tiếp trên server, không qua web) — dùng khi tài khoản quản trị bị chiếm/khóa.
 *
 *   node --import tsx server/src/emergency.ts restore <tên_đăng_nhập>
 *       Mở khóa, cấp quyền Quản trị hệ thống, đặt mật khẩu tạm ngẫu nhiên (bắt buộc đổi khi đăng nhập),
 *       thu hồi mọi phiên cũ của tài khoản đó. In mật khẩu tạm ra màn hình.
 *   node --import tsx server/src/emergency.ts lock <tên_đăng_nhập>
 *       Khóa tài khoản và thu hồi mọi phiên (VD khóa tài khoản "admin" bị lộ).
 *   node --import tsx server/src/emergency.ts logout-all
 *       Thu hồi phiên đăng nhập của mọi người.
 *   node --import tsx server/src/emergency.ts admins
 *       Liệt kê các tài khoản có quyền Quản trị hệ thống và lần đăng nhập gần nhất.
 *
 * Trong Docker: docker compose exec qlda node --import tsx server/src/emergency.ts restore hiepntt
 */
import crypto from 'node:crypto';
import { all, get, migrate, now, run } from './db.ts';
import { hashPassword } from './auth.ts';

migrate();
const [cmd, username] = process.argv.slice(2);
const log = (action: string, target: string | null, detail: string) =>
  run('INSERT INTO audit_log(at, user_id, username, action, target, detail, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)',
    now(), null, 'cứu hộ trên server', action, target, detail, null, 'emergency.ts');
const findUser = () => {
  const u = get<{ id: number; username: string }>('SELECT id, username FROM users WHERE username = ?', String(username || '').toLowerCase());
  if (!u) { console.error(`Không tìm thấy tài khoản "${username}"`); process.exit(1); }
  return u;
};

if (cmd === 'restore') {
  const u = findUser();
  const pw = `${crypto.randomBytes(6).toString('base64url')}${crypto.randomInt(10, 99)}Aa`;
  run('UPDATE users SET is_active = 1, is_admin = 1, password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?', hashPassword(pw), u.id);
  log('emergency_restore', u.username, 'Mở khóa, cấp quyền quản trị, đặt mật khẩu tạm');
  console.log(`Đã khôi phục tài khoản ${u.username}. Mật khẩu tạm: ${pw}\nĐăng nhập rồi đổi mật khẩu ngay.`);
} else if (cmd === 'lock') {
  const u = findUser();
  run('UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ?', u.id);
  log('emergency_lock', u.username, 'Khóa tài khoản và thu hồi mọi phiên');
  console.log(`Đã khóa tài khoản ${u.username} và thu hồi mọi phiên đăng nhập.`);
} else if (cmd === 'logout-all') {
  const n = run('UPDATE users SET token_version = token_version + 1').changes;
  log('logout_all', null, `Thu hồi phiên của ${n} tài khoản (chạy trên server)`);
  console.log(`Đã thu hồi phiên đăng nhập của ${n} tài khoản.`);
} else if (cmd === 'admins') {
  for (const u of all<{ username: string; full_name: string; is_active: number; last_login_at: string | null }>(
    'SELECT username, full_name, is_active, last_login_at FROM users WHERE is_admin = 1 ORDER BY username')) {
    console.log(`${u.username}\t${u.full_name}\t${u.is_active ? 'hoạt động' : 'ĐÃ KHÓA'}\tđăng nhập gần nhất: ${u.last_login_at ?? '—'}`);
  }
} else {
  console.log('Lệnh: restore <tên_đăng_nhập> | lock <tên_đăng_nhập> | logout-all | admins');
  process.exit(1);
}
