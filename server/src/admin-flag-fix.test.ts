import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// v34: cờ quản trị gán thẳng vào CSDL (không thuộc nhóm Quản trị hệ thống) bị gỡ, phiên bị thu hồi; tài khoản admin bị khóa được mở lại
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-adminflag-'));
const { migrate, run, get, all } = await import('./db.ts');
const { seedRoles } = await import('./permissions.ts');
migrate();
seedRoles();

const adminGroup = get<{ id: number }>('SELECT id FROM roles WHERE is_admin = 1')!.id;
const devGroup = get<{ id: number }>("SELECT id FROM roles WHERE is_admin = 0 ORDER BY id LIMIT 1")!.id;
const admin = run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin, is_active, failed_logins) VALUES ('admin', 'Admin', 'x', ?, 1, 0, 5)", adminGroup).id;
const rogue = run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES ('vietnx', 'Việt', 'x', ?, 1)", devGroup).id;
const other = run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES ('sysadmin2', 'Khác', 'x', ?, 1)", adminGroup).id;
const normal = run("INSERT INTO users(username, full_name, password_hash, default_role_id, is_admin) VALUES ('dev1', 'Dev', 'x', ?, 0)", devGroup).id;

// Chạy lại riêng bản nâng cấp v34 trên dữ liệu như đang chạy thật (gỡ bảng của v35 để v35 chạy lại được)
run('DROP TABLE sales_project_products');
run('PRAGMA user_version = 33');
migrate();

test('tài khoản có cờ quản trị mà không phải tài khoản admin bị gỡ cờ và đăng xuất', () => {
  const u = get<any>('SELECT is_admin, token_version FROM users WHERE id = ?', rogue);
  assert.equal(u.is_admin, 0);
  assert.equal(u.token_version, 1);
  assert.equal(get<any>('SELECT is_admin FROM users WHERE id = ?', other).is_admin, 0);
  const n = get<any>('SELECT is_admin, token_version FROM users WHERE id = ?', normal);
  assert.equal(n.is_admin, 0);
  assert.equal(n.token_version, 0);
});

test('tài khoản admin trong nhóm Quản trị hệ thống được mở khóa, giữ quyền quản trị', () => {
  const a = get<any>('SELECT is_admin, is_active, failed_logins, token_version FROM users WHERE id = ?', admin);
  assert.deepEqual({ ...a }, { is_admin: 1, is_active: 1, failed_logins: 0, token_version: 0 });
});

test('ghi nhật ký bảo mật cho cả hai thay đổi', () => {
  const logs = all<any>("SELECT target FROM audit_log WHERE user_agent = 'migration v34' ORDER BY target").map((r) => r.target);
  assert.deepEqual(logs, ['admin', 'sysadmin2', 'vietnx']);
});
