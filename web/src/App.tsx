import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { applyTheme } from './theme';
import { hasPerm, useMe } from './hooks';
import { Spinner, Toaster, TooltipLayer, UpdateBanner } from './components/ui';
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
import AdminOrg from './pages/AdminOrg';
import ProjectShell from './pages/ProjectShell';
import Docs from './pages/Docs';
import AdminLayout from './pages/AdminLayout';
import Profile from './pages/Profile';
import Releases from './pages/Releases';
import { RELEASES_ENABLED } from './util';

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
          <Route index element={<Landing />} />
          <Route path="home" element={<Dashboard />} />
          <Route element={<ProjectShell />}>
          <Route path="projects" element={<Projects />} />
          <Route path="issues" element={<IssueList />} />
          <Route path="p/:key" element={<ProjectLayout />}>
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
          </Route>
          </Route>
          <Route path="docs" element={<Docs />} />
          <Route path="browse/:issueKey" element={<IssuePage />} />
          <Route path="profile" element={<Profile />} />
          <Route path="admin" element={<AdminLayout />}>
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
          </Route>
          {hasPerm(me, 'customer.view') && <Route path="customers" element={<CustomerWorkspace />} />}
          {hasPerm(me, 'customer.view') && <Route path="customers/:id" element={<CustomerWorkspace />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
      <TooltipLayer />
      <UpdateBanner />
    </>
  );
}
