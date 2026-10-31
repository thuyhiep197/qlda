import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { applyTheme } from './theme';
import { hasPerm, hasSubsystem, useMe } from './hooks';
import { Empty, Spinner, Toaster, TooltipLayer, UpdateBanner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectLayout, { Landing, ProjectHome } from './pages/ProjectLayout';
import Backlog from './pages/Backlog';
import Board from './pages/Board';
import IssueList from './pages/IssueList';
import Roadmap from './pages/Roadmap';
import Plan from './pages/Plan';
import ProjectSettings from './pages/ProjectSettings';
import IssuePage from './pages/IssuePage';
import AdminUsers from './pages/AdminUsers';
import AdminRoles from './pages/AdminRoles';
import AdminAudit from './pages/AdminAudit';
import CustomerWorkspace from './pages/customers/CustomerWorkspace';
import AdminGeo from './pages/AdminGeo';
import AdminProducts from './pages/AdminProducts';
import AdminCustomerStatuses from './pages/AdminCustomerStatuses';
import AdminOrg from './pages/AdminOrg';
import ProjectShell from './pages/ProjectShell';
import Docs from './pages/Docs';
import AdminLayout from './pages/AdminLayout';
import Profile from './pages/Profile';
import Releases from './pages/Releases';
import HelpPage from './help/HelpPage';
import { RELEASES_ENABLED } from './util';

/** Tài khoản không thấy phân hệ nào */
function NoSubsystem() {
  return <div className="page"><Empty title="Tài khoản chưa được cấp quyền phân hệ nào. Liên hệ quản trị hệ thống." /></div>;
}

export default function App() {
  const { data: me, isLoading } = useMe();
  // Giao diện sáng/tối theo cài đặt của tài khoản đang đăng nhập
  const theme = me?.preferences?.theme;
  useEffect(() => { if (me) applyTheme(theme); }, [me, theme]);
  if (isLoading) return <Spinner />;
  if (!me) return <><Login /><Toaster /></>;
  if (me.must_change_password) return <><ChangePassword forced /><Toaster /></>;

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          {/* Trang đầu: phân hệ đầu tiên thấy được theo thứ tự Dashboard → Khách hàng → Dự án → Tài liệu → Quản trị */}
          <Route index element={hasSubsystem(me, 'dashboard') ? <Navigate to="/home" replace /> : hasSubsystem(me, 'customer') ? <Navigate to="/customers" replace />
            : hasSubsystem(me, 'project') ? <Landing /> : hasSubsystem(me, 'docs') ? <Navigate to="/docs" replace />
            : hasSubsystem(me, 'admin') ? <Navigate to="/admin" replace /> : <NoSubsystem />} />
          {hasSubsystem(me, 'dashboard') && <Route path="home" element={<Dashboard />} />}
          <Route element={<ProjectShell />}>
          {/* Phân hệ Dự án: chỉ khi có ô Xem nào của phân hệ Dự án; danh sách issue chung cần thêm Danh sách & tìm kiếm issue – Xem */}
          {hasSubsystem(me, 'project') && <Route path="projects" element={<Projects />} />}
          {hasSubsystem(me, 'project') && hasPerm(me, 'search.view') && <Route path="issues" element={<IssueList />} />}
          {hasSubsystem(me, 'project') && <Route path="p/:key" element={<ProjectLayout />}>
            <Route index element={<ProjectHome />} />
            <Route path="info" element={<ProjectSettings />} />
            <Route path="dashboard" element={null} />
            <Route path="plan" element={<Plan />} />
            <Route path="backlog" element={<Backlog />} />
            <Route path="board" element={<Board />} />
            <Route path="issues" element={<IssueList />} />
            <Route path="roadmap" element={<Roadmap />} />
            {RELEASES_ENABLED && <Route path="releases" element={<Releases />} />}
            <Route path="settings" element={null} />
          </Route>}
          </Route>
          {hasSubsystem(me, 'docs') && <Route path="docs" element={<Docs />} />}
          {hasSubsystem(me, 'project') && <Route path="browse/:issueKey" element={<IssuePage />} />}
          <Route path="profile" element={<Profile />} />
          {/* Hướng dẫn sử dụng: mọi tài khoản; bài hiện theo quyền của người xem */}
          <Route path="help" element={<HelpPage />} />
          <Route path="help/:id" element={<HelpPage />} />
          {hasSubsystem(me, 'admin') && <Route path="admin" element={<AdminLayout />}>
            <Route index element={null} />
            {hasPerm(me, 'user.view') && <Route path="users" element={<AdminUsers />} />}
            {hasPerm(me, 'role.view') && <Route path="roles" element={<AdminRoles />} />}
            {hasPerm(me, 'user.view') && <Route path="audit" element={<AdminAudit />} />}
            <Route path="catalogs" element={null} />
            {(hasPerm(me, 'department.view') || hasPerm(me, 'staff.view')) && <Route path="org" element={<AdminOrg />} />}
            <Route path="departments" element={null} />
            <Route path="staff" element={null} />
            {hasPerm(me, 'geo.view') && <Route path="geo" element={<AdminGeo />} />}
            {hasPerm(me, 'product.view') && <Route path="products" element={<AdminProducts />} />}
            {hasPerm(me, 'cstatus.view') && <Route path="customer-statuses" element={<AdminCustomerStatuses />} />}
          </Route>}
          {/* Phân hệ Khách hàng: có ô Xem nào của phân hệ (VD chỉ Hành trình – Xem vẫn vào được không gian khách hàng) */}
          {hasSubsystem(me, 'customer') && <Route path="customers" element={<CustomerWorkspace />} />}
          {hasSubsystem(me, 'customer') && <Route path="customers/:id" element={<CustomerWorkspace />} />}
          {hasSubsystem(me, 'customer') && <Route path="customers/:id/p/:pid" element={<CustomerWorkspace />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
      <TooltipLayer />
      <UpdateBanner />
    </>
  );
}
