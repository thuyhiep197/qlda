import type { Request } from 'express';
import { get } from './db.ts';
import { badRequest, forbidden, notFound, requireUserPerm, userPermissions, type AuthUser, type Permission } from './permissions.ts';

/**
 * Quyền xem khách hàng (kèm các dự án của khách hàng): Kinh doanh phụ trách, AM hỗ trợ của khách hàng hoặc của một dự án của khách hàng,
 * nhân sự Ban Giám đốc (nhân sự trong Danh mục nhân sự gắn với tài khoản của mình); người có quyền "Xem tất cả khách hàng" thấy mọi khách hàng.
 */
type U = Pick<AuthUser, 'id' | 'is_admin'>;

export const seesAllCustomers = (user: U) => userPermissions(user).has('customer_all.view');

/** Điều kiện SQL lọc khách hàng (bảng đặt bí danh c) mà người dùng được xem */
export function visibleCustomersSql(user: U): { sql: string; params: number[] } {
  if (seesAllCustomers(user)) return { sql: '1=1', params: [] };
  return {
    sql: `(EXISTS (SELECT 1 FROM staff b WHERE b.user_id = ? AND ',' || b.positions || ',' LIKE '%,bgd,%')
      OR EXISTS (SELECT 1 FROM customer_owners co JOIN staff s ON s.id = co.staff_id WHERE co.customer_id = c.id AND s.user_id = ?)
      OR EXISTS (SELECT 1 FROM sales_project_owners o JOIN sales_projects sp ON sp.id = o.sales_project_id JOIN staff s ON s.id = o.staff_id
        WHERE sp.customer_id = c.id AND s.user_id = ?))`,
    params: [user.id, user.id, user.id],
  };
}

export function canSeeCustomer(user: U, customerId: number) {
  const perms = userPermissions(user);
  if (!perms.has('customer.view')) return false;
  if (perms.has('customer_all.view')) return true;
  const v = visibleCustomersSql(user);
  return !!get(`SELECT 1 FROM customers c WHERE c.id = ? AND ${v.sql}`, customerId, ...v.params);
}

/** Khách hàng theo :id trên đường dẫn: cần quyền perm và được xem khách hàng này */
export function loadCustomer(req: Request, perm: Permission = 'customer.view') {
  requireUserPerm(req.user, perm);
  const c = get('SELECT * FROM customers WHERE id = ?', Number(req.params.id));
  if (!c) throw notFound('Không tìm thấy khách hàng');
  if (!canSeeCustomer(req.user, c.id)) throw forbidden('Bạn không phụ trách khách hàng này');
  return c;
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

/** Dự án của khách hàng được chọn (trống = chung của khách hàng); dự án phải thuộc khách hàng này */
export function projectOf(customerId: number, raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return null;
  const sp = get<{ id: number }>('SELECT id FROM sales_projects WHERE id = ? AND customer_id = ?', Number(raw), customerId);
  if (!sp) throw badRequest('Không tìm thấy dự án của khách hàng');
  return sp.id;
}

/** Nhân sự (Danh mục nhân sự) gắn với tài khoản */
export const staffOfUser = (userId: number) => get<{ id: number; full_name: string; positions: string }>('SELECT id, full_name, positions FROM staff WHERE user_id = ?', userId);
