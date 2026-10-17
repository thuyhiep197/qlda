import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookMarked, Building, ChevronDown, ChevronRight, Contact, MapPinned, Package, ScrollText, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { hasPerm, useMe } from '../hooks';

type Me = Parameters<typeof hasPerm>[0];
/** Danh mục trong Quản trị: Phòng ban, Địa chính, Sản phẩm, Nhân sự (mỗi mục theo quyền Xem) */
export const catalogItems = (me: Me): [string, string, LucideIcon][] => ([
  ['departments', 'Phòng ban', Building, 'department.view'], ['geo', 'Địa chính', MapPinned, 'geo.view'],
  ['products', 'Sản phẩm', Package, 'product.view'], ['staff', 'Nhân sự', Contact, 'staff.view'],
] as [string, string, LucideIcon, string][]).filter(([, , , p]) => hasPerm(me, p)).map(([k, l, i]) => [k, l, i]);

/** Các mục của phân hệ Quản trị (mục đầu tiên được mở khi bấm Quản trị) */
export function adminTabs(me: Me): [string, string, LucideIcon][] {
  return [
    ...(hasPerm(me, 'user.view') ? [['users', 'Người dùng', Users] as [string, string, LucideIcon]] : []),
    ...(hasPerm(me, 'role.view') ? [['roles', 'Phân quyền', ShieldCheck] as [string, string, LucideIcon]] : []),
    ...catalogItems(me),
    ...(hasPerm(me, 'user.view') ? [['audit', 'Nhật ký bảo mật', ScrollText] as [string, string, LucideIcon]] : []),
  ];
}

/** Phân hệ Quản trị — cùng bố cục với Khách hàng: cột trái là menu (Người dùng · Phân quyền · Danh mục ▸ · Nhật ký bảo mật), giữa là nội dung */
export default function AdminLayout() {
  const { data: me } = useMe();
  const seg = useLocation().pathname.split('/')[2];
  const [catOpen, setCatOpen] = useState(true);
  const tabs = adminTabs(me);
  const cats = catalogItems(me);
  if (!tabs.length) return <Navigate to="/" replace />;
  if (!seg) return <Navigate to={`/admin/${tabs[0][0]}`} replace />;
  if (seg === 'catalogs') return <Navigate to={cats.length ? `/admin/${cats[0][0]}` : '/admin'} replace />;
  const item = ([k, l, Icon]: [string, string, LucideIcon], sub?: boolean) => (
    <NavLink key={k} to={`/admin/${k}`} className={({ isActive }) => `${sub ? 'cw-sub' : 'cw-item'} ${isActive ? 'active' : ''}`}>
      <Icon size={sub ? 14 : 16} /><span className="grow ellipsis">{l}</span>
    </NavLink>
  );
  return (
    <div className="cw">
      <aside className="cw-left">
        {hasPerm(me, 'user.view') && item(['users', 'Người dùng', Users])}
        {hasPerm(me, 'role.view') && item(['roles', 'Phân quyền', ShieldCheck])}
        {cats.length > 0 && (
          <div className="cw-group">
            <div className={`cw-item ${cats.some(([k]) => k === seg) ? 'cw-parent-active' : ''}`}>
              <button className="cw-caret" aria-label={catOpen ? 'Thu gọn' : 'Mở rộng'} onClick={() => setCatOpen(!catOpen)}>
                {catOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <span className="cw-group-link"><BookMarked size={16} /><span className="grow">Danh mục</span></span>
            </div>
            {catOpen && cats.map((c) => item(c, true))}
          </div>
        )}
        {hasPerm(me, 'user.view') && item(['audit', 'Nhật ký bảo mật', ScrollText])}
      </aside>
      <section className="cw-page"><Outlet /></section>
    </div>
  );
}
