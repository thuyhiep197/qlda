import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookMarked, ChevronDown, ChevronRight, ListChecks, MapPinned, Network, Package, ScrollText, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { hasPerm, useMe } from '../hooks';

type Me = Parameters<typeof hasPerm>[0];
/** Danh mục trong Quản trị: Phòng ban & Nhân sự (sơ đồ tổ chức), Địa chính, Sản phẩm, Tình trạng khách hàng (mỗi mục theo quyền Xem) */
export const catalogItems = (me: Me): [string, string, LucideIcon][] => ([
  ['org', 'Phòng ban & Nhân sự', Network, hasPerm(me, 'department.view') || hasPerm(me, 'staff.view')],
  ['geo', 'Địa chính', MapPinned, hasPerm(me, 'geo.view')], ['products', 'Sản phẩm', Package, hasPerm(me, 'product.view')],
  ['customer-statuses', 'Tình trạng khách hàng', ListChecks, hasPerm(me, 'cstatus.view')],
] as [string, string, LucideIcon, boolean][]).filter(([, , , ok]) => ok).map(([k, l, i]) => [k, l, i]);

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
  if (seg === 'departments' || seg === 'staff') return <Navigate to="/admin/org" replace />;
  if (seg === 'catalogs') return <Navigate to={cats.length ? `/admin/${cats[0][0]}` : '/admin'} replace />;
  const item = ([k, l, Icon]: [string, string, LucideIcon], sub?: boolean) => (
    <NavLink key={k} to={`/admin/${k}`} className={({ isActive }) => `${sub ? 'cw-sub' : 'cw-item'} ${isActive ? 'active' : ''}`}>
      <Icon size={sub ? 14 : 16} /><span className="grow ellipsis">{l}</span>
    </NavLink>
  );
  return (
    <div className="cw cw-admin">
      <aside className="cw-left">
        {hasPerm(me, 'user.view') && item(['users', 'Người dùng', Users])}
        {hasPerm(me, 'role.view') && item(['roles', 'Phân quyền', ShieldCheck])}
        {cats.length > 0 && (
          <div className="cw-group">
            {/* Cùng cấp với Người dùng / Phân quyền; mũi tên thu gọn đặt cuối dòng để thẳng hàng */}
            <button className={`cw-item ${cats.some(([k]) => k === seg) ? 'cw-parent-active' : ''}`} aria-expanded={catOpen} onClick={() => setCatOpen(!catOpen)}>
              <BookMarked size={16} /><span className="grow">Danh mục</span>
              {catOpen ? <ChevronDown size={14} className="muted" /> : <ChevronRight size={14} className="muted" />}
            </button>
            {catOpen && cats.map((c) => item(c, true))}
          </div>
        )}
        {hasPerm(me, 'user.view') && item(['audit', 'Nhật ký bảo mật', ScrollText])}
      </aside>
      <section className="cw-page"><Outlet /></section>
    </div>
  );
}
