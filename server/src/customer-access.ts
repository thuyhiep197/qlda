import type { Request } from 'express';
import { all, get } from './db.ts';
import { badRequest, forbidden, notFound, requireUserPerm, userPermissions, type AuthUser, type Permission } from './permissions.ts';

/**
 * Phạm vi dữ liệu phân hệ Khách hàng.
 * Liên quan (nhân sự gắn với tài khoản của mình):
 *  · Kinh doanh phụ trách (Sale / BGĐ) / AM hỗ trợ của khách hàng → khách hàng đó và mọi dự án của khách hàng;
 *  · Phụ trách một dự án (Kinh doanh / AM của dự án), thực hiện hoặc phối hợp một bước hành trình, thực hiện một công việc của dự án
 *    → khách hàng đó và chỉ dự án đó;
 *  · Thực hiện một công việc chung của khách hàng → khách hàng đó (không kèm dự án nào).
 * Xem: người liên quan; có quyền "Phạm vi: Tất cả khách hàng" thì xem mọi khách hàng, mọi dự án.
 * Phạm vi "Tất cả khách hàng" là phạm vi cao nhất: mọi quyền đang có (xem, thêm, sửa, lưu trữ, tải…) áp dụng trên mọi khách hàng, dự án;
 * không có phạm vi này thì các quyền chỉ áp dụng trên khách hàng, dự án mình liên quan.
 * Quản trị hệ thống: toàn quyền trên mọi khách hàng.
 */
type U = Pick<AuthUser, 'id' | 'is_admin'>;

export const seesAllCustomers = (user: U) => userPermissions(user).has('customer_all.view');
/** Hành động ghi (thêm, sửa, lưu trữ, xóa) — xem và tải về là hành động đọc */
export const isWrite = (perm: Permission) => !/\.(view|export)$/.test(perm);

/** Người dùng là Kinh doanh phụ trách / AM hỗ trợ của khách hàng (bí danh bảng khách hàng: col) */
const OWNS_CUSTOMER = (col: string) => `EXISTS (SELECT 1 FROM customer_owners co JOIN staff s ON s.id = co.staff_id WHERE co.customer_id = ${col} AND s.user_id = ?)`;
/** Người dùng liên quan tới dự án (bí danh bảng dự án của khách hàng: col): phụ trách, thực hiện / phối hợp bước, thực hiện công việc */
const IN_PROJECT = (col: string) => `(EXISTS (SELECT 1 FROM sales_project_owners o JOIN staff s ON s.id = o.staff_id WHERE o.sales_project_id = ${col} AND s.user_id = ?)
      OR EXISTS (SELECT 1 FROM journey_steps j WHERE j.sales_project_id = ${col} AND j.assignee_id = ?)
      OR EXISTS (SELECT 1 FROM journey_step_supporters ss JOIN journey_steps j ON j.id = ss.step_id WHERE j.sales_project_id = ${col} AND ss.user_id = ?)
      OR EXISTS (SELECT 1 FROM customer_tasks t WHERE t.sales_project_id = ${col} AND t.assignee_id = ?))`;

/** Điều kiện SQL: khách hàng (bí danh c) người dùng liên quan */
function relatedCustomersSql(user: U) {
  return {
    sql: `(${OWNS_CUSTOMER('c.id')}
      OR EXISTS (SELECT 1 FROM sales_projects vsp WHERE vsp.customer_id = c.id AND ${IN_PROJECT('vsp.id')})
      OR EXISTS (SELECT 1 FROM customer_tasks t WHERE t.customer_id = c.id AND t.sales_project_id IS NULL AND t.assignee_id = ?))`,
    params: [user.id, user.id, user.id, user.id, user.id, user.id],
  };
}
/** Điều kiện SQL: dự án của khách hàng (bí danh sp) người dùng liên quan */
const relatedSalesProjectsSql = (user: U) => ({ sql: `(${OWNS_CUSTOMER('sp.customer_id')} OR ${IN_PROJECT('sp.id')})`, params: [user.id, user.id, user.id, user.id, user.id] });

/** Điều kiện SQL lọc khách hàng (bảng đặt bí danh c) mà người dùng được xem */
export function visibleCustomersSql(user: U): { sql: string; params: number[] } {
  return seesAllCustomers(user) ? { sql: '1=1', params: [] } : relatedCustomersSql(user);
}

