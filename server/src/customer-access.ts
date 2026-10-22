import type { Request } from 'express';
import { all, get } from './db.ts';
import { badRequest, forbidden, hasSubsystem, notFound, requireUserPerm, userPermissions, type AuthUser, type Permission } from './permissions.ts';

/**
 * Phạm vi dữ liệu phân hệ Khách hàng.
 * Liên quan (nhân sự gắn với tài khoản của mình):
 *  · Kinh doanh phụ trách (Sale / BGĐ) / AM hỗ trợ của khách hàng → khách hàng đó và mọi dự án của khách hàng;
 *  · Phụ trách một dự án (Kinh doanh / AM của dự án), thực hiện hoặc phối hợp một bước hành trình, thực hiện một công việc của dự án
 *    → khách hàng đó và chỉ dự án đó;
 *  · Thực hiện một công việc chung của khách hàng → khách hàng đó (không kèm dự án nào).
 * Xem: người liên quan; có quyền "Thông tin khách hàng – Xem tất cả" thì xem mọi khách hàng, mọi dự án.
 * "Xem tất cả" là phạm vi cao nhất: mọi quyền đang có (xem, thêm, sửa, lưu trữ, tải…) áp dụng trên mọi khách hàng, dự án;
 * chỉ có "Xem" thì các quyền chỉ áp dụng trên khách hàng, dự án mình liên quan.
 * Quản trị hệ thống: toàn quyền trên mọi khách hàng.
 *
 * Người chỉ tham gia (hành trình, công việc, tài liệu, trao đổi) không cần "Thông tin khách hàng – Xem":
 *  · Dùng phân hệ khi có một ô Xem bất kỳ của phân hệ (CUSTOMER_VIEWS); phạm vi dự án như trên (Xem tất cả → mọi dự án).
 *  · Không có "Thông tin khách hàng – Xem": cây / danh sách chỉ có tên khách hàng (và tỉnh) chứa dự án trong phạm vi;
 *    không mở được màn khách hàng (thông tin, đầu mối, Sale/AM, việc / tài liệu / trao đổi chung của khách hàng).
 *  · Màn dự án vào được khi dự án trong phạm vi; thông tin dự án cần "Dự án của khách hàng – Xem";
 *    hành trình, công việc, tài liệu, trao đổi của dự án theo ô quyền riêng của từng chức năng.
 */
type U = Pick<AuthUser, 'id' | 'is_admin'>;

/** Có một ô Xem bất kỳ của phân hệ Khách hàng (SUBSYSTEM_VIEW_CELLS.customer) mới dùng được phân hệ */
export const hasCustomerSubsystem = (perms: Set<Permission>) => hasSubsystem(perms, 'customer');
/** Không có ô Xem nào của phân hệ Khách hàng → 403 */
export function requireCustomerSubsystem(user: U) {
  if (!hasCustomerSubsystem(userPermissions(user))) throw forbidden();
}

export const seesAllCustomers = (user: U) => userPermissions(user).has('customer.view_all');
/** Hành động ghi (thêm, sửa, lưu trữ, xóa) — xem và tải về là hành động đọc */
export const isWrite = (perm: Permission) => !/\.(view|export)$/.test(perm);

/** Người dùng là Kinh doanh phụ trách / AM hỗ trợ của khách hàng (bí danh bảng khách hàng: col) */
const OWNS_CUSTOMER = (col: string) => `EXISTS (SELECT 1 FROM customer_owners co WHERE co.customer_id = ${col} AND co.user_id = ?)`;
/** Người dùng tham gia dự án (bí danh bảng dự án của khách hàng: col): Sale / AM / BA / Dev / Tester của dự án, thực hiện / phối hợp bước, thực hiện công việc */
const IN_PROJECT = (col: string) => `(EXISTS (SELECT 1 FROM sales_project_owners o WHERE o.sales_project_id = ${col} AND o.user_id = ?)
      OR EXISTS (SELECT 1 FROM journey_steps j WHERE j.sales_project_id = ${col} AND j.assignee_id = ?)
      OR EXISTS (SELECT 1 FROM journey_step_supporters ss JOIN journey_steps j ON j.id = ss.step_id WHERE j.sales_project_id = ${col} AND ss.user_id = ?)
      OR EXISTS (SELECT 1 FROM customer_tasks t WHERE t.sales_project_id = ${col} AND t.assignee_id = ?))`;

