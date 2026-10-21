import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Cài mới: nhóm Quản trị hệ thống được tạo cùng các nhóm mặc định, tài khoản admin đầu tiên thuộc nhóm này
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-admin-role-'));
const { migrate, get, run, ADMIN_ROLE_NAME } = await import('./db.ts');
const { seedRoles, adminRoleId, isAdminRole, userPermissions, ALL_PERMISSIONS } = await import('./permissions.ts');
const { ensureAdmin } = await import('./auth.ts');
migrate();
seedRoles();
ensureAdmin();

test('fresh install has the system admin group and the first account belongs to it', () => {
  const id = adminRoleId();
  assert.ok(id);
  assert.equal(get<{ name: string }>('SELECT name FROM roles WHERE id = ?', id)?.name, ADMIN_ROLE_NAME);
  assert.ok(isAdminRole(id));
  assert.ok(!isAdminRole(get<{ id: number }>("SELECT id FROM roles WHERE name = 'Dev'")!.id));
  const admin = get<{ id: number; is_admin: number; default_role_id: number }>("SELECT id, is_admin, default_role_id FROM users WHERE username = 'admin'")!;
  assert.equal(admin.is_admin, 1);
  assert.equal(admin.default_role_id, id);
  assert.equal(userPermissions(admin).size >= ALL_PERMISSIONS.length, true);
});

test('a member of a normal group only has that group permissions', () => {
  const dev = get<{ id: number }>("SELECT id FROM roles WHERE name = 'Dev'")!.id;
  const u = run("INSERT INTO users(username, full_name, password_hash, default_role_id) VALUES ('dev1', 'Dev 1', 'x', ?)", dev).id;
  const perms = userPermissions({ id: u, is_admin: 0 });
  assert.ok(!perms.has('role.edit') && !perms.has('customer.view_all'));
});