/** Điều kiện SQL lọc dự án của khách hàng (bảng đặt bí danh sp) mà người dùng được xem */
export function visibleSalesProjectsSql(user: U): { sql: string; params: number[] } {
  return seesAllCustomers(user) ? { sql: '1=1', params: [] } : relatedSalesProjectsSql(user);
}

/** Được thêm / sửa / lưu trữ trên khách hàng này: quản trị hệ thống, phạm vi Tất cả khách hàng, hoặc người liên quan */
export function managesCustomer(user: U, customerId: number) {
  if (user.is_admin || seesAllCustomers(user)) return true;
  const v = relatedCustomersSql(user);
  return !!get(`SELECT 1 FROM customers c WHERE c.id = ? AND ${v.sql}`, customerId, ...v.params);
}
/** Được thêm / sửa / lưu trữ trên dự án này: quản trị hệ thống, phạm vi Tất cả khách hàng, hoặc người liên quan */
export function managesSalesProject(user: U, salesProjectId: number) {
  if (user.is_admin || seesAllCustomers(user)) return true;
  const v = relatedSalesProjectsSql(user);
  return !!get(`SELECT 1 FROM sales_projects sp WHERE sp.id = ? AND ${v.sql}`, salesProjectId, ...v.params);
}

export function canSeeCustomer(user: U, customerId: number) {
  const perms = userPermissions(user);
  if (!perms.has('customer.view')) return false;
  if (perms.has('customer_all.view')) return true;
  const v = visibleCustomersSql(user);
  return !!get(`SELECT 1 FROM customers c WHERE c.id = ? AND ${v.sql}`, customerId, ...v.params);
}

export function canSeeSalesProject(user: U, salesProjectId: number) {
  const perms = userPermissions(user);
  if (!perms.has('customer.view') || !perms.has('sales_project.view')) return false;
  const v = visibleSalesProjectsSql(user);
  return !!get(`SELECT 1 FROM sales_projects sp WHERE sp.id = ? AND ${v.sql}`, salesProjectId, ...v.params);
}

const NOT_MANAGED = 'Khách hàng / dự án này không do bạn phụ trách, thực hiện hoặc phối hợp';

/** Khách hàng theo :id trên đường dẫn: cần quyền perm, được xem khách hàng; hành động ghi thì phải liên quan tới khách hàng */
export function loadCustomer(req: Request, perm: Permission = 'customer.view') {
  requireUserPerm(req.user, perm);
  const c = get('SELECT * FROM customers WHERE id = ?', Number(req.params.id));
  if (!c) throw notFound('Không tìm thấy khách hàng');
  if (!canSeeCustomer(req.user, c.id)) throw forbidden('Bạn không phụ trách khách hàng này');
  if (isWrite(perm) && !managesCustomer(req.user, c.id)) throw forbidden(NOT_MANAGED);
  return c;
}

/** Hành động ghi trên một mục của khách hàng (việc, tài liệu, trao đổi): mục chung → liên quan khách hàng; mục của dự án → liên quan dự án */
export function requireManage(user: AuthUser, customerId: number, salesProjectId: number | null) {
  if (salesProjectId ? !managesSalesProject(user, salesProjectId) : !managesCustomer(user, customerId)) throw forbidden(NOT_MANAGED);
}

/** Dự án của khách hàng theo id (thuộc khách hàng customerId): cần quyền perm và được xem dự án; hành động ghi thì phải liên quan tới dự án */
export function loadSalesProjectOf(user: AuthUser, customerId: number, id: unknown, perm: Permission = 'sales_project.view') {
  requireUserPerm(user, perm);
  const sp = get('SELECT * FROM sales_projects WHERE id = ? AND customer_id = ?', Number(id), customerId);
  if (!sp) throw notFound('Không tìm thấy dự án của khách hàng');
  if (!canSeeSalesProject(user, sp.id)) throw forbidden('Bạn không phụ trách, thực hiện hoặc phối hợp dự án này');
  if (isWrite(perm) && !managesSalesProject(user, sp.id)) throw forbidden(NOT_MANAGED);
  return sp;
}

