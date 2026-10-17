import type { Request } from 'express';
import { get } from './db.ts';
import { forbidden, notFound, requireUserPerm, userPermissions, type AuthUser, type Permission } from './permissions.ts';

/**
 * Quyền xem khách hàng: người có quyền "Xem tất cả khách hàng" thấy mọi khách hàng;
 * người khác chỉ thấy khách hàng mình phụ trách (nhân sự trong Danh mục nhân sự gắn với tài khoản của mình),
 * hoặc khách hàng có việc kinh doanh / bước hành trình đang giao cho mình.
 */
type U = Pick<AuthUser, 'id' | 'is_admin'>;

export const seesAllCustomers = (user: U) => userPermissions(user).has('customer_all.view');

/** Điều kiện SQL lọc khách hàng (bảng đặt bí danh c) mà người dùng được xem */
export function visibleCustomersSql(user: U): { sql: string; params: number[] } {
  if (seesAllCustomers(user)) return { sql: '1=1', params: [] };
  return {
    sql: `(EXISTS (SELECT 1 FROM customer_owners co JOIN staff s ON s.id = co.staff_id WHERE co.customer_id = c.id AND s.user_id = ?)
      OR EXISTS (SELECT 1 FROM customer_tasks t WHERE t.customer_id = c.id AND t.assignee_id = ?)
      OR EXISTS (SELECT 1 FROM journey_steps j WHERE j.customer_id = c.id AND j.assignee_id = ?))`,
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

/** Nhân sự (Danh mục nhân sự) gắn với tài khoản */
export const staffOfUser = (userId: number) => get<{ id: number; full_name: string; positions: string }>('SELECT id, full_name, positions FROM staff WHERE user_id = ?', userId);
