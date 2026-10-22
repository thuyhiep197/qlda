import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// permissions.ts mở CSDL khi import → dùng thư mục dữ liệu tạm
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qlda-perm-'));
const { ALL_PERMISSIONS, BOARD_PERMISSIONS, DEFAULT_ROLES, FEATURE_GROUPS, SALES_PERMISSIONS, SUBSYSTEMS, SUBSYSTEM_VIEW_CELLS,
  PROJECT_MODULE_PERMISSIONS, hasProjectModule, visibleSubsystems } = await import('./permissions.ts');

test('every module belongs to a subsystem and permission codes are unique', () => {
  const subsystems = new Set(SUBSYSTEMS.map((s) => s.key));
  for (const g of FEATURE_GROUPS) assert.ok(subsystems.has(g.subsystem as never), `${g.label} has a subsystem`);
  assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
  // Phân hệ Khách hàng chia module: khách hàng, dự án, hành trình, công việc, tài liệu, trao đổi
  const crm = FEATURE_GROUPS.filter((g) => g.subsystem === 'customer').flatMap((g) => g.features.map((f) => f.key));
  assert.deepEqual(crm, ['customer', 'sales_project', 'journey', 'ctask', 'cfile', 'ctalk']);
  // Xem = của mình, Xem tất cả = của mọi người — ở Thông tin khách hàng, Dự án, Tài liệu nội bộ
  const viewAll = FEATURE_GROUPS.flatMap((g) => g.features).filter((f) => f.actions.includes('view_all')).map((f) => f.key);
  assert.deepEqual(viewAll, ['customer', 'project', 'document']);
  // Phân hệ Dashboard đứng đầu
  assert.deepEqual(SUBSYSTEMS.map((s) => s.key), ['dashboard', 'customer', 'project', 'docs', 'admin']);
});

test('archiving takes the place of deleting customers and customer projects', () => {
  const label = (key: string) => FEATURE_GROUPS.flatMap((g) => g.features).find((f) => f.key === key)?.actionLabels?.delete;
  assert.equal(label('customer'), 'Lưu trữ');
  assert.equal(label('sales_project'), 'Lưu trữ');
});

test('default roles only use existing permission codes; Ban Giám đốc = Kinh doanh + all customers', () => {
  for (const r of DEFAULT_ROLES) for (const p of r.permissions) assert.ok(ALL_PERMISSIONS.includes(p), `${r.name}: ${p}`);
  assert.ok(BOARD_PERMISSIONS.includes('customer.view_all'));
  assert.deepEqual([...BOARD_PERMISSIONS].sort(), [...SALES_PERMISSIONS, 'customer.view_all'].sort());
  assert.ok(!SALES_PERMISSIONS.includes('customer.view_all'));
  assert.ok(DEFAULT_ROLES.some((r) => r.name === 'Ban Giám đốc'));
});

test('the matrix has no cells without effect (removed screens and actions)', () => {
  for (const p of ['report.view', 'report.export', 'worklog.edit', 'component.view', 'component.create']) assert.ok(!ALL_PERMISSIONS.includes(p), p);
  for (const p of ['worklog.delete', 'plan.view', 'plan.export', 'project.view', 'dashboard.view',
    'document.view', 'document.view_all', 'document.create', 'document.edit', 'document.delete', 'document.export']) assert.ok(ALL_PERMISSIONS.includes(p), p);
});

test('a subsystem shows only with a view cell (Xem / Xem tất cả) of one of its modules', () => {
  assert.deepEqual(SUBSYSTEM_VIEW_CELLS.dashboard, ['dashboard.view']);
  assert.deepEqual(SUBSYSTEM_VIEW_CELLS.docs, ['document.view', 'document.view_all']);
  assert.deepEqual(SUBSYSTEM_VIEW_CELLS.customer, ['customer.view', 'customer.view_all', 'sales_project.view', 'journey.view', 'ctask.view', 'cfile.view', 'ctalk.view']);
  // Quản trị: khớp adminTabs ở giao diện (Người dùng, Phân quyền, các danh mục)
  assert.deepEqual(SUBSYSTEM_VIEW_CELLS.admin, ['user.view', 'role.view', 'department.view', 'geo.view', 'cstatus.view', 'product.view', 'staff.view']);
  for (const cells of Object.values(SUBSYSTEM_VIEW_CELLS)) for (const p of cells) assert.match(p, /.view(_all)?$/);
  assert.deepEqual(visibleSubsystems(new Set()), []);
  // Ô Thêm / Sửa / Tải không làm hiện phân hệ
  assert.deepEqual(visibleSubsystems(new Set(['issue.create', 'document.export', 'customer.edit', 'user.create'])), []);
  assert.deepEqual(visibleSubsystems(new Set(['journey.view', 'document.view_all', 'staff.view', 'dashboard.view'])), ['dashboard', 'customer', 'docs', 'admin']);
  assert.ok(hasProjectModule(new Set(['worklog.view'])));
  assert.ok(!hasProjectModule(new Set(['issue.create', 'project.edit'])));
  assert.ok(PROJECT_MODULE_PERMISSIONS.includes('project.view'));
});

test('every default role has Dashboard and the four document cells; roles with a project cell have Dự án – Xem', () => {
  for (const r of DEFAULT_ROLES) {
    for (const p of ['dashboard.view', 'document.view', 'document.view_all', 'document.create', 'document.export']) assert.ok(r.permissions.includes(p), `${r.name}: ${p}`);
    if (r.permissions.some((p) => PROJECT_MODULE_PERMISSIONS.includes(p))) assert.ok(r.permissions.includes('project.view'), `${r.name}: project.view`);
  }
});
