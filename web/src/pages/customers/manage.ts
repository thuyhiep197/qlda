import { createContext, useContext } from 'react';
import { hasPerm, useMe } from '../../hooks';
import type { CustomerDetail } from '../../types';

/** Khách hàng chứa màn dự án / bước: chỉ id, tên (người không có Thông tin khách hàng – Xem không lấy được chi tiết khách hàng) */
export type CustomerRef = Pick<CustomerDetail, 'id' | 'name'> & Partial<Pick<CustomerDetail, 'code' | 'kd_ids' | 'am_ids'>>;

/**
 * Khách hàng / dự án đang mở có do mình quản lý không (phụ trách, thực hiện, phối hợp — server trả can_manage).
 * "Xem tất cả" (Thông tin khách hàng): mọi khách hàng, dự án đều coi như mình quản lý — thêm / sửa / lưu trữ / xóa theo quyền đang có.
 */
export const ManageContext = createContext(true);

/** Quyền ghi (thêm, sửa, lưu trữ, xóa) chỉ có hiệu lực khi đang quản lý; xem và tải về thì không cần */
export function canDo(has: boolean, perm: string, manages: boolean) {
  return has && (/\.(view|export)$/.test(perm) || manages);
}

/** can(perm): người dùng có quyền perm và (nếu là quyền ghi) đang quản lý khách hàng / dự án đang mở */
export function useCan() {
  const { data: me } = useMe();
  const manages = useContext(ManageContext);
  return (perm: string) => canDo(hasPerm(me, perm), perm, manages);
}
