import { createContext, useContext } from 'react';
import { hasPerm, useMe } from '../../hooks';

/**
 * Khách hàng / dự án đang mở có do mình quản lý không (phụ trách, thực hiện, phối hợp — server trả can_manage).
 * "Xem tất cả" chỉ mở rộng phạm vi xem: thêm / sửa / lưu trữ / xóa còn cần đang quản lý khách hàng, dự án đó.
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