/** Kinh doanh phụ trách phải là nhân sự Sale (kd) hoặc Ban Giám đốc (bgd), AM hỗ trợ phải là nhân sự AM (am) — khách hàng và dự án của khách hàng */
export const OWNER_POSITIONS = { kd: ['kd', 'bgd'], am: ['am'] } as const;
export function checkOwners(ids: number[], role: 'kd' | 'am') {
  const label = role === 'kd' ? 'Sale' : 'AM';
  for (const id of ids) {
    const st = get<{ positions: string }>('SELECT positions FROM staff WHERE id = ?', id);
    if (!st) throw badRequest(`${label} không có trong Danh mục nhân sự`);
    if (!st.positions.split(',').some((p) => (OWNER_POSITIONS[role] as readonly string[]).includes(p))) throw badRequest(`${label} phải là nhân sự ${role === 'kd' ? 'Sale hoặc Ban Giám đốc' : 'AM'}`);
  }
}

/** Dự án của khách hàng được chọn (trống = chung của khách hàng); dự án phải thuộc khách hàng này và người dùng được xem */
export function projectOf(user: AuthUser, customerId: number, raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return null;
  const sp = get<{ id: number }>('SELECT id FROM sales_projects WHERE id = ? AND customer_id = ?', Number(raw), customerId);
  if (!sp) throw badRequest('Không tìm thấy dự án của khách hàng');
  if (!canSeeSalesProject(user, sp.id)) throw forbidden('Bạn không phụ trách, thực hiện hoặc phối hợp dự án này');
  return sp.id;
}

/** Nhân sự (Danh mục nhân sự) gắn với tài khoản */
export const staffOfUser = (userId: number) => get<{ id: number; full_name: string; positions: string }>('SELECT id, full_name, positions FROM staff WHERE user_id = ?', userId);

/**
 * Người tham gia dự án của khách hàng — chỉ những người này được giao việc, lịch gọi, thực hiện / phối hợp bước:
 * Sale / AM của khách hàng, Sale / AM, BA/PM, Dev, Tester của dự án, người thực hiện / phối hợp bước của dự án,
 * cùng người được xem tất cả khách hàng. salesProjectId = null (việc chung của khách hàng): gộp mọi dự án của khách hàng.
 */
export function customerMembers(customerId: number, salesProjectId: number | null): Set<number> {
  const ids = new Set<number>();
  const add = (rows: { user_id: number | null }[]) => { for (const r of rows) if (r.user_id) ids.add(r.user_id); };
  add(all('SELECT s.user_id FROM customer_owners co JOIN staff s ON s.id = co.staff_id WHERE co.customer_id = ?', customerId));
  const projects = salesProjectId ? [salesProjectId] : all<{ id: number }>('SELECT id FROM sales_projects WHERE customer_id = ?', customerId).map((p) => p.id);
  for (const p of projects) {
    add(all('SELECT s.user_id FROM sales_project_owners o JOIN staff s ON s.id = o.staff_id WHERE o.sales_project_id = ?', p));
    // BA/PM, Dev, Tester lưu họ tên (chọn từ Danh mục nhân sự), cách nhau dấu phẩy
    const people = get<{ ba: string | null; dev: string | null; tester: string | null }>('SELECT ba, dev, tester FROM sales_projects WHERE id = ?', p);
    const names = [people?.ba, people?.dev, people?.tester].join(',').split(',').map((x) => x.trim()).filter(Boolean);
    for (const name of names) add(all('SELECT user_id FROM staff WHERE full_name = ?', name));
    add(all('SELECT assignee_id AS user_id FROM journey_steps WHERE sales_project_id = ?', p));
    add(all('SELECT ss.user_id FROM journey_step_supporters ss JOIN journey_steps j ON j.id = ss.step_id WHERE j.sales_project_id = ?', p));
  }
  const active = all<{ id: number; is_admin: number }>('SELECT id, is_admin FROM users WHERE is_active = 1');
  for (const u of active) if (seesAllCustomers(u) && userPermissions(u).has('customer.view')) ids.add(u.id);
  const activeIds = new Set(active.map((u) => u.id));
  return new Set([...ids].filter((id) => activeIds.has(id)));
}

/** Người mới được giao (chưa có trong before) phải là người tham gia dự án của khách hàng */
export function requireMembers(customerId: number, salesProjectId: number | null, userIds: (number | null | undefined)[], before: (number | null | undefined)[] = []) {
  const added = userIds.filter((id): id is number => !!id && !before.includes(id));
  if (!added.length) return;
  const members = customerMembers(customerId, salesProjectId);
  if (added.some((id) => !members.has(id))) {
    throw badRequest('Chỉ giao được cho người đang tham gia dự án của khách hàng (Sale, AM, BA/PM, Dev, Tester, người thực hiện / phối hợp bước) hoặc người được xem tất cả khách hàng');
  }
}
