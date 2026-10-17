import { useSearchParams } from 'react-router-dom';
import { Contact, MapPinned, Package, type LucideIcon } from 'lucide-react';
import { hasPerm, useMe } from '../hooks';
import AdminGeo from './AdminGeo';
import AdminProducts from './AdminProducts';
import AdminStaff from './AdminStaff';

type Tab = 'geo' | 'products' | 'staff';

/** Quản trị hệ thống → Danh mục: Danh mục địa chính, Danh mục sản phẩm, Danh mục nhân sự (mỗi tab theo quyền Xem của danh mục đó) */
export default function AdminCatalogs() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const tabs = ([['geo', 'Địa chính', MapPinned, 'geo.view'], ['products', 'Sản phẩm', Package, 'product.view'], ['staff', 'Nhân sự', Contact, 'staff.view']] as [Tab, string, LucideIcon, string][])
    .filter(([, , , perm]) => hasPerm(me, perm));
  const tab = tabs.find(([t]) => t === params.get('tab'))?.[0] ?? tabs[0]?.[0];
  return (
    <>
      <div className="catalog-tabs">
        <nav className="tabs tabs-sub">
          {tabs.map(([t, label, Icon]) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setParams({ tab: t }, { replace: true })}><Icon size={16} /> {label}</button>
          ))}
        </nav>
      </div>
      {tab === 'geo' && <AdminGeo />}
      {tab === 'products' && <AdminProducts />}
      {tab === 'staff' && <AdminStaff />}
    </>
  );
}
