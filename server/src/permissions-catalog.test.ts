import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// permissions.ts mở CSDL khi import → dùng thư mục dữ liệu tạm
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-perm-'));
const { ALL_PERMISSIONS, BOARD_PERMISSIONS, DEFAULT_ROLES, FEATURE_GROUPS, SALES_PERMISSIONS, SUBSYSTEMS } = await import('./permissions.ts');

test('every module belongs to a subsystem and permission codes are unique', () => {
  const subsystems = new Set(SUBSYSTEMS.map((s) => s.key));
  for (const g of FEATURE_GROUPS) assert.ok(subsystems.has(g.subsystem as never), `${g.label} has a subsystem`);
  assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
  // Phân hệ Khách hàng chia module: khách hàng, dự án, hành trình, công việc, tài liệu, trao đổi
  const crm = FEATURE_GROUPS.filter((g) => g.subsystem === 'customer').flatMap((g) => g.features.map((f) => f.key));
  assert.deepEqual(crm, ['customer', 'customer_all', 'sales_project', 'journey', 'ctask', 'cfile', 'ctalk']);
  // Mỗi phân hệ một ô phạm vi riêng
  const keys = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => `${g.subsystem}:${f.key}`));
  assert.ok(keys.includes('customer:customer_all') && keys.includes('project:project_all'));
});

test('archiving takes the place of deleting customers and customer projects', () => {
  const label = (key: string) => FEATURE_GROUPS.flatMap((g) => g.features).find((f) => f.key === key)?.actionLabels?.delete;
  assert.equal(label('customer'), 'Lưu trữ');
  assert.equal(label('sales_project'), 'Lưu trữ');
});

test('default roles only use existing permission codes; Ban Giám đốc = Kinh doanh + all customers', () => {
  for (const r of DEFAULT_ROLES) for (const p of r.permissions) assert.ok(ALL_PERMISSIONS.includes(p), `${r.name}: ${p}`);
  assert.ok(BOARD_PERMISSIONS.includes('customer_all.view'));
  assert.deepEqual([...BOARD_PERMISSIONS].sort(), [...SALES_PERMISSIONS, 'customer_all.view'].sort());
  assert.ok(!SALES_PERMISSIONS.includes('customer_all.view'));
  assert.ok(DEFAULT_ROLES.some((r) => r.name === 'Ban Giám đốc'));
});

test('the matrix has no cells without effect (removed screens and actions)', () => {
  for (const p of ['dashboard.view', 'report.view', 'report.export', 'worklog.edit', 'component.view']) assert.ok(!ALL_PERMISSIONS.includes(p), p);
  for (const p of ['worklog.delete', 'component.create', 'plan.view', 'plan.export']) assert.ok(ALL_PERMISSIONS.includes(p), p);
});

test('scope cells (see all customers / projects) are flagged so bulk ticks skip them', () => {
  const scoped = FEATURE_GROUPS.flatMap((g) => g.features).filter((f) => f.scope).map((f) => f.key);
  assert.deepEqual(scoped.sort(), ['customer_all', 'project_all']);
});
