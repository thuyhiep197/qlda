import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookMarked, ScrollText, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { hasPerm, useMe } from '../hooks';

/** Phân hệ Quản trị: Người dùng · Phân quyền · Danh mục · Nhật ký bảo mật (mỗi mục theo quyền Xem) */
export function adminTabs(me: Parameters<typeof hasPerm>[0]): [string, string, LucideIcon][] {
  return ([
    ['users', 'Người dùng', Users, hasPerm(me, 'user.view')],
    ['roles', 'Phân quyền', ShieldCheck, hasPerm(me, 'role.view')],
    ['catalogs', 'Danh mục', BookMarked, hasPerm(me, 'department.view') || hasPerm(me, 'geo.view') || hasPerm(me, 'product.view') || hasPerm(me, 'staff.view')],
    ['audit', 'Nhật ký bảo mật', ScrollText, hasPerm(me, 'user.view')],
  ] as [string, string, LucideIcon, boolean][]).filter((t) => t[3]).map(([k, l, i]) => [k, l, i]);
}

export default function AdminLayout() {
  const { data: me } = useMe();
  const tabs = adminTabs(me);
  const seg = useLocation().pathname.split('/')[2];
  if (!tabs.length) return <Navigate to="/" replace />;
  if (!seg) return <Navigate to={`/admin/${tabs[0][0]}`} replace />;
  return (
    <>
      <div className="catalog-tabs">
        <nav className="tabs">{tabs.map(([k, l, Icon]) => <NavLink key={k} to={`/admin/${k}`}><Icon size={16} /> {l}</NavLink>)}</nav>
      </div>
      <Outlet />
    </>
  );
}
