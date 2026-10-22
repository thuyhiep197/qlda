import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mở CSDL trong thư mục tạm, nâng cấp đủ schema rồi dựng một khách hàng có 2 dự án
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-members-'));
const { migrate, run, get } = await import('./db.ts');
const { seedRoles } = await import('./permissions.ts');
const { customerMembers, requireMembers } = await import('./customer-access.ts');
migrate();
seedRoles();

const user = (username: string, role?: string) => {
  const roleId = role ? get<{ id: number }>('SELECT id FROM roles WHERE name = ?', role)?.id ?? null : null;
  return run("INSERT INTO users(username, full_name, password_hash, default_role_id) VALUES (?, ?, 'x', ?)", username, username, roleId).id;
};
// Vị trí của tài khoản (thay cho Danh mục nhân sự từ v26)
const position = (userId: number, positions: string) => run('UPDATE users SET positions = ? WHERE id = ?', positions, userId);

const sale = user('sale'), am = user('am'), ba = user('ba'), dev = user('dev'), tester = user('tester'), doer = user('doer'), helper = user('helper'), other = user('other'), boss = user('boss', 'Ban Giám đốc');
position(sale, 'kd'); position(am, 'am'); position(ba, 'ba_pm'); position(dev, 'dev'); position(tester, 'tester');
const cust = run("INSERT INTO customers(name) VALUES ('Sở X')").id;
const p1 = run("INSERT INTO sales_projects(customer_id, code, name) VALUES (?, 'SX-01', 'Dự án 1')", cust).id;
const p2 = run("INSERT INTO sales_projects(customer_id, code, name) VALUES (?, 'SX-02', 'Dự án 2')", cust).id;
const owner = (spId: number, userId: number, role: string) => run('INSERT INTO sales_project_owners(sales_project_id, user_id, role) VALUES (?, ?, ?)', spId, userId, role);
owner(p1, sale, 'kd'); owner(p1, ba, 'ba'); owner(p1, dev, 'dev'); owner(p1, tester, 'tester');
run("INSERT INTO customer_owners(customer_id, user_id, role) VALUES (?, ?, 'am')", cust, am);
const step = run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title, assignee_id) VALUES (?, ?, 10, 0, 'Bước', ?)", cust, p2, doer).id;
run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', step, helper);


test('project members: Sale/AM of customer and project, BA/PM, Dev, Tester, step performers/supporters, people who see all customers', () => {
  const m1 = customerMembers(cust, p1);
  for (const id of [sale, am, ba, dev, tester, boss]) assert.ok(m1.has(id), `p1 has ${id}`);
  for (const id of [doer, helper, other]) assert.ok(!m1.has(id), `p1 lacks ${id}`);
  const m2 = customerMembers(cust, p2);
  for (const id of [am, doer, helper, boss]) assert.ok(m2.has(id));
  for (const id of [sale, ba, dev, tester, other]) assert.ok(!m2.has(id));
  // Việc chung của khách hàng: gộp mọi dự án
  const all = customerMembers(cust, null);
  for (const id of [sale, am, ba, doer, helper, boss]) assert.ok(all.has(id));
  assert.ok(!all.has(other));
});

test('only project members can be newly assigned; keeping an existing assignee is allowed', () => {
  assert.doesNotThrow(() => requireMembers(cust, p1, [sale, null]));
  assert.throws(() => requireMembers(cust, p1, [other]), /người đang tham gia dự án/);
  assert.doesNotThrow(() => requireMembers(cust, p1, [other], [other]));
  run('UPDATE users SET is_active = 0 WHERE id = ?', sale);
  assert.ok(!customerMembers(cust, p1).has(sale));
});

test('production projects linked to my customer / customer project are open to me (with my own permissions)', async () => {
  const { projectPermissions, accessibleProjectIds } = await import('./permissions.ts');
  const { linkedProjectIds } = await import('./customer-access.ts');
  // Nhóm Kinh doanh: có quyền xem khách hàng, dự án của khách hàng
  const kd = get<{ id: number }>("SELECT id FROM roles WHERE name = 'Kinh doanh'")!.id;
  run('UPDATE users SET default_role_id = ? WHERE id IN (?, ?)', kd, am, other);
  const linked = run("INSERT INTO projects(key, name, type, lead_id, customer_id) VALUES ('LK', 'Sản xuất', 'scrum', ?, ?)", boss, cust).id;
  const u = (id: number) => ({ id, is_admin: 0, username: '', full_name: '', email: null, must_change_password: 0 });
  // AM của khách hàng → vào được dự án sản xuất của khách hàng; người ngoài thì không
  assert.ok(linkedProjectIds(u(am)).includes(linked));
  assert.ok(projectPermissions(u(am), linked));
  assert.equal(projectPermissions(u(other), linked), null);
  const ids = accessibleProjectIds(u(am));
  assert.ok(ids !== 'all' && ids.includes(linked));
});

test('no permission in the Dự án module → no project at all (linked, member or not)', async () => {
  const { projectPermissions, accessibleProjectIds } = await import('./permissions.ts');
  // Nhóm chỉ có quyền phân hệ Khách hàng (+ Xem tất cả khách hàng) — như AM không được tích ô nào ở phân hệ Dự án
  const crmOnly = run("INSERT INTO roles(name, permissions) VALUES ('Chỉ khách hàng', ?)", JSON.stringify(['customer.view', 'customer.view_all', 'sales_project.view'])).id;
  const nhung = user('nhung_am', 'Chỉ khách hàng');
  const linked = get<{ id: number }>("SELECT id FROM projects WHERE key = 'LK'")!.id;
  run('INSERT INTO project_members(project_id, user_id, role_id) VALUES (?, ?, ?)', linked, nhung, crmOnly);
  const u = { id: nhung, is_admin: 0, username: '', full_name: '', email: null, must_change_password: 0 };
  assert.equal(projectPermissions(u, linked), null);
  assert.deepEqual(accessibleProjectIds(u), []);
  // Tích một ô của phân hệ Dự án (Kế hoạch – Xem) → vào lại được
  run("INSERT INTO user_permissions(user_id, permission, effect) VALUES (?, 'plan.view', 'allow')", nhung);
  assert.ok(projectPermissions(u, linked)?.has('plan.view'));
});

test('BA / Dev / Tester of a customer project take part in it (scope of customer projects)', async () => {
  const { visibleSalesProjectsSql } = await import('./customer-access.ts');
  const { all } = await import('./db.ts');
  const seen = (id: number) => { const v = visibleSalesProjectsSql({ id, is_admin: 0 } as never); return all<{ id: number }>(`SELECT sp.id FROM sales_projects sp WHERE ${v.sql}`, ...v.params).map((x) => x.id); };
  for (const u of [ba, dev, tester]) assert.ok(seen(u).includes(p1));
  assert.ok(!seen(ba).includes(p2));
});