/** Điều kiện SQL: khách hàng (bí danh c) người dùng liên quan (tham gia) — không xét Xem tất cả; dùng cho "Khách hàng của tôi" */
export function relatedCustomersSql(user: U) {
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

/** Được thêm / sửa / lưu trữ trên khách hàng này: quản trị hệ thống, Xem tất cả khách hàng, hoặc người liên quan */
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

/** Được xem thông tin khách hàng (màn khách hàng): quyền Thông tin khách hàng – Xem và khách hàng trong phạm vi */
export function canSeeCustomer(user: U, customerId: number) {
  const perms = userPermissions(user);
  if (!perms.has('customer.view')) return false;
  if (perms.has('customer.view_all')) return true;
  const v = visibleCustomersSql(user);
  return !!get(`SELECT 1 FROM customers c WHERE c.id = ? AND ${v.sql}`, customerId, ...v.params);
}

/** Dự án trong phạm vi: có một ô Xem của phân hệ Khách hàng và (Xem tất cả hoặc mình tham gia dự án) — không cần Thông tin khách hàng – Xem */
export function canSeeSalesProject(user: U, salesProjectId: number) {
  if (!hasCustomerSubsystem(userPermissions(user))) return false;
  const v = visibleSalesProjectsSql(user);
  return !!get(`SELECT 1 FROM sales_projects sp WHERE sp.id = ? AND ${v.sql}`, salesProjectId, ...v.params);
}

const NOT_MANAGED = 'Khách hàng / dự án này không do bạn phụ trách, thực hiện hoặc phối hợp';

/** Khách hàng theo :id trên đường dẫn (màn khách hàng): cần quyền perm, được xem thông tin khách hàng; hành động ghi thì phải liên quan tới khách hàng */
export function loadCustomer(req: Request, perm: Permission = 'customer.view') {
  requireUserPerm(req.user, perm);
  const c = get('SELECT * FROM customers WHERE id = ?', Number(req.params.id));
  if (!c) throw notFound('Không tìm thấy khách hàng');
  if (!canSeeCustomer(req.user, c.id)) throw forbidden('Bạn không được xem thông tin khách hàng này');
  if (isWrite(perm) && !managesCustomer(req.user, c.id)) throw forbidden(NOT_MANAGED);
  return c;
}

/**
 * Khách hàng theo :id chỉ làm "vỏ" cho mục của một dự án (hành trình, lịch gọi, việc / tài liệu / trao đổi):
 * cần quyền perm (không truyền = một ô Xem bất kỳ của phân hệ); phạm vi xét ở dự án (loadSalesProjectOf, projectOf)
 * hoặc ở khách hàng với mục chung (requireCustomerInfo). Chỉ trả id, tên.
 */
export function loadCustomerRef(req: Request, perm?: Permission) {
  if (perm) requireUserPerm(req.user, perm);
  else requireCustomerSubsystem(req.user);
  const c = get<{ id: number; name: string }>('SELECT id, name FROM customers WHERE id = ?', Number(req.params.id));
  if (!c) throw notFound('Không tìm thấy khách hàng');
  return c;
}

/** Người được nhắc (@) trong Trao đổi: trao đổi của khách hàng → Sale / AM của khách hàng; của dự án (và các bước) → Sale / AM / BA / Dev / Tester của dự án */
export function mentionableIds(customerId: number, salesProjectId: number | null): number[] {
  return (salesProjectId
    ? all<{ id: number }>('SELECT DISTINCT o.user_id AS id FROM sales_project_owners o JOIN users u ON u.id = o.user_id WHERE o.sales_project_id = ? AND u.is_active = 1', salesProjectId)
    : all<{ id: number }>('SELECT DISTINCT co.user_id AS id FROM customer_owners co JOIN users u ON u.id = co.user_id WHERE co.customer_id = ? AND u.is_active = 1', customerId)).map((x) => x.id);
}

/** Người tham gia mục chung của khách hàng (việc, tài liệu, trao đổi chung): Sale / AM của khách hàng hoặc người được xem tất cả khách hàng */
export function ownsCustomer(user: U, customerId: number) {
  return !!user.is_admin || seesAllCustomers(user) || !!get('SELECT 1 FROM customer_owners WHERE customer_id = ? AND user_id = ?', customerId, user.id);
}

/** Mục chung của khách hàng (không thuộc dự án) nằm ở màn khách hàng: cần Thông tin khách hàng – Xem, khách hàng trong phạm vi và là người tham gia (ownsCustomer) */
export function requireCustomerInfo(user: U, customerId: number) {
  if (!canSeeCustomer(user, customerId)) throw forbidden('Mục chung của khách hàng cần quyền Thông tin khách hàng – Xem');
  if (!ownsCustomer(user, customerId)) throw forbidden('Việc, tài liệu, trao đổi chung của khách hàng chỉ dành cho Sale / AM của khách hàng và người được xem tất cả khách hàng');
}

/** Hành động ghi trên một mục của khách hàng (việc, tài liệu, trao đổi): mục chung → liên quan khách hàng; mục của dự án → liên quan dự án */
export function requireManage(user: AuthUser, customerId: number, salesProjectId: number | null) {
  if (salesProjectId ? !managesSalesProject(user, salesProjectId) : !managesCustomer(user, customerId)) throw forbidden(NOT_MANAGED);
}

/**
 * Dự án của khách hàng theo id (thuộc khách hàng customerId): cần quyền perm (không truyền = một ô Xem bất kỳ của phân hệ)
 * và dự án trong phạm vi; hành động ghi thì phải liên quan tới dự án
 */
export function loadSalesProjectOf(user: AuthUser, customerId: number, id: unknown, perm?: Permission) {
  if (perm) requireUserPerm(user, perm);
  else requireCustomerSubsystem(user);
  const sp = get('SELECT * FROM sales_projects WHERE id = ? AND customer_id = ?', Number(id), customerId);
  if (!sp) throw notFound('Không tìm thấy dự án của khách hàng');
  if (!canSeeSalesProject(user, sp.id)) throw forbidden('Bạn không phụ trách, thực hiện hoặc phối hợp dự án này');
  if (perm && isWrite(perm) && !managesSalesProject(user, sp.id)) throw forbidden(NOT_MANAGED);
  return sp;
}


/** Dự án của khách hàng được chọn (trống = chung của khách hàng); dự án phải thuộc khách hàng này và trong phạm vi */
export function projectOf(user: AuthUser, customerId: number, raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return null;
  const sp = get<{ id: number }>('SELECT id FROM sales_projects WHERE id = ? AND customer_id = ?', Number(raw), customerId);
  if (!sp) throw badRequest('Không tìm thấy dự án của khách hàng');
  if (!canSeeSalesProject(user, sp.id)) throw forbidden('Bạn không phụ trách, thực hiện hoặc phối hợp dự án này');
  return sp.id;
}


/**
 * Người tham gia dự án của khách hàng — chỉ những người này được giao việc, lịch gọi, thực hiện / phối hợp bước:
 * Sale / AM của khách hàng, Sale / AM, BA/PM, Dev, Tester của dự án, người thực hiện / phối hợp bước của dự án,
 * cùng người được xem tất cả khách hàng. salesProjectId = null (việc chung của khách hàng): gộp mọi dự án của khách hàng.
 */
export function customerMembers(customerId: number, salesProjectId: number | null): Set<number> {
  const ids = new Set<number>();
  const add = (rows: { user_id: number | null }[]) => { for (const r of rows) if (r.user_id) ids.add(r.user_id); };
  add(all('SELECT user_id FROM customer_owners WHERE customer_id = ?', customerId));
  // Mục chung của khách hàng: chỉ Sale / AM của khách hàng (+ người xem tất cả); mục của dự án: thêm người tham gia dự án
  const projects = salesProjectId ? [salesProjectId] : [];
  for (const p of projects) {
    // Sale, AM, BA/PM, Dev, Tester của dự án
    add(all('SELECT user_id FROM sales_project_owners WHERE sales_project_id = ?', p));
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

/**
 * Dự án sản xuất liên kết với khách hàng mà người dùng được vào (xem theo quyền phân hệ Dự án của mình):
 * dự án sản xuất của khách hàng mình là Sale / AM (hoặc được xem tất cả khách hàng),
 * và dự án sản xuất gắn với dự án của khách hàng mà mình được xem.
 */
export function linkedProjectIds(user: U): number[] {
  const perms = userPermissions(user);
  if (!perms.has('customer.view')) return [];
  const byCustomer = perms.has('customer.view_all')
    ? all<{ id: number }>('SELECT id FROM projects WHERE customer_id IS NOT NULL')
    : all<{ id: number }>('SELECT p.id FROM projects p JOIN customer_owners co ON co.customer_id = p.customer_id WHERE co.user_id = ?', user.id);
  const v = visibleSalesProjectsSql(user);
  const bySalesProject = perms.has('sales_project.view')
    ? all<{ id: number }>(`SELECT sp.project_id AS id FROM sales_projects sp WHERE sp.project_id IS NOT NULL AND ${v.sql}`, ...v.params) : [];
  return [...new Set([...byCustomer, ...bySalesProject].map((x) => x.id))];
}
