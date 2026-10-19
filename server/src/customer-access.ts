import type { Request } from 'express';
import { get } from './db.ts';
import { badRequest, forbidden, notFound, requireUserPerm, userPermissions, type AuthUser, type Permission } from './permissions.ts';

/**
 * Phạm vi dữ liệu phân hệ Khách hàng:
 *  - Có quyền "Phạm vi: Tất cả khách hàng" (VD nhóm Ban Giám đốc) → mọi khách hàng, mọi dự án của khách hàng.
 *  - Còn lại chỉ người liên quan (nhân sự gắn với tài khoản của mình):
 *    · Phụ trách khách hàng (Kinh doanh phụ trách / AM hỗ trợ) → khách hàng đó và mọi dự án của khách hàng;
 *    · Phụ trách một dự án (Kinh doanh / AM của dự án), thực hiện hoặc phối hợp một bước hành trình, thực hiện một công việc của dự án
 *      → khách hàng đó và chỉ dự án đó;
 *    · Thực hiện một công việc chung của khách hàng → khách hàng đó (không kèm dự án nào).
 */
type U = Pick<AuthUser, 'id' | 'is_admin'>;

export const seesAllCustomers = (user: U) => userPermissions(user).has('customer_all.view');

/** Người dùng là Kinh doanh phụ trách / AM hỗ trợ của khách hàng (bí danh bảng khách hàng: col) */
const OWNS_CUSTOMER = (col: string) => `EXISTS (SELECT 1 FROM customer_owners co JOIN staff s ON s.id = co.staff_id WHERE co.customer_id = ${col} AND s.user_id = ?)`;
/** Người dùng liên quan tới dự án (bí danh bảng dự án của khách hàng: col): phụ trách, thực hiện / phối hợp bước, thực hiện công việc */
const IN_PROJECT = (col: string) => `(EXISTS (SELECT 1 FROM sales_project_owners o JOIN staff s ON s.id = o.staff_id WHERE o.sales_project_id = ${col} AND s.user_id = ?)
      OR EXISTS (SELECT 1 FROM journey_steps j WHERE j.sales_project_id = ${col} AND j.assignee_id = ?)
      OR EXISTS (SELECT 1 FROM journey_step_supporters ss JOIN journey_steps j ON j.id = ss.step_id WHERE j.sales_project_id = ${col} AND ss.user_id = ?)
      OR EXISTS (SELECT 1 FROM customer_tasks t WHERE t.sales_project_id = ${col} AND t.assignee_id = ?))`;

/** Điều kiện SQL lọc khách hàng (bảng đặt bí danh c) mà người dùng được xem */
export function visibleCustomersSql(user: U): { sql: string; params: number[] } {
  if (seesAllCustomers(user)) return { sql: '1=1', params: [] };
  return {
    sql: `(${OWNS_CUSTOMER('c.id')}
      OR EXISTS (SELECT 1 FROM sales_projects vsp WHERE vsp.customer_id = c.id AND ${IN_PROJECT('vsp.id')})
      OR EXISTS (SELECT 1 FROM customer_tasks t WHERE t.customer_id = c.id AND t.sales_project_id IS NULL AND t.assignee_id = ?))`,
    params: [user.id, user.id, user.id, user.id, user.id, user.id],
  };
}

/** Điều kiện SQL lọc dự án của khách hàng (bảng đặt bí danh sp) mà người dùng được xem */
export function visibleSalesProjectsSql(user: U): { sql: string; params: number[] } {
  if (seesAllCustomers(user)) return { sql: '1=1', params: [] };
  return { sql: `(${OWNS_CUSTOMER('sp.customer_id')} OR ${IN_PROJECT('sp.id')})`, params: [user.id, user.id, user.id, user.id, user.id] };
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

/** Khách hàng theo :id trên đường dẫn: cần quyền perm và được xem khách hàng này */
export function loadCustomer(req: Request, perm: Permission = 'customer.view') {
  requireUserPerm(req.user, perm);
  const c = get('SELECT * FROM customers WHERE id = ?', Number(req.params.id));
  if (!c) throw notFound('Không tìm thấy khách hàng');
  if (!canSeeCustomer(req.user, c.id)) throw forbidden('Bạn không phụ trách khách hàng này');
  return c;
}

/** Dự án của khách hàng theo id (thuộc khách hàng customerId): cần quyền perm và được xem dự án này */
export function loadSalesProjectOf(user: AuthUser, customerId: number, id: unknown, perm: Permission = 'sales_project.view') {
  requireUserPerm(user, perm);
  const sp = get('SELECT * FROM sales_projects WHERE id = ? AND customer_id = ?', Number(id), customerId);
  if (!sp) throw notFound('Không tìm thấy dự án của khách hàng');
  if (!canSeeSalesProject(user, sp.id)) throw forbidden('Bạn không phụ trách, thực hiện hoặc phối hợp dự án này');
  return sp;
}

/** Kinh doanh phụ trách phải là nhân sự Sale (kd), AM hỗ trợ phải là nhân sự AM (am) — khách hàng và dự án của khách hàng */
export function checkOwners(ids: number[], role: 'kd' | 'am') {
  const label = role === 'kd' ? 'Kinh doanh phụ trách' : 'AM hỗ trợ';
  for (const id of ids) {
    const st = get<{ positions: string }>('SELECT positions FROM staff WHERE id = ?', id);
    if (!st) throw badRequest(`${label} không có trong Danh mục nhân sự`);
    if (!st.positions.split(',').includes(role)) throw badRequest(`${label} phải là nhân sự ${role === 'kd' ? 'Sale' : 'AM'}`);
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
