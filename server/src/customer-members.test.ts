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
const staff = (name: string, userId: number, positions: string) => run('INSERT INTO staff(full_name, positions, user_id) VALUES (?, ?, ?)', name, positions, userId).id;

const sale = user('sale'), am = user('am'), ba = user('ba'), doer = user('doer'), helper = user('helper'), other = user('other'), boss = user('boss', 'Ban Giám đốc');
const saleStaff = staff('Sale A', sale, 'kd'), amStaff = staff('AM B', am, 'am');
staff('BA C', ba, 'ba_pm');
const cust = run("INSERT INTO customers(name) VALUES ('Sở X')").id;
const p1 = run("INSERT INTO sales_projects(customer_id, code, name, ba) VALUES (?, 'SX-01', 'Dự án 1', 'BA C')", cust).id;
const p2 = run("INSERT INTO sales_projects(customer_id, code, name) VALUES (?, 'SX-02', 'Dự án 2')", cust).id;
run("INSERT INTO sales_project_owners(sales_project_id, staff_id, role) VALUES (?, ?, 'kd')", p1, saleStaff);
run("INSERT INTO customer_owners(customer_id, staff_id, role) VALUES (?, ?, 'am')", cust, amStaff);
const step = run("INSERT INTO journey_steps(customer_id, sales_project_id, position, depth, title, assignee_id) VALUES (?, ?, 10, 0, 'Bước', ?)", cust, p2, doer).id;
run('INSERT INTO journey_step_supporters(step_id, user_id) VALUES (?, ?)', step, helper);

test('project members: Sale/AM of customer and project, BA/PM, step performers/supporters, people who see all customers', () => {
  const m1 = customerMembers(cust, p1);
  for (const id of [sale, am, ba, boss]) assert.ok(m1.has(id), `p1 has ${id}`);
  for (const id of [doer, helper, other]) assert.ok(!m1.has(id), `p1 lacks ${id}`);
  const m2 = customerMembers(cust, p2);
  for (const id of [am, doer, helper, boss]) assert.ok(m2.has(id));
  for (const id of [sale, ba, other]) assert.ok(!m2.has(id));
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
