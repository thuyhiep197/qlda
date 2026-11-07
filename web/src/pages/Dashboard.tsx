import { hasPerm, hasProjectModule, useMe } from '../hooks';
import { CustomerStats, ProjectStats } from '../components/DashboardStats';
import { Empty } from '../components/ui';
import { HelpButton } from '../help/HelpMenu';

/** Dashboard chỉ gồm thống kê: khối Khách hàng cần Thông tin khách hàng – Xem, khối Dự án cần Dự án – Xem (khớp server) */
export default function Dashboard() {
  const { data: me } = useMe();
  const canCustomers = hasPerm(me, 'customer.view');
  const canProjects = hasProjectModule(me) && hasPerm(me, 'project.view');
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <div className="page dash-page">
      <h1>{greet}, {me?.full_name} <HelpButton /></h1>
      {canCustomers && <CustomerStats />}
      {canProjects && <ProjectStats />}
      {me && !canCustomers && !canProjects && <Empty title="Bạn chưa có quyền xem thống kê nào" />}
    </div>
  );
}
